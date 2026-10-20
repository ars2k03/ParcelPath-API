import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^01[3-9]\d{8}$/, "Phone must be a valid Bangladeshi mobile number");

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    phone: phoneSchema.optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
