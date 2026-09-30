import { Prisma, prisma } from "@channelbase/database";

export async function recordAuditLog(params: { userId?: string; action: string; entityType: string; entityId?: string; metadata?: Record<string, unknown>; ipAddress?: string }): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
      ipAddress: params.ipAddress,
    },
  });
}
