import { z } from "zod";
import { AuditAction, Role, UserStatus } from "../../../generated/prisma/client.js";
import { paginationSchema } from "../../utils/pagination.js";

export const userIdParamSchema = z.object({
  id: z.uuid("Invalid user id"),
});

export const userQuerySchema = paginationSchema.extend({
  searchTerm: z.string().trim().min(1).optional(),
  role: z.enum(Role).optional(),
  status: z.enum(UserStatus).optional(),
  sortBy: z.enum(["createdAt", "name", "email"]).default("createdAt"),
});

export const updateRoleSchema = z
  .object({
    role: z.enum(Role),
  })
  .strict();

export const updateUserStatusSchema = z
  .object({
    status: z.enum(UserStatus),
  })
  .strict();

export const auditLogQuerySchema = paginationSchema.extend({
  action: z.enum(AuditAction).optional(),
  entity: z.string().trim().min(1).optional(),
  entityId: z.uuid().optional(),
  actorId: z.uuid().optional(),
});

export type UserQuery = z.infer<typeof userQuerySchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
