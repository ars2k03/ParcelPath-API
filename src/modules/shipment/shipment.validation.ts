import { z } from "zod";
import { ParcelType, ShipmentStatus } from "../../../generated/prisma/client.js";
import { paginationSchema } from "../../utils/pagination.js";
import { phoneSchema } from "../user/user.validation.js";
import { SHIPMENT_SORT_FIELDS } from "./shipment.constant.js";

export const shipmentIdParamSchema = z.object({
  id: z.uuid("Invalid shipment id"),
});

export const trackingNumberParamSchema = z.object({
  trackingNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^PP\d{6}[A-Z0-9]{6}$/, "Invalid tracking number"),
});

const routeFields = {
  originHubId: z.uuid("Invalid origin hub id"),
  destinationHubId: z.uuid("Invalid destination hub id"),
  parcelType: z.enum(ParcelType),
  weightKg: z.number().positive("Weight must be greater than 0").max(50, "Maximum weight is 50 kg"),
};

export const priceEstimateSchema = z.object(routeFields).strict();

export const createShipmentSchema = z
  .object({
    ...routeFields,
    senderName: z.string().trim().min(2).max(60),
    senderPhone: phoneSchema,
    pickupAddress: z.string().trim().min(5).max(255),
    receiverName: z.string().trim().min(2).max(60),
    receiverPhone: phoneSchema,
    deliveryAddress: z.string().trim().min(5).max(255),
    description: z.string().trim().max(500).optional(),
  })
  .strict();

export const updateShipmentSchema = createShipmentSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, "Provide at least one field to update");

export const shipmentQuerySchema = paginationSchema.extend({
  status: z.enum(ShipmentStatus).optional(),
  parcelType: z.enum(ParcelType).optional(),
  originHubId: z.uuid().optional(),
  destinationHubId: z.uuid().optional(),
  sortBy: z.enum(SHIPMENT_SORT_FIELDS).default("createdAt"),
});

export const shipmentSearchSchema = paginationSchema.extend({
  q: z.string().trim().min(2, "Search term must be at least 2 characters"),
});

export const assignCourierSchema = z
  .object({
    courierId: z.uuid("Invalid courier id"),
  })
  .strict();

export const updateStatusSchema = z
  .object({
    status: z.enum(ShipmentStatus),
    note: z.string().trim().max(255).optional(),
    failureReason: z.string().trim().min(3).max(255).optional(),
  })
  .strict()
  .refine((data) => data.status !== ShipmentStatus.FAILED_DELIVERY || data.failureReason, {
    path: ["failureReason"],
    message: "Failure reason is required for failed deliveries",
  });

export const cancelShipmentSchema = z
  .object({
    reason: z.string().trim().min(3).max(255).optional(),
  })
  .strict();

export type PriceEstimateInput = z.infer<typeof priceEstimateSchema>;
export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;
export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;
export type ShipmentQuery = z.infer<typeof shipmentQuerySchema>;
export type ShipmentSearchQuery = z.infer<typeof shipmentSearchSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
