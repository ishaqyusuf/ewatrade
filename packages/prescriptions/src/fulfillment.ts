import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

export type PickupStatus =
  | "abandoned"
  | "cancelled"
  | "exception"
  | "handed_off"
  | "preparing"
  | "ready"

const PICKUP_TRANSITIONS: Record<PickupStatus, PickupStatus[]> = {
  abandoned: [],
  cancelled: [],
  exception: ["cancelled", "preparing", "ready"],
  handed_off: [],
  preparing: ["cancelled", "exception", "ready"],
  ready: ["abandoned", "cancelled", "exception", "handed_off"],
}

export function assertPickupTransition(from: PickupStatus, to: PickupStatus) {
  if (!PICKUP_TRANSITIONS[from].includes(to)) {
    throw new Error(`Pickup cannot move from ${from} to ${to}.`)
  }
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

const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  assigned: ["cancelled", "collected", "failed", "rescheduled"],
  cancelled: [],
  collected: ["failed", "in_transit", "returned_to_pharmacy"],
  delivered: [],
  failed: ["cancelled", "rescheduled", "returned_to_pharmacy"],
  in_transit: ["delivered", "failed", "returned_to_pharmacy"],
  ready_for_assignment: ["assigned", "cancelled"],
  rescheduled: ["assigned", "cancelled"],
  returned_to_pharmacy: ["cancelled", "rescheduled"],
}

export function assertDeliveryTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
) {
  if (!DELIVERY_TRANSITIONS[from].includes(to)) {
    throw new Error(`Delivery cannot move from ${from} to ${to}.`)
  }
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

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

export function evaluateDeliveryZone(
  rules: DeliveryZoneRule[],
  address: { locality: string; postalCode?: string },
) {
  const locality = normalize(address.locality)
  const postalCode = normalize(address.postalCode ?? "")
  const matches = rules
    .filter((rule) =>
      rule.matchValues.some((raw) => {
        const value = normalize(raw)
        return rule.matchType === "locality"
          ? locality === value
          : postalCode.startsWith(value)
      }),
    )
    .sort((left, right) => right.priority - left.priority)
  if (matches.length === 0) return { outcome: "ineligible" as const }
  if (matches.length > 1 && matches[0]?.priority === matches[1]?.priority) {
    return { outcome: "ambiguous" as const }
  }
  const zone = matches[0]
  if (!zone) return { outcome: "ineligible" as const }
  return zone.feePolicy === "manual"
    ? { outcome: "manual_review" as const, zone }
    : { feeMinor: zone.fixedFeeMinor ?? 0, outcome: "eligible" as const, zone }
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
