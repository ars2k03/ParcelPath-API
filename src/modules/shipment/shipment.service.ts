import {
  AuditAction,
  PaymentStatus,
  type Prisma,
  Role,
  ShipmentStatus,
  UserStatus,
} from "../../../generated/prisma/client.js";
import { uploadImage } from "../../config/cloudinary.js";
import { prisma } from "../../config/prisma.js";
import { stripe } from "../../config/stripe.js";
import { AppError } from "../../errors/AppError.js";
import type { AuthUser } from "../../types/express.js";
import { recordAudit } from "../../utils/auditLog.js";
import { invalidateCache, remember } from "../../utils/cache.js";
import { generateTrackingNumber } from "../../utils/generateTrackingNumber.js";
import { buildPaginatedResult, getPagination } from "../../utils/pagination.js";
import {
  ACTIVE_COURIER_STATUSES,
  CANCELLABLE_STATUSES,
  COURIER_ASSIGNABLE_STATUSES,
  COURIER_COMMISSION_RATE,
  COURIER_STATS_MONTHS,
  DELETABLE_STATUSES,
  STATUS_TRANSITIONS,
} from "./shipment.constant.js";
import { calculateDeliveryCharge } from "./shipment.pricing.js";
import type {
  CreateShipmentInput,
  PriceEstimateInput,
  ShipmentQuery,
  ShipmentSearchQuery,
  UpdateShipmentInput,
  UpdateStatusInput,
} from "./shipment.validation.js";

type Actor = AuthUser & { ip?: string };

const hubSummary = { select: { id: true, name: true, code: true, city: true } } as const;

