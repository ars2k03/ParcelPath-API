import { Router } from "express";
import { Role } from "../../../generated/prisma/client.js";
import { auth } from "../../middlewares/auth.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { adminController } from "./admin.controller.js";
import {
  auditLogQuerySchema,
  updateRoleSchema,
  updateUserStatusSchema,
  userIdParamSchema,
  userQuerySchema,
} from "./admin.validation.js";

const router = Router();

router.use(auth(Role.ADMIN));

router.get("/users", validateRequest({ query: userQuerySchema }), adminController.getUsers);
router.patch(
  "/users/:id/role",
  validateRequest({ params: userIdParamSchema, body: updateRoleSchema }),
  adminController.updateUserRole,
);
router.patch(
  "/users/:id/status",
  validateRequest({ params: userIdParamSchema, body: updateUserStatusSchema }),
  adminController.updateUserStatus,
);
router.get("/dashboard-stats", adminController.getDashboardStats);
router.get(
  "/audit-logs",
  validateRequest({ query: auditLogQuerySchema }),
  adminController.getAuditLogs,
);

export const adminRoutes = router;
