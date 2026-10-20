import { AuditAction, type Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { recordAudit } from "../../utils/auditLog.js";
import { invalidateCache, remember } from "../../utils/cache.js";
import { buildPaginatedResult, getPagination } from "../../utils/pagination.js";
import { FINAL_SHIPMENT_STATUSES } from "../shipment/shipment.constant.js";
import type { CreateHubInput, HubQuery, UpdateHubInput } from "./hub.validation.js";

type Actor = { id: string; ip?: string };

const HUB_CACHE_TTL_SECONDS = 300;

const findActiveHubOrThrow = async (id: string) => {
  const hub = await prisma.hub.findFirst({ where: { id, deletedAt: null } });
  if (!hub) {
    throw new AppError(404, "Hub not found");
  }
  return hub;
};

const createHub = async (actor: Actor, payload: CreateHubInput) => {
  const hub = await prisma.$transaction(async (tx) => {
    const created = await tx.hub.create({ data: payload });
    await recordAudit(tx, {
      actorId: actor.id,
      action: AuditAction.HUB_CREATED,
      entity: "Hub",
      entityId: created.id,
      after: created,
      ipAddress: actor.ip,
    });
    return created;
  });

  await invalidateCache("hubs:*");
  return hub;
};

const getHubs = (query: HubQuery) =>
  remember(`hubs:list:${JSON.stringify(query)}`, HUB_CACHE_TTL_SECONDS, async () => {
    const { page, limit, sortBy, sortOrder, searchTerm, city, isActive } = query;

    const where: Prisma.HubWhereInput = {
      deletedAt: null,
      ...(city && { city: { equals: city, mode: "insensitive" } }),
      ...(isActive !== undefined && { isActive }),
      ...(searchTerm && {
        OR: [
          { name: { contains: searchTerm, mode: "insensitive" } },
          { code: { contains: searchTerm, mode: "insensitive" } },
          { city: { contains: searchTerm, mode: "insensitive" } },
        ],
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.hub.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        ...getPagination(page, limit),
      }),
      prisma.hub.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, limit);
  });

const getPublicHubs = () =>
  remember("hubs:public", HUB_CACHE_TTL_SECONDS, () =>
    prisma.hub.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, code: true, city: true, address: true, phone: true },
      orderBy: { name: "asc" },
    }),
  );

const getHubById = (id: string) =>
  remember(`hubs:detail:${id}`, HUB_CACHE_TTL_SECONDS, () => findActiveHubOrThrow(id));

const updateHub = async (actor: Actor, id: string, payload: UpdateHubInput) => {
  const existing = await findActiveHubOrThrow(id);

  const hub = await prisma.$transaction(async (tx) => {
    const updated = await tx.hub.update({ where: { id }, data: payload });
    await recordAudit(tx, {
      actorId: actor.id,
      action: AuditAction.HUB_UPDATED,
      entity: "Hub",
      entityId: id,
      before: existing,
      after: updated,
      ipAddress: actor.ip,
    });
    return updated;
  });

  await invalidateCache("hubs:*");
  return hub;
};

const deleteHub = async (actor: Actor, id: string) => {
  const existing = await findActiveHubOrThrow(id);

  const activeShipments = await prisma.shipment.count({
    where: {
      deletedAt: null,
      status: { notIn: FINAL_SHIPMENT_STATUSES },
      OR: [{ originHubId: id }, { destinationHubId: id }, { currentHubId: id }],
    },
  });
  if (activeShipments > 0) {
    throw new AppError(409, `Hub has ${activeShipments} active shipment(s) and cannot be deleted`);
  }

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.hub.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: AuditAction.HUB_DELETED,
      entity: "Hub",
      entityId: id,
      before: existing,
      after: deleted,
      ipAddress: actor.ip,
    });
  });

  await invalidateCache("hubs:*");
  return null;
};

export const hubService = {
  createHub,
  getHubs,
  getPublicHubs,
  getHubById,
  updateHub,
  deleteHub,
};