const shipmentInclude = {
  originHub: hubSummary,
  destinationHub: hubSummary,
  currentHub: hubSummary,
  customer: { select: { id: true, name: true, email: true, phone: true } },
  courier: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.ShipmentInclude;

const scopeByRole = (user: AuthUser): Prisma.ShipmentWhereInput => {
  if (user.role === Role.CUSTOMER) return { customerId: user.id };
  if (user.role === Role.COURIER) return { courierId: user.id };
  return {};
};

const invalidateShipmentCaches = (trackingNumber: string) =>
  invalidateCache(`tracking:${trackingNumber}`, "admin:stats", "courier:stats:*");

const findAccessibleShipment = async (user: AuthUser, id: string) => {
  const shipment = await prisma.shipment.findFirst({
    where: { id, deletedAt: null, ...scopeByRole(user) },
  });
  if (!shipment) {
    throw new AppError(404, "Shipment not found");
  }
  return shipment;
};

const loadRouteHubs = async (originHubId: string, destinationHubId: string) => {
  const hubs = await prisma.hub.findMany({
    where: { id: { in: [originHubId, destinationHubId] }, deletedAt: null, isActive: true },
    select: { id: true, city: true },
  });
  const origin = hubs.find((hub) => hub.id === originHubId);
  const destination = hubs.find((hub) => hub.id === destinationHubId);

  if (!origin) {
    throw new AppError(400, "Origin hub is not available", [
      { path: "originHubId", message: "Hub does not exist or is inactive" },
    ]);
  }
  if (!destination) {
    throw new AppError(400, "Destination hub is not available", [
      { path: "destinationHubId", message: "Hub does not exist or is inactive" },
    ]);
  }
  return { origin, destination };
};

const estimatePrice = async (payload: PriceEstimateInput) => {
  const { origin, destination } = await loadRouteHubs(
    payload.originHubId,
    payload.destinationHubId,
  );
  return calculateDeliveryCharge({
    originCity: origin.city,
    destinationCity: destination.city,
    parcelType: payload.parcelType,
    weightKg: payload.weightKg,
  });
};

const createShipment = async (actor: Actor, payload: CreateShipmentInput) => {
  const pricing = await estimatePrice(payload);

  const shipment = await prisma.$transaction(async (tx) => {
    const created = await tx.shipment.create({
      data: {
        ...payload,
        trackingNumber: generateTrackingNumber(),
        customerId: actor.id,
        price: pricing.total,
        trackingEvents: {
          create: {
            status: ShipmentStatus.PENDING,
            hubId: payload.originHubId,
            actorId: actor.id,
            note: "Pickup requested by customer",
          },
        },
      },
      include: shipmentInclude,
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: AuditAction.SHIPMENT_CREATED,
      entity: "Shipment",
      entityId: created.id,
      after: { trackingNumber: created.trackingNumber, price: created.price },
      ipAddress: actor.ip,
    });
    return created;
  });

  await invalidateCache("admin:stats");
  return { ...shipment, pricing };
};

const paginateShipments = async (
  where: Prisma.ShipmentWhereInput,
  orderBy: Prisma.ShipmentOrderByWithRelationInput,
  page: number,
  limit: number,
) => {
  const [items, total] = await prisma.$transaction([
    prisma.shipment.findMany({
      where,
      include: shipmentInclude,
      orderBy,
      ...getPagination(page, limit),
    }),
    prisma.shipment.count({ where }),
  ]);
  return buildPaginatedResult(items, total, page, limit);
};

const buildFilters = (query: ShipmentQuery): Prisma.ShipmentWhereInput => ({
  ...(query.status && { status: query.status }),
  ...(query.parcelType && { parcelType: query.parcelType }),
  ...(query.originHubId && { originHubId: query.originHubId }),
  ...(query.destinationHubId && { destinationHubId: query.destinationHubId }),
});

const getShipments = (user: AuthUser, query: ShipmentQuery) =>
  paginateShipments(
    { deletedAt: null, ...scopeByRole(user), ...buildFilters(query) },
    { [query.sortBy]: query.sortOrder },
    query.page,
    query.limit,
  );

const searchShipments = (user: AuthUser, query: ShipmentSearchQuery) =>
  paginateShipments(
    {
      deletedAt: null,
      ...scopeByRole(user),
      OR: [
        { trackingNumber: { contains: query.q, mode: "insensitive" } },
        { receiverName: { contains: query.q, mode: "insensitive" } },
        { receiverPhone: { contains: query.q } },
        { senderName: { contains: query.q, mode: "insensitive" } },
        { deliveryAddress: { contains: query.q, mode: "insensitive" } },
      ],
    },
    { createdAt: query.sortOrder },
    query.page,
    query.limit,
  );

const getMyAssignedShipments = (courier: AuthUser, query: ShipmentQuery) =>
  paginateShipments(
    {
      deletedAt: null,
      courierId: courier.id,
      status: { in: ACTIVE_COURIER_STATUSES },
      ...buildFilters(query),
    },
    { [query.sortBy]: query.sortOrder },
    query.page,
    query.limit,
  );

const toMonthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const getCourierStats = (courier: AuthUser) =>
  remember(`courier:stats:${courier.id}`, 60, async () => {
    const now = new Date();
    const since = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (COURIER_STATS_MONTHS - 1), 1),
    );

    const [byStatus, deliveredTotals, failedAttempts, recentDeliveries] = await Promise.all([
      prisma.shipment.groupBy({
        by: ["status"],
        where: { courierId: courier.id, deletedAt: null },
        _count: { _all: true },
        orderBy: { status: "asc" },
      }),
      prisma.shipment.aggregate({
        where: { courierId: courier.id, deletedAt: null, status: ShipmentStatus.DELIVERED },
        _sum: { price: true },
        _count: { _all: true },
      }),
      prisma.trackingEvent.count({
        where: { actorId: courier.id, status: ShipmentStatus.FAILED_DELIVERY },
      }),
      prisma.shipment.findMany({
        where: {
          courierId: courier.id,
          deletedAt: null,
          status: ShipmentStatus.DELIVERED,
          deliveredAt: { gte: since },
        },
        select: { deliveredAt: true, price: true },
      }),
    ]);

    const months = Array.from({ length: COURIER_STATS_MONTHS }, (_, index) => {
      const date = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + index, 1));
      return { month: toMonthKey(date), deliveries: 0, deliveredValue: 0, earnings: 0 };
    });

    for (const { deliveredAt, price } of recentDeliveries) {
      if (!deliveredAt) continue;
      const bucket = months.find((entry) => entry.month === toMonthKey(deliveredAt));
      if (!bucket) continue;
      bucket.deliveries += 1;
      bucket.deliveredValue += Number(price);
    }
    for (const bucket of months) {
      bucket.deliveredValue = roundMoney(bucket.deliveredValue);
      bucket.earnings = roundMoney(bucket.deliveredValue * COURIER_COMMISSION_RATE);
    }

    const statusCounts = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all]));
    const delivered = deliveredTotals._count._all;
    const deliveredValue = Number(deliveredTotals._sum.price ?? 0);
    const attempts = delivered + failedAttempts;

    return {
      byStatus: statusCounts,
      active: ACTIVE_COURIER_STATUSES.reduce((sum, status) => sum + (statusCounts[status] ?? 0), 0),
      delivered,
      failedAttempts,
      successRate: attempts === 0 ? 0 : roundMoney((delivered / attempts) * 100),
      deliveredValue: roundMoney(deliveredValue),
      totalEarnings: roundMoney(deliveredValue * COURIER_COMMISSION_RATE),
      commissionRate: COURIER_COMMISSION_RATE,
      currency: "BDT",
      monthly: months,
    };
  });

