import type { AuditAction, Prisma } from "../../generated/prisma/client.js";

type AuditEntry = {
  actorId: string | null;
  action: AuditAction;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
};

const toJson = (value: unknown) =>
  value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

export const recordAudit = (tx: Prisma.TransactionClient, entry: AuditEntry) =>
  tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
      ipAddress: entry.ipAddress ?? null,
    },
  });
