import { z } from "zod";
import { PaymentStatus } from "../../../generated/prisma/client.js";
import { paginationSchema } from "../../utils/pagination.js";

export const initiatePaymentSchema = z
  .object({
    shipmentId: z.uuid("Invalid shipment id"),
  })
  .strict();

export const paymentIdParamSchema = z.object({
  id: z.uuid("Invalid payment id"),
});

export const paymentSuccessQuerySchema = z.object({
  session_id: z.string().startsWith("cs_", "Invalid checkout session id"),
});

export const paymentCancelQuerySchema = z.object({
  payment_id: z.uuid("Invalid payment id"),
});

export const paymentQuerySchema = paginationSchema.extend({
  status: z.enum(PaymentStatus).optional(),
});

export type PaymentQuery = z.infer<typeof paymentQuerySchema>;