const getShipmentById = async (user: AuthUser, id: string) => {
  const shipment = await prisma.shipment.findFirst({
    where: { id, deletedAt: null, ...scopeByRole(user) },
    include: {
      ...shipmentInclude,
      trackingEvents: {
        orderBy: { createdAt: "asc" },
        include: { hub: hubSummary },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        select: { id: true, amount: true, currency: true, status: true, paidAt: true },
      },
    },
  });
  if (!shipment) {
    throw new AppError(404, "Shipment not found");
  }
  return shipment;
};

const trackShipment = (trackingNumber: string) =>
  remember(`tracking:${trackingNumber}`, 120, async () => {
    const shipment = await prisma.shipment.findFirst({
      where: { trackingNumber, deletedAt: null },
      select: {
        trackingNumber: true,
        status: true,
        parcelType: true,
        createdAt: true,
        deliveredAt: true,
        originHub: { select: { name: true, city: true } },
        destinationHub: { select: { name: true, city: true } },
        currentHub: { select: { name: true, city: true } },
        trackingEvents: {
          orderBy: { createdAt: "asc" },
          select: {
            status: true,
            note: true,
            createdAt: true,
            hub: { select: { name: true, city: true } },
          },
        },
      },
    });
    if (!shipment) {
      throw new AppError(404, "No shipment found with this tracking number");
    }
    return shipment;
  });

const updateShipment = async (actor: Actor, id: string, payload: UpdateShipmentInput) => {
  const shipment = await findAccessibleShipment(actor, id);

  if (shipment.status !== ShipmentStatus.PENDING || shipment.paidAt) {
    throw new AppError(409, "Shipment can only be edited before payment");
  }

  const pricing = await estimatePrice({
    originHubId: payload.originHubId ?? shipment.originHubId,
    destinationHubId: payload.destinationHubId ?? shipment.destinationHubId,
    parcelType: payload.parcelType ?? shipment.parcelType,
    weightKg: payload.weightKg ?? Number(shipment.weightKg),
  });

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.shipment.update({
      where: { id },
      data: { ...payload, price: pricing.total },
      include: shipmentInclude,
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: AuditAction.SHIPMENT_UPDATED,
      entity: "Shipment",
      entityId: id,
      before: shipment,
      after: payload,
      ipAddress: actor.ip,
    });
    return result;
  });

  await invalidateShipmentCaches(shipment.trackingNumber);
  return { ...updated, pricing };
};

