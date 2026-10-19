import { createHash } from "node:crypto"
import type { ServiceCommerceBookingStatus } from "@ewatrade/service-commerce"
import { z } from "zod"
import { ServiceCommerceBookingError } from "./shared"

const MAX_INT = 2_147_483_647
export function refuse(
  message = "The complete current booking review is unavailable.",
): never {
  throw new ServiceCommerceBookingError("BOOKING_REVISION_CONFLICT", message)
}
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")
export function stable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    )
  return value
}
export function revision(value: number, positive = false) {
  if (
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > MAX_INT
  )
    refuse()
  return value
}
export function sameScope(
  row: { tenantId: string; storeId: string },
  input: { tenantId: string; storeId: string },
) {
  if (row.tenantId !== input.tenantId || row.storeId !== input.storeId) refuse()
}
export function status(value: string): ServiceCommerceBookingStatus {
  const raw = z
    .enum([
      "scheduled",
      "confirmed",
      "arrived",
      "in_service",
      "completed",
      "cancelled",
      "no_show",
    ])
    .safeParse(value.toLowerCase())
  if (!raw.success) refuse()
  return raw.data
}

/** Only for named unordered fact collections; never canonical action intent order. */
export function factSet<T>(rows: readonly T[]) {
  return [...rows].sort((a, b) =>
    JSON.stringify(stable(a)).localeCompare(JSON.stringify(stable(b))),
  )
}
