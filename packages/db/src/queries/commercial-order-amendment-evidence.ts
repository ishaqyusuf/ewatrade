import { createHash } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"

export function orderAmendmentDigest(value: unknown) {
  function sorted(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sorted)
    if (value !== null && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, sorted(entry)]),
      )
    return value
  }
  return createHash("sha256")
    .update(JSON.stringify(sorted(JSON.parse(JSON.stringify(value)))))
    .digest("hex")
}
export const orderAmendmentJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value))
