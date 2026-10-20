import { z } from "zod";
import { paginationSchema } from "../../utils/pagination.js";
import { phoneSchema } from "../user/user.validation.js";

export const contactIdParamSchema = z.object({
  id: z.uuid("Invalid message id"),
});

export const createContactMessageSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
    email: z.string().trim().toLowerCase().pipe(z.email("Invalid email address")),
    phone: phoneSchema.optional(),
    subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(120),
    message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000),
  })
  .strict();

export const updateContactMessageSchema = z
  .object({
    isRead: z.boolean(),
  })
  .strict();

export const contactQuerySchema = paginationSchema.extend({
  searchTerm: z.string().trim().min(1).optional(),
  isRead: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export type CreateContactMessageInput = z.infer<typeof createContactMessageSchema>;
export type ContactQuery = z.infer<typeof contactQuerySchema>;
