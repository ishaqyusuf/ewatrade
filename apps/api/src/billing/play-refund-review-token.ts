import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

function validKeyId(keyId: string | undefined): keyId is string {
  return Boolean(keyId && /^[a-zA-Z0-9._-]{1,64}$/.test(keyId))
}

function parseKey(encoded: string | undefined) {
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw new Error("Play refund-review encryption key is not configured.")
  const key = Buffer.from(encoded, "base64")
  if (key.length !== 32 || key.toString("base64") !== encoded)
    throw new Error("Play refund-review encryption key must be 32 bytes.")
  return key
}

function encryptionSettings(config: NodeJS.ProcessEnv) {
  const keyId = config.PLAY_REFUND_REVIEW_KEY_ID?.trim()
  if (!validKeyId(keyId))
    throw new Error("Play refund-review key identifier is not configured.")
  const key = parseKey(config.PLAY_REFUND_REVIEW_ENCRYPTION_KEY?.trim())
  return { keyId, key }
}

function decryptionKey(keyId: string, config: NodeJS.ProcessEnv) {
  const active = encryptionSettings(config)
  if (!validKeyId(keyId))
    throw new Error("Play refund-review key version is unavailable.")
  const encodedRing = config.PLAY_REFUND_REVIEW_DECRYPTION_KEYS?.trim()
  if (!encodedRing) {
    if (active.keyId === keyId) return active.key
    throw new Error("Play refund-review key version is unavailable.")
  }
  if (encodedRing.length > 16_384)
    throw new Error("Play refund-review decryption keyring is invalid.")
  let ring: unknown
  try {
    ring = JSON.parse(encodedRing)
  } catch {
    throw new Error("Play refund-review decryption keyring is invalid.")
  }
  if (!ring || typeof ring !== "object" || Array.isArray(ring))
    throw new Error("Play refund-review decryption keyring is invalid.")
  const entries = Object.entries(ring)
  if (entries.length > 16)
    throw new Error("Play refund-review decryption keyring is invalid.")
  const legacy = new Map<string, Buffer>()
  for (const [id, encoded] of entries) {
    if (!validKeyId(id) || id === active.keyId || typeof encoded !== "string")
      throw new Error("Play refund-review decryption keyring is invalid.")
    legacy.set(id, parseKey(encoded))
  }
  if (active.keyId === keyId) return active.key
  const key = legacy.get(keyId)
  if (!key) throw new Error("Play refund-review key version is unavailable.")
  return key
}

export function assertPlayRefundReviewCustodyConfigured(
  config: NodeJS.ProcessEnv = process.env,
) {
  const { keyId } = encryptionSettings(config)
  decryptionKey(keyId, config)
}

function encryptCustodyValue(
  value: string,
  purpose: "play-refund-review" | "play-refund-review-order",
  config: NodeJS.ProcessEnv,
) {
  const { key, keyId } = encryptionSettings(config)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(Buffer.from(`ewatrade:${purpose}:v1:${keyId}`))
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])
  return {
    keyId,
    envelope: [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join("."),
  }
}

function decryptCustodyValue(
  envelope: string,
  keyId: string,
  purpose: "play-refund-review" | "play-refund-review-order",
  config: NodeJS.ProcessEnv,
) {
  const key = decryptionKey(keyId, config)
  const [version, iv, tag, ciphertext] = envelope.split(".")
  if (version !== "v1" || !iv || !tag || !ciphertext)
    throw new Error("Play pending-refund envelope is invalid.")
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url"),
  )
  decipher.setAAD(Buffer.from(`ewatrade:${purpose}:v1:${keyId}`))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

export function encryptPlayPendingRefundToken(
  token: string,
  config: NodeJS.ProcessEnv = process.env,
) {
  if (!token || token.length > 8192)
    throw new Error("Play pending-refund token is invalid.")
  return encryptCustodyValue(token, "play-refund-review", config)
}

export function decryptPlayPendingRefundToken(
  envelope: string,
  keyId: string,
  config: NodeJS.ProcessEnv = process.env,
) {
  return decryptCustodyValue(envelope, keyId, "play-refund-review", config)
}

export function encryptPlayRefundReviewOrderId(
  orderId: string,
  config: NodeJS.ProcessEnv = process.env,
) {
  if (!orderId || orderId.length > 256)
    throw new Error("Play refund-review order is invalid.")
  return encryptCustodyValue(orderId, "play-refund-review-order", config)
}

export function decryptPlayRefundReviewOrderId(
  envelope: string,
  keyId: string,
  config: NodeJS.ProcessEnv = process.env,
) {
  return decryptCustodyValue(
    envelope,
    keyId,
    "play-refund-review-order",
    config,
  )
}
