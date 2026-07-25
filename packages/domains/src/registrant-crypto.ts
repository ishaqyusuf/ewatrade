import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

import type { DomainRegistrant } from "./types"

const VERSION = "v1"
const DEVELOPMENT_SECRET = "ewatrade-domain-data-development-only"

function encryptionKey(
  env: Record<string, string | undefined> = process.env,
): Buffer {
  const configured = env.DOMAIN_DATA_ENCRYPTION_KEY?.trim()

  if (!configured && env.NODE_ENV === "production") {
    throw new Error("DOMAIN_DATA_ENCRYPTION_KEY is required in production.")
  }

  return createHash("sha256")
    .update(configured || DEVELOPMENT_SECRET)
    .digest()
}

export function encryptRegistrant(
  registrant: DomainRegistrant,
  env?: Record<string, string | undefined>,
) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(registrant), "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".")
}

export function decryptRegistrant(
  value: string,
  env?: Record<string, string | undefined>,
): DomainRegistrant {
  const [version, iv, authTag, ciphertext] = value.split(".")

  if (version !== VERSION || !iv || !authTag || !ciphertext) {
    throw new Error("Unsupported encrypted registrant payload.")
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(env),
    Buffer.from(iv, "base64url"),
  )
  decipher.setAuthTag(Buffer.from(authTag, "base64url"))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ])

  return JSON.parse(plaintext.toString("utf8")) as DomainRegistrant
}

export function maskEmail(email: string) {
  const [localPart = "", domain = ""] = email.trim().toLowerCase().split("@")
  const visible = localPart.slice(0, Math.min(2, localPart.length))
  return `${visible}${"*".repeat(Math.max(2, localPart.length - visible.length))}@${domain}`
}
