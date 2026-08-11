import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

import {
  assertServiceCommerceDeliveryTransition,
  assertServiceCommercePickupTransition,
  evaluateServiceCommerceDeliveryZone,
} from "@ewatrade/service-commerce"

export type PickupStatus =
  | "abandoned"
  | "cancelled"
  | "exception"
  | "handed_off"
  | "preparing"
  | "ready"

export function assertPickupTransition(from: PickupStatus, to: PickupStatus) {
  assertServiceCommercePickupTransition(from, to)
}

export type DeliveryStatus =
  | "assigned"
  | "cancelled"
  | "collected"
  | "delivered"
  | "failed"
  | "in_transit"
  | "ready_for_assignment"
  | "rescheduled"
  | "returned_to_pharmacy"

export function assertDeliveryTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
) {
  assertServiceCommerceDeliveryTransition(
    from === "returned_to_pharmacy" ? "returned_to_store" : from,
    to === "returned_to_pharmacy" ? "returned_to_store" : to,
  )
}

export type DeliveryZoneRule = {
  feePolicy: "fixed" | "manual"
  fixedFeeMinor?: number | null
  id: string
  matchType: "locality" | "postal_prefix"
  matchValues: string[]
  priority: number
  promiseText: string
}

export function evaluateDeliveryZone(
  rules: DeliveryZoneRule[],
  address: { locality: string; postalCode?: string },
) {
  const result = evaluateServiceCommerceDeliveryZone(
    rules.map((rule) => ({ ...rule, currencyCode: "XXX" })),
    address,
  )
  if (result.outcome === "eligible") {
    return {
      feeMinor: result.feeMinor,
      outcome: result.outcome,
      zone: rules.find((rule) => rule.id === result.zone.id) ?? result.zone,
    }
  }
  if (result.outcome === "manual_review") {
    return {
      outcome: result.outcome,
      zone: rules.find((rule) => rule.id === result.zone.id) ?? result.zone,
    }
  }
  return result
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function encryptionKey() {
  const configured = process.env.PRESCRIPTION_DATA_ENCRYPTION_KEY?.trim()
  if (configured) {
    const bytes = Buffer.from(configured, "base64")
    if (bytes.length !== 32) {
      throw new Error("Prescription data encryption key must be 32 bytes.")
    }
    return bytes
  }
  if (process.env.NODE_ENV !== "production") {
    return createHash("sha256")
      .update("ewatrade-local-prescription-data")
      .digest()
  }
  throw new Error(
    "Prescription data encryption is not configured; sensitive writes fail closed.",
  )
}

export function encryptPrescriptionData(value: Record<string, unknown>) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ])
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".")
}

export function decryptPrescriptionData(value: string) {
  const [version, iv, tag, encrypted] = value.split(".")
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Encrypted prescription data is invalid.")
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url"),
  )
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  ) as Record<string, unknown>
}

export function prescriptionDataFingerprint(value: string) {
  return createHash("sha256").update(normalize(value)).digest("hex")
}

export interface PrescriptionDeliveryProvider {
  readonly key: string
  assign(input: {
    assignmentId: string
    courierReference: string
  }): Promise<{ providerDeliveryId: string | null }>
}

export function createManualDeliveryProvider(): PrescriptionDeliveryProvider {
  return {
    key: "manual",
    async assign() {
      return { providerDeliveryId: null }
    },
  }
}
