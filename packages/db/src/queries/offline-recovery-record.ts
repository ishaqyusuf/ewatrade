import { z } from "zod"
import { CatalogError } from "./catalog-errors"

const recoverySchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("suspended_staff"),
    membershipId: z.string().min(1),
    accessRevision: z.number().int().positive(),
    accessChangedAt: z.iso.datetime(),
    lifecycleEventId: z.string().min(1),
    receivedAt: z.iso.datetime(),
  })
  .strict()

export type OfflineRecoveryRecord = z.infer<typeof recoverySchema>

/** Server-only annotation; strict public envelope admission rejects this key. */
export function readOfflineRecoveryRecord(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Offline record is invalid.",
    )
  if (!Object.hasOwn(payload, "_offlineRecovery")) return null
  const parsed = recoverySchema.safeParse(
    Reflect.get(payload, "_offlineRecovery"),
  )
  if (!parsed.success)
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "This offline record needs management recovery.",
    )
  return parsed.data
}

export function withoutOfflineRecoveryRecord<T extends object>(payload: T) {
  const { _offlineRecovery: _recovery, ...original } = payload as T & {
    _offlineRecovery?: unknown
  }
  return original
}
