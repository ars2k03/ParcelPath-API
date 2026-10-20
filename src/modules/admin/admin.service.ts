import {
  AuditAction,
  PaymentStatus,
  type Prisma,
  Role,
  UserStatus,
} from "../../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../errors/AppError.js";
import type { AuthUser } from "../../types/express.js";
import { recordAudit } from "../../utils/auditLog.js";
import { remember } from "../../utils/cache.js";
import { buildPaginatedResult, getPagination } from "../../utils/pagination.js";
import { FINAL_SHIPMENT_STATUSES } from "../shipment/shipment.constant.js";
import { publicUserSelect } from "../user/user.service.js";
import type { AuditLogQuery, UserQuery } from "./admin.validation.js";

type Actor = AuthUser & { ip?: string };

const findManageableUser = async (actor: Actor, id: string) => {
  if (actor.id === id) {
    throw new AppError(400, "You cannot change your own account from the admin panel");
  }
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!user) {
    throw new AppError(404, "User not found");
  }
  return user;
};

const getUsers = async (query: UserQuery) => {
  const { page, limit, sortBy, sortOrder, searchTerm, role, status } = query;

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(role && { role }),
    ...(status && { status }),
    ...(searchTerm && {
      OR: [
        { name: { contains: searchTerm, mode: "insensitive" } },
        { email: { contains: searchTerm, mode: "insensitive" } },
        { phone: { contains: searchTerm } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: publicUserSelect,
      orderBy: { [sortBy]: sortOrder },
      ...getPagination(page, limit),
    }),
    prisma.user.count({ where }),
  ]);

  return buildPaginatedResult(items, total, page, limit);
};

const updateUserRole = async (actor: Actor, id: string, role: Role) => {
  const user = await findManageableUser(actor, id);
  if (user.role === role) {
    throw new AppError(409, `User already has the ${role} role`);
  }

  if (user.role === Role.COURIER) {
    const activeDeliveries = await prisma.shipment.count({
      where: { courierId: id, deletedAt: null, status: { notIn: FINAL_SHIPMENT_STATUSES } },
    });
    if (activeDeliveries > 0) {
      throw new AppError(
        409,
        `Courier has ${activeDeliveries} active shipment(s), reassign them before changing role`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { role },
      select: publicUserSelect,
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: AuditAction.USER_ROLE_CHANGED,
      entity: "User",
      entityId: id,
      before: { role: user.role },
      after: { role },
      ipAddress: actor.ip,
    });
    return updated;
  });
};

const updateUserStatus = async (actor: Actor, id: string, status: UserStatus) => {
  const user = await findManageableUser(actor, id);
  if (user.status === status) {
    throw new AppError(409, `User is already ${status}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { status },
      select: publicUserSelect,
    });
    if (status === UserStatus.BLOCKED) {
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await recordAudit(tx, {
      actorId: actor.id,
      action: AuditAction.USER_STATUS_CHANGED,
      entity: "User",
      entityId: id,
      before: { status: user.status },
      after: { status },
      ipAddress: actor.ip,
    });
    return updated;
  });
};

const getDashboardStats = () =>
  remember("admin:stats", 60, async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [usersByRole, shipmentsByStatus, revenue, activeHubs, recentShipments, paymentsByStatus] =
      await Promise.all([
        prisma.user.groupBy({
          by: ["role"],
          where: { deletedAt: null },
          _count: { _all: true },
          orderBy: { role: "asc" },
        }),
        prisma.shipment.groupBy({
          by: ["status"],
          where: { deletedAt: null },
          _count: { _all: true },
          orderBy: { status: "asc" },
        }),
        prisma.payment.aggregate({
          where: { status: PaymentStatus.PAID },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.hub.count({ where: { deletedAt: null, isActive: true } }),
        prisma.shipment.count({ where: { deletedAt: null, createdAt: { gte: sevenDaysAgo } } }),
        prisma.payment.groupBy({
          by: ["status"],
          _count: { _all: true },
          orderBy: { status: "asc" },
        }),
      ]);

    const shipmentCounts = Object.fromEntries(
      shipmentsByStatus.map((row) => [row.status, row._count._all]),
    );

    return {
      users: Object.fromEntries(usersByRole.map((row) => [row.role, row._count._all])),
      shipments: {
        total: Object.values(shipmentCounts).reduce((sum, count) => sum + count, 0),
        createdLast7Days: recentShipments,
        byStatus: shipmentCounts,
      },
      payments: {
        successfulCount: revenue._count._all,
        totalRevenue: Number(revenue._sum.amount ?? 0),
        currency: "BDT",
        byStatus: Object.fromEntries(paymentsByStatus.map((row) => [row.status, row._count._all])),
      },
      activeHubs,
    };
  });

const getAuditLogs = async (query: AuditLogQuery) => {
  const { page, limit, sortOrder, action, entity, entityId, actorId } = query;

  const where: Prisma.AuditLogWhereInput = {
    ...(action && { action }),
    ...(entity && { entity: { equals: entity, mode: "insensitive" } }),
    ...(entityId && { entityId }),
    ...(actorId && { actorId }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: sortOrder },
      ...getPagination(page, limit),
    }),
    prisma.auditLog.count({ where }),
  ]);

  return buildPaginatedResult(items, total, page, limit);
};

export const adminService = {
  getUsers,
  updateUserRole,
  updateUserStatus,
  getDashboardStats,
  getAuditLogs,
};
