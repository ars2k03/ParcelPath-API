import type { Request, RequestHandler } from "express";
import { sendResponse } from "../../utils/sendResponse.js";
import { adminService } from "./admin.service.js";
import type { AuditLogQuery, UserQuery } from "./admin.validation.js";

type IdParams = { id: string };

const actorOf = (req: Request) => ({ ...req.user, ip: req.ip });

const getUsers: RequestHandler = async (req, res) => {
  const result = await adminService.getUsers(req.query as unknown as UserQuery);
  sendResponse(res, { message: "Users retrieved successfully", data: result });
};

const updateUserRole: RequestHandler<IdParams> = async (req, res) => {
  const result = await adminService.updateUserRole(actorOf(req), req.params.id, req.body.role);
  sendResponse(res, { message: "User role updated successfully", data: result });
};

const updateUserStatus: RequestHandler<IdParams> = async (req, res) => {
  const result = await adminService.updateUserStatus(actorOf(req), req.params.id, req.body.status);
  sendResponse(res, { message: "User status updated successfully", data: result });
};

const getDashboardStats: RequestHandler = async (_req, res) => {
  const result = await adminService.getDashboardStats();
  sendResponse(res, { message: "Dashboard statistics retrieved successfully", data: result });
};

const getAuditLogs: RequestHandler = async (req, res) => {
  const result = await adminService.getAuditLogs(req.query as unknown as AuditLogQuery);
  sendResponse(res, { message: "Audit logs retrieved successfully", data: result });
};

export const adminController = {
  getUsers,
  updateUserRole,
  updateUserStatus,
  getDashboardStats,
  getAuditLogs,
};
