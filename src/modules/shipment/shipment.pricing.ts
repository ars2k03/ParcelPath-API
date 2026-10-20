import type { ParcelType } from "../../../generated/prisma/client.js";

const BASE_CHARGE = {
  SAME_CITY: 100,
  INTER_CITY: 150,
} as const;

const INCLUDED_WEIGHT_KG = 1;
const EXTRA_CHARGE_PER_KG = 25;

const PARCEL_TYPE_SURCHARGE: Record<ParcelType, number> = {
  DOCUMENT: 0,
  PACKAGE: 20,
  FRAGILE: 60,
};

type PricingInput = {
  originCity: string;
  destinationCity: string;
  parcelType: ParcelType;
  weightKg: number;
};

export const calculateDeliveryCharge = ({
  originCity,
  destinationCity,
  parcelType,
  weightKg,
}: PricingInput) => {
  const zone =
    originCity.trim().toLowerCase() === destinationCity.trim().toLowerCase()
      ? "SAME_CITY"
      : "INTER_CITY";
  const baseCharge = BASE_CHARGE[zone];
  const weightCharge = Math.ceil(Math.max(0, weightKg - INCLUDED_WEIGHT_KG)) * EXTRA_CHARGE_PER_KG;
  const parcelTypeCharge = PARCEL_TYPE_SURCHARGE[parcelType];

  return {
    zone,
    baseCharge,
    weightCharge,
    parcelTypeCharge,
    total: baseCharge + weightCharge + parcelTypeCharge,
    currency: "BDT",
  };
};
