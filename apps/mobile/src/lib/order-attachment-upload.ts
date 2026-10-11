import * as Crypto from "expo-crypto"
import { File } from "expo-file-system"
import { fetch } from "expo/fetch"
import { getBaseUrl } from "./base-url"
import { getSession } from "./session-store"

export const ORDER_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const
export const ORDER_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

function authHeaders() {
  const session = getSession()
  if (!session?.token || !session.profile.businessSlug)
    throw new Error("Sign in again before adding files.")
  return {
    "x-app-authorization": `Bearer ${session.token}`,
    "x-tenant-slug": session.profile.businessSlug,
    ...(session.profile.storeId
      ? { "x-store-id": session.profile.storeId }
      : {}),
    "x-trpc-source": "mobile",
  }
}

/** Reads a picked file once; the digest lets the server verify the upload. */
export async function readOrderAttachmentFile(uri: string) {
  const bytes = await new File(uri).bytes()
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  // Android's native digest accepts typed arrays, not a bare ArrayBuffer.
  const digest = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    new Uint8Array(buffer),
  )
  return {
    buffer,
    contentDigest: Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
    sizeBytes: bytes.byteLength,
  }
}

export async function uploadOrderAttachment(input: {
  attachmentId: string
  buffer: ArrayBuffer
  contentType: string
}) {
  // Hermes has no AbortSignal.timeout.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90_000)
  const response = await fetch(
    `${getBaseUrl()}/api/orders/attachments/${encodeURIComponent(input.attachmentId)}/upload`,
    {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": input.contentType },
      body: input.buffer,
      signal: controller.signal,
    },
  ).finally(() => clearTimeout(timer))
  if (response.ok) return
  const result: unknown = await response.json().catch(() => null)
  throw new Error(
    result &&
      typeof result === "object" &&
      "error" in result &&
      typeof result.error === "string"
      ? result.error
      : "A file didn't upload. Try again.",
  )
}

/** Authenticated image source for expo-image; bytes are never cached publicly. */
export function orderAttachmentSource(attachmentId: string) {
  return {
    uri: `${getBaseUrl()}/api/orders/attachments/${encodeURIComponent(attachmentId)}/content`,
    headers: authHeaders(),
  }
}

/** A photo sent in an assistant chat; only its sender can load it. */
export function chatAttachmentSource(attachmentId: string) {
  return {
    uri: `${getBaseUrl()}/api/assistant/attachments/${encodeURIComponent(attachmentId)}/content`,
    headers: authHeaders(),
  }
}
