import { ParcelType, Role, ShipmentStatus } from "../../../generated/prisma/client.js";

export const FINAL_SHIPMENT_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.DELIVERED,
  ShipmentStatus.RETURNED,
  ShipmentStatus.CANCELLED,
];

export const CANCELLABLE_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.PENDING,
  ShipmentStatus.COURIER_ASSIGNED,
];

export const DELETABLE_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.PENDING,
  ShipmentStatus.CANCELLED,
  ShipmentStatus.DELIVERED,
  ShipmentStatus.RETURNED,
];

export const COURIER_ASSIGNABLE_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.PENDING,
  ShipmentStatus.AT_DESTINATION_HUB,
  ShipmentStatus.FAILED_DELIVERY,
];

export const STATUS_TRANSITIONS: Partial<
  Record<ShipmentStatus, Partial<Record<ShipmentStatus, Role[]>>>
> = {
  [ShipmentStatus.COURIER_ASSIGNED]: {
    [ShipmentStatus.PICKED_UP]: [Role.COURIER],
  },
  [ShipmentStatus.PICKED_UP]: {
    [ShipmentStatus.AT_ORIGIN_HUB]: [Role.COURIER, Role.ADMIN],
  },
  [ShipmentStatus.AT_ORIGIN_HUB]: {
    [ShipmentStatus.IN_TRANSIT]: [Role.ADMIN],
  },
  [ShipmentStatus.IN_TRANSIT]: {
    [ShipmentStatus.AT_DESTINATION_HUB]: [Role.ADMIN],
  },
  [ShipmentStatus.AT_DESTINATION_HUB]: {
    [ShipmentStatus.OUT_FOR_DELIVERY]: [Role.COURIER],
  },
  [ShipmentStatus.OUT_FOR_DELIVERY]: {
    [ShipmentStatus.DELIVERED]: [Role.COURIER],
    [ShipmentStatus.FAILED_DELIVERY]: [Role.COURIER],
  },
  [ShipmentStatus.FAILED_DELIVERY]: {
    [ShipmentStatus.OUT_FOR_DELIVERY]: [Role.COURIER],
    [ShipmentStatus.RETURNED]: [Role.ADMIN],
  },
};

export const ACTIVE_COURIER_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.COURIER_ASSIGNED,
  ShipmentStatus.PICKED_UP,
  ShipmentStatus.AT_DESTINATION_HUB,
  ShipmentStatus.OUT_FOR_DELIVERY,
  ShipmentStatus.FAILED_DELIVERY,
];

export const SHIPMENT_SORT_FIELDS = ["createdAt", "updatedAt", "price", "weightKg"] as const;

export const PARCEL_TYPES = Object.values(ParcelType);

export const COURIER_COMMISSION_RATE = 0.2;

export const COURIER_STATS_MONTHS = 6;
