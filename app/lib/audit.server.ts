// app/lib/audit.server.ts
import { db } from "~/db.server";

interface AuditParams {
  shopId: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  actorType?: "system" | "user";
  actorId?: string;
  requestId?: string;
}

const RETENTION_DAYS = parseInt(process.env.RETENTION_AUDIT_LOGS ?? "180", 10);

export async function audit(params: AuditParams) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + RETENTION_DAYS);

  await db.auditLog.create({
    data: {
      shopId: params.shopId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details,
      actorType: params.actorType ?? "system",
      actorId: params.actorId,
      requestId: params.requestId,
      expiresAt,
    },
  });
}
