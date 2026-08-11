import { createHash, randomBytes } from "node:crypto"

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

export function stablePayloadHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex")
}

export function issueOpaqueCapabilityToken() {
  return randomBytes(32).toString("base64url")
}

export function opaqueCapabilityTokenDigest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}