const deleteShipment = async (actor: Actor, id: string) => {
  const shipment = await findAccessibleShipment(actor, id);

  if (!DELETABLE_STATUSES.includes(shipment.status)) {
    throw new AppError(409, `Shipment in ${shipment.status} status cannot be deleted`);
  }
  if (shipment.status === ShipmentStatus.PENDING && shipment.paidAt) {
    throw new AppError(409, "Paid shipment must be cancelled before it can be deleted");
  }

  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordAudit(tx, {
      actorId: actor.id,
      action: AuditAction.SHIPMENT_DELETED,
      entity: "Shipment",
      entityId: id,
      before: { status: shipment.status, deletedAt: null },
      ipAddress: actor.ip,
    });
  });

  await invalidateShipmentCaches(shipment.trackingNumber);
  return null;
};

const assignCourier = async (actor: Actor, id: string, courierId: string) => {
  const shipment = await findAccessibleShipment(actor, id);

  if (!COURIER_ASSIGNABLE_STATUSES.includes(shipment.status)) {
    throw new AppError(409, `Courier cannot be assigned while shipment is ${shipment.status}`);
  }
  if (shipment.status === ShipmentStatus.PENDING && !shipment.paidAt) {
    throw new AppError(409, "Shipment must be paid before a courier is assigned");
  }

  const courier = await prisma.user.findFirst({
    where: { id: courierId, role: Role.COURIER, status: UserStatus.ACTIVE, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!courier) {
    throw new AppError(400, "Courier not found or not active", [
      { path: "courierId", message: "Must be an active courier" },
    ]);
  }

  const nextStatus =
    shipment.status === ShipmentStatus.PENDING ? ShipmentStatus.COURIER_ASSIGNED : shipment.status;

  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.shipment.updateMany({
      where: { id, status: shipment.status, courierId: shipment.courierId },
      data: { courierId: courier.id, status: nextStatus },
    });
    if (count === 0) {
      throw new AppError(409, "Shipment was modified by another request, please retry");
    }

    await tx.trackingEvent.create({
      data: {
        shipmentId: id,
        status: nextStatus,
        hubId: shipment.currentHubId,
        actorId: actor.id,
        note: `Courier ${courier.name} assigned`,
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: AuditAction.COURIER_ASSIGNED,
      entity: "Shipment",
      entityId: id,
      before: { courierId: shipment.courierId, status: shipment.status },
      after: { courierId: courier.id, status: nextStatus },
      ipAddress: actor.ip,
    });

    return tx.shipment.findUniqueOrThrow({ where: { id }, include: shipmentInclude });
  });

  await invalidateShipmentCaches(shipment.trackingNumber);
  return updated;
};

const hubForStatus = (
  status: ShipmentStatus,
  shipment: { originHubId: string; destinationHubId: string },
) => {
  switch (status) {
    case ShipmentStatus.AT_ORIGIN_HUB:
      return shipment.originHubId;
    case ShipmentStatus.AT_DESTINATION_HUB:
    case ShipmentStatus.FAILED_DELIVERY:
      return shipment.destinationHubId;
    default:
      return null;
  }
};

const updateShipmentStatus = async (
  actor: Actor,
  id: string,
  payload: UpdateStatusInput,
  proofImage?: Express.Multer.File,
) => {
  const shipment = await findAccessibleShipment(actor, id);
  const allowedRoles = STATUS_TRANSITIONS[shipment.status]?.[payload.status];

  if (!allowedRoles) {
    throw new AppError(409, `Cannot change status from ${shipment.status} to ${payload.status}`);
  }
  if (!allowedRoles.includes(actor.role)) {
    throw new AppError(
      403,
      `Only ${allowedRoles.join(" or ")} can mark a shipment ${payload.status}`,
    );
  }
  if (payload.status === ShipmentStatus.DELIVERED && !proofImage) {
    throw new AppError(400, "Proof of delivery image is required", [
      { path: "proofOfDelivery", message: "Upload an image as proof of delivery" },
    ]);
  }

  const proofOfDelivery = proofImage
    ? (await uploadImage(proofImage.buffer, "proof-of-delivery")).secure_url
    : undefined;
  const currentHubId = hubForStatus(payload.status, shipment);

  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.shipment.updateMany({
      where: { id, status: shipment.status },
      data: {
        status: payload.status,
        currentHubId,
        ...(proofOfDelivery && { proofOfDelivery }),
        ...(payload.status === ShipmentStatus.DELIVERED && { deliveredAt: new Date() }),
        ...(payload.failureReason && { failureReason: payload.failureReason }),
      },
    });
    if (count === 0) {
      throw new AppError(409, "Shipment status was changed by another request, please retry");
    }

    await tx.trackingEvent.create({
      data: {
        shipmentId: id,
        status: payload.status,
        hubId: currentHubId,
        actorId: actor.id,
        note: payload.failureReason ?? payload.note ?? null,
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: AuditAction.SHIPMENT_STATUS_CHANGED,
      entity: "Shipment",
      entityId: id,
      before: { status: shipment.status },
      after: { status: payload.status },
      ipAddress: actor.ip,
    });

    return tx.shipment.findUniqueOrThrow({ where: { id }, include: shipmentInclude });
  });

  await invalidateShipmentCaches(shipment.trackingNumber);
  return updated;
};

