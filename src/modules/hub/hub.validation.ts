import { z } from "zod";
import { paginationSchema } from "../../utils/pagination.js";
import { phoneSchema } from "../user/user.validation.js";

export const hubIdParamSchema = z.object({
  id: z.uuid("Invalid hub id"),
});

export const createHubSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2,6}$/, "Code must be 2 to 6 letters"),
    city: z.string().trim().min(2).max(60),
    address: z.string().trim().min(5).max(255),
    phone: phoneSchema,
  })
  .strict();

export const updateHubSchema = createHubSchema
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "Provide at least one field to update");

export const hubQuerySchema = paginationSchema.extend({
  searchTerm: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sortBy: z.enum(["name", "city", "createdAt"]).default("createdAt"),
});

export type CreateHubInput = z.infer<typeof createHubSchema>;
export type UpdateHubInput = z.infer<typeof updateHubSchema>;
export type HubQuery = z.infer<typeof hubQuerySchema>;
