import { z } from "zod"
import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"

const correctionRecord = z
  .object({
    version: z.literal(1),
    kind: z.literal("blank_quick_sale_replaced"),
    originalClientCommandId: z.string().min(8).max(160),
    originalPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    replacementClientCommandId: z.string().min(8).max(160),
    replacementPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    replacedByUserId: z.string().min(1),
    replacedAt: z.iso.datetime(),
  })
  .strict()

export type OfflineQuickSaleCorrectionRecord = z.infer<typeof correctionRecord>

function refuse() {
  return new CatalogError(
    "IDEMPOTENCY_MISMATCH",
    "This saved sale was replaced. Reconcile the corrected record before retrying.",
  )
}

/** Server-only authoritative-state annotation, never part of an envelope hash. */
export function readOfflineQuickSaleCorrectionRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  if (!Object.hasOwn(value, "_offlineQuickSaleCorrection")) return null
  const result = correctionRecord.safeParse(
    Reflect.get(value, "_offlineQuickSaleCorrection"),
  )
  if (!result.success) throw refuse()
  return result.data
}

/**
 * Nonlocking read: canonical creation calls this AFTER its Tenant sequence UPDATE.
 * Correction must update that same Tenant row version and prove Order absence
 * while holding it. Never acquire a Command/key lock after this domain lock.
 */
export async function assertOfflineOrderIdentityNotRetired(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; clientOrderId: string },
) {
  const command = await tx.offlineCommand.findUnique({
    where: {
      tenantId_clientCommandId: {
        tenantId: input.tenantId,
        clientCommandId: input.clientOrderId,
      },
    },
    select: { authoritativeState: true, payloadHash: true },
  })
  const record = readOfflineQuickSaleCorrectionRecord(
    command?.authoritativeState,
  )
  // Even a stale status or inconsistent annotation cannot revive this identity.
  if (record) throw refuse()
}