const cancelShipment = async (actor: Actor, id: string, reason?: string) => {
  const shipment = await findAccessibleShipment(actor, id);

  if (!CANCELLABLE_STATUSES.includes(shipment.status)) {
    throw new AppError(409, `Shipment cannot be cancelled once it is ${shipment.status}`);
  }

  const paidPayment = shipment.paidAt
    ? await prisma.payment.findFirst({
        where: { shipmentId: id, status: PaymentStatus.PAID },
      })
    : null;

  const cancelled = await prisma.$transaction(
    async (tx) => {
      const { count } = await tx.shipment.updateMany({
        where: { id, status: { in: CANCELLABLE_STATUSES } },
        data: { status: ShipmentStatus.CANCELLED, cancelledAt: new Date() },
      });
      if (count === 0) {
        throw new AppError(409, "Shipment status was changed by another request, please retry");
      }

      await tx.trackingEvent.create({
        data: {
          shipmentId: id,
          status: ShipmentStatus.CANCELLED,
          actorId: actor.id,
          note: reason ?? "Cancelled before pickup",
        },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        action: AuditAction.SHIPMENT_CANCELLED,
        entity: "Shipment",
        entityId: id,
        before: { status: shipment.status },
        after: { status: ShipmentStatus.CANCELLED, reason },
        ipAddress: actor.ip,
      });

      if (paidPayment?.stripePaymentIntentId) {
        await stripe.refunds.create(
          { payment_intent: paidPayment.stripePaymentIntentId },
          { idempotencyKey: `refund-${paidPayment.id}` },
        );
        await tx.payment.update({
          where: { id: paidPayment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
        await recordAudit(tx, {
          actorId: actor.id,
          action: AuditAction.PAYMENT_REFUNDED,
          entity: "Payment",
          entityId: paidPayment.id,
          before: { status: PaymentStatus.PAID },
          after: { status: PaymentStatus.REFUNDED },
          ipAddress: actor.ip,
        });
      }

      return tx.shipment.findUniqueOrThrow({ where: { id }, include: shipmentInclude });
    },
    { timeout: 15000 },
  );

  await invalidateShipmentCaches(shipment.trackingNumber);
  return cancelled;
};

export const shipmentService = {
  estimatePrice,
  createShipment,
  getShipments,
  searchShipments,
  getMyAssignedShipments,
  getCourierStats,
  getShipmentById,
  trackShipment,
  updateShipment,
  deleteShipment,
  assignCourier,
  updateShipmentStatus,
  cancelShipment,
};
