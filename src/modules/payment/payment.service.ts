import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import {
  AuditAction,
  PaymentStatus,
  Role,
  ShipmentStatus,
} from "../../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { stripe } from "../../config/stripe.js";
import { AppError } from "../../errors/AppError.js";
import type { AuthUser } from "../../types/express.js";
import { recordAudit } from "../../utils/auditLog.js";
import { invalidateCache } from "../../utils/cache.js";
import { buildPaginatedResult, getPagination } from "../../utils/pagination.js";
import type { PaymentQuery } from "./payment.validation.js";

const CURRENCY = "bdt";
const CHECKOUT_EXPIRY_SECONDS = 30 * 60;

const paymentInclude = {
  shipment: { select: { id: true, trackingNumber: true, status: true, paidAt: true } },
} as const;

const toCheckoutResponse = (paymentId: string, session: Stripe.Checkout.Session) => ({
  paymentId,
  sessionId: session.id,
  checkoutUrl: session.url,
  amount: (session.amount_total ?? 0) / 100,
  currency: session.currency,
  expiresAt: new Date(session.expires_at * 1000),
});

const initiatePayment = async (user: AuthUser, shipmentId: string) => {
  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, customerId: user.id, deletedAt: null },
    include: { originHub: true, destinationHub: true },
  });
  if (!shipment) {
    throw new AppError(404, "Shipment not found");
  }
  if (shipment.paidAt) {
    throw new AppError(409, "Shipment has already been paid");
  }
  if (shipment.status !== ShipmentStatus.PENDING) {
    throw new AppError(409, `Payment is not allowed for a ${shipment.status} shipment`);
  }

  const pending = await prisma.payment.findFirst({
    where: { shipmentId, status: PaymentStatus.PENDING },
    orderBy: { createdAt: "desc" },
  });
  if (pending) {
    const session = await stripe.checkout.sessions.retrieve(pending.stripeSessionId);
    if (
      session.status === "open" &&
      session.amount_total === Math.round(Number(shipment.price) * 100)
    ) {
      return toCheckoutResponse(pending.id, session);
    }
    await prisma.payment.update({
      where: { id: pending.id },
      data: { status: PaymentStatus.CANCELLED },
    });
  }

  const paymentId = randomUUID();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    client_reference_id: shipment.id,
    metadata: { paymentId, shipmentId: shipment.id, userId: user.id },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: Math.round(Number(shipment.price) * 100),
          product_data: {
            name: `Delivery charge for ${shipment.trackingNumber}`,
            description: `${shipment.originHub.city} to ${shipment.destinationHub.city}, ${shipment.parcelType.toLowerCase()} parcel`,
          },
        },
      },
    ],
    success_url: `${env.APP_URL}/api/v1/payments/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_URL}/api/v1/payments/cancel?payment_id=${paymentId}`,
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRY_SECONDS,
  });

  await prisma.payment.create({
    data: {
      id: paymentId,
      shipmentId: shipment.id,
      userId: user.id,
      amount: shipment.price,
      currency: CURRENCY,
      stripeSessionId: session.id,
    },
  });

  return toCheckoutResponse(paymentId, session);
};

const fulfillCheckout = async (sessionId: string) => {
  const payment = await prisma.payment.findUnique({ where: { stripeSessionId: sessionId } });
  if (!payment) return null;

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status === "unpaid") {
    return prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  const fulfilled = await prisma.$transaction(async (tx) => {
    const paidAt = new Date();
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: PaymentStatus.PAID } },
      data: { status: PaymentStatus.PAID, stripePaymentIntentId: paymentIntentId ?? null, paidAt },
    });

    if (count === 1) {
      const shipment = await tx.shipment.update({
        where: { id: payment.shipmentId },
        data: { paidAt },
      });
      await tx.trackingEvent.create({
        data: {
          shipmentId: shipment.id,
          status: shipment.status,
          actorId: payment.userId,
          note: "Delivery charge paid online",
        },
      });
      await recordAudit(tx, {
        actorId: payment.userId,
        action: AuditAction.PAYMENT_COMPLETED,
        entity: "Payment",
        entityId: payment.id,
        before: { status: payment.status },
        after: { status: PaymentStatus.PAID, stripePaymentIntentId: paymentIntentId },
      });
    }

    return tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
  });

  await invalidateCache("admin:stats");
  return fulfilled;
};

const markSessionStatus = (sessionId: string, status: PaymentStatus) =>
  prisma.payment.updateMany({
    where: { stripeSessionId: sessionId, status: PaymentStatus.PENDING },
    data: { status },
  });

const handleWebhook = async (payload: Buffer, signature: string | undefined) => {
  if (!signature) {
    throw new AppError(400, "Missing Stripe signature header");
  }

  const event = stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await fulfillCheckout(event.data.object.id);
      break;
    case "checkout.session.async_payment_failed":
      await markSessionStatus(event.data.object.id, PaymentStatus.FAILED);
      break;
    case "checkout.session.expired":
      await markSessionStatus(event.data.object.id, PaymentStatus.EXPIRED);
      break;
    default:
      break;
  }

  return { received: true, type: event.type };
};

const verifySuccess = async (sessionId: string) => {
  const payment = await fulfillCheckout(sessionId);
  if (!payment) {
    throw new AppError(404, "Payment session not found");
  }
  return payment;
};

const cancelCheckout = async (paymentId: string) => {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) {
    throw new AppError(404, "Payment not found");
  }
  if (payment.status !== PaymentStatus.PENDING) {
    return prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude });
  }

  const session = await stripe.checkout.sessions.retrieve(payment.stripeSessionId);
  if (session.status === "complete") {
    return verifySuccess(session.id);
  }
  if (session.status === "open") {
    await stripe.checkout.sessions.expire(session.id);
  }

  await markSessionStatus(session.id, PaymentStatus.CANCELLED);
  return prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude });
};

const getMyPayments = async (user: AuthUser, query: PaymentQuery) => {
  const { page, limit, sortOrder, status } = query;
  const where = { userId: user.id, ...(status && { status }) };

  const [items, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: { createdAt: sortOrder },
      ...getPagination(page, limit),
    }),
    prisma.payment.count({ where }),
  ]);

  return buildPaginatedResult(items, total, page, limit);
};

const getPaymentById = async (user: AuthUser, id: string) => {
  const payment = await prisma.payment.findFirst({
    where: { id, ...(user.role !== Role.ADMIN && { userId: user.id }) },
    include: paymentInclude,
  });
  if (!payment) {
    throw new AppError(404, "Payment not found");
  }
  return payment;
};

export const paymentService = {
  initiatePayment,
  handleWebhook,
  verifySuccess,
  cancelCheckout,
  getMyPayments,
  getPaymentById,
};
