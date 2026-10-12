import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"
import { z } from "zod"

const id = z.string().min(1).max(160)
const bindingSchema = z
  .object({
    tenantId: id,
    membershipId: id,
    invitationId: id,
    notificationId: id,
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export type StaffInvitationCustodyBinding = z.infer<typeof bindingSchema>
export const staffInvitationDeliveryPayload = z
  .object({
    version: z.literal(1),
    appUrl: z.string().url().max(2048),
    inviteUrl: z.string().url().max(4096),
    businessName: z.string().min(1).max(500),
    invitedByName: z.string().min(1).max(500),
    inviteeEmail: z.string().email().max(254),
    inviteeName: z.string().max(120).nullable(),
    membershipId: id,
    staffAccessRevision: z.number().int().min(0),
    role: z.enum(["CASHIER", "OPERATOR", "MANAGER"]),
  })
  .strict()
export type StaffInvitationDeliveryPayload = z.infer<
  typeof staffInvitationDeliveryPayload
>

function key(encoded?: string) {
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw Error("Staff invitation custody is not configured.")
  const value = Buffer.from(encoded, "base64")
  if (value.length !== 32 || value.toString("base64") !== encoded)
    throw Error("Staff invitation custody key must contain 32 bytes.")
  return value
}
function validKeyId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{1,64}$/.test(value)
}
function settings(config: NodeJS.ProcessEnv) {
  const keyId = config.STAFF_INVITATION_ENCRYPTION_KEY_ID?.trim()
  if (!validKeyId(keyId))
    throw Error("Staff invitation custody key identifier is not configured.")
  return { keyId, key: key(config.STAFF_INVITATION_ENCRYPTION_KEY?.trim()) }
}
function decryptionKey(keyId: string, config: NodeJS.ProcessEnv) {
  const active = settings(config)
  if (!validKeyId(keyId))
    throw Error("Staff invitation custody key version is unavailable.")
  const encoded = config.STAFF_INVITATION_DECRYPTION_KEYS?.trim()
  const retired = new Map<string, Buffer>()
  if (encoded) {
    if (encoded.length > 16_384)
      throw Error("Staff invitation custody keyring is invalid.")
    let ring: unknown
    try {
      ring = JSON.parse(encoded)
    } catch {
      throw Error("Staff invitation custody keyring is invalid.")
    }
    if (
      !ring ||
      typeof ring !== "object" ||
      Array.isArray(ring) ||
      Object.keys(ring).length > 16
    )
      throw Error("Staff invitation custody keyring is invalid.")
    for (const [id, encodedKey] of Object.entries(ring)) {
      if (
        !validKeyId(id) ||
        id === active.keyId ||
        typeof encodedKey !== "string"
      )
        throw Error("Staff invitation custody keyring is invalid.")
      retired.set(id, key(encodedKey))
    }
  }
  const selected = keyId === active.keyId ? active.key : retired.get(keyId)
  if (!selected)
    throw Error("Staff invitation custody key version is unavailable.")
  return selected
}
export function assertStaffInvitationCustodyConfigured(
  config: NodeJS.ProcessEnv = process.env,
) {
  decryptionKey(settings(config).keyId, config)
}
function aad(binding: StaffInvitationCustodyBinding, keyId: string) {
  return Buffer.from(
    `ewatrade:staff-invitation:v1:${keyId}:${JSON.stringify(bindingSchema.parse(binding))}`,
  )
}
export function staffInvitationPayloadHash(
  payload: StaffInvitationDeliveryPayload,
) {
  return createHash("sha256")
    .update(JSON.stringify(staffInvitationDeliveryPayload.parse(payload)))
    .digest("hex")
}
export function sealStaffInvitationPayload(
  payload: StaffInvitationDeliveryPayload,
  binding: StaffInvitationCustodyBinding,
  config: NodeJS.ProcessEnv = process.env,
) {
  const value = staffInvitationDeliveryPayload.parse(payload)
  if (
    staffInvitationPayloadHash(value) !== binding.payloadHash ||
    value.membershipId !== binding.membershipId
  )
    throw Error("Staff invitation payload does not match custody binding.")
  const active = settings(config),
    iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", active.key, iv)
  cipher.setAAD(aad(binding, active.keyId))
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ])
  return {
    keyId: active.keyId,
    envelope: [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      encrypted.toString("base64url"),
    ].join("."),
  }
}
export function openStaffInvitationPayload(
  envelope: string,
  keyId: string,
  binding: StaffInvitationCustodyBinding,
  config: NodeJS.ProcessEnv = process.env,
): StaffInvitationDeliveryPayload {
  try {
    if (envelope.length > 32_768) throw Error()
    const parts = envelope.split(".")
    if (parts.length !== 4 || parts[0] !== "v1") throw Error()
    const decoded = parts.slice(1).map((part) => {
      if (!/^[A-Za-z0-9_-]+$/.test(part)) throw Error()
      const bytes = Buffer.from(part, "base64url")
      if (bytes.toString("base64url") !== part) throw Error()
      return bytes
    })
    if (decoded[0]!.length !== 12 || decoded[1]!.length !== 16) throw Error()
    const decipher = createDecipheriv(
      "aes-256-gcm",
      decryptionKey(keyId, config),
      decoded[0]!,
    )
    decipher.setAAD(aad(binding, keyId))
    decipher.setAuthTag(decoded[1]!)
    const payload = staffInvitationDeliveryPayload.parse(
      JSON.parse(
        Buffer.concat([
          decipher.update(decoded[2]!),
          decipher.final(),
        ]).toString("utf8"),
      ),
    )
    if (
      staffInvitationPayloadHash(payload) !== binding.payloadHash ||
      payload.membershipId !== binding.membershipId
    )
      throw Error()
    return payload
  } catch {
    throw Error("Staff invitation delivery payload is unavailable.")
  }
}
