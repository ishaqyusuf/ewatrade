import { detectServiceCommerceMediaMimeType } from "@ewatrade/service-commerce"
import { assertQaProviderAllowed } from "@ewatrade/utils/qa-provider-policy"
import { createLocalTestPrivateObjectPort } from "./local-test-object-port"
import {
  type PrivateObjectDescriptor,
  PrivateObjectStorageError,
  createPrivateObjectStorage,
} from "./object-storage"
import { createVercelPrivateObjectPort } from "./vercel-blob"

/** Photos and documents on Order activity. Video needs direct uploads (later). */
export const ORDER_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

export const ORDER_ATTACHMENT_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
}

export function orderAttachmentKind(contentType: string) {
  if (!Object.hasOwn(ORDER_ATTACHMENT_EXTENSIONS, contentType)) return null
  return contentType === "application/pdf"
    ? ("DOCUMENT" as const)
    : ("IMAGE" as const)
}

/** The declared type must match the file's signature. */
export function acceptsOrderAttachmentBytes(
  bytes: Uint8Array,
  contentType: string,
) {
  if (!orderAttachmentKind(contentType) || bytes.byteLength < 1) return false
  const detected = detectServiceCommerceMediaMimeType(bytes)
  return (
    detected === contentType ||
    (contentType === "image/heif" && detected === "image/heic") ||
    (contentType === "image/heic" && detected === "image/heif")
  )
}

export type OrderAttachmentTarget = {
  tenantId: string
  orderId: string
  attachmentId: string
  contentDigest: string
  contentType: string
  sizeBytes: number
}

function id(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new PrivateObjectStorageError("INVALID_OBJECT")
  return value
}

export function orderAttachmentStoragePath(target: OrderAttachmentTarget) {
  const extension = ORDER_ATTACHMENT_EXTENSIONS[target.contentType]
  if (!extension || !/^[a-f0-9]{64}$/.test(target.contentDigest))
    throw new PrivateObjectStorageError("INVALID_OBJECT")
  return `orders/attachments/${id(target.tenantId)}/${id(target.orderId)}/${id(target.attachmentId)}/${target.contentDigest}.${extension}`
}

/**
 * Live businesses use private Blob storage; QA data uses the local test
 * adapter outside production and is refused in production.
 */
export function createOrderAttachmentStorage(
  dataClassification: "LIVE" | "QA",
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const config =
    dataClassification === "QA"
      ? {
          ...createLocalTestPrivateObjectPort<string>({ environment }),
          provider: "local_test" as const,
          mode: "test" as const,
        }
      : {
          ...createVercelPrivateObjectPort<string>({
            BLOB_STORE_ID: environment.BLOB_STORE_ID,
            BLOB_READ_WRITE_TOKEN: environment.BLOB_READ_WRITE_TOKEN,
            VERCEL_OIDC_TOKEN: environment.VERCEL_OIDC_TOKEN,
          }),
          provider: "vercel_blob_private" as const,
          mode: "live" as const,
        }
  assertQaProviderAllowed({
    adapter: config.mode,
    operation: "media_analysis",
    tenantDataClassification: dataClassification,
  })
  const objects = createPrivateObjectStorage<string>({
    port: config.port,
    configured: config.configured,
    maxBytes: ORDER_ATTACHMENT_MAX_BYTES,
    validateBytes: (bytes, contentType) => {
      if (!acceptsOrderAttachmentBytes(bytes, contentType))
        throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
    },
  })
  const descriptor = (
    target: OrderAttachmentTarget,
  ): PrivateObjectDescriptor<string> => ({
    storagePath: orderAttachmentStoragePath(target),
    contentDigest: target.contentDigest,
    contentType: target.contentType,
    sizeBytes: target.sizeBytes,
  })
  return {
    provider: config.provider,
    storeId: config.storeId,
    assertAvailable: () => objects.assertAvailable(),
    async stage(input: {
      target: OrderAttachmentTarget
      bytes: Uint8Array
      abortSignal?: AbortSignal
    }) {
      const object = descriptor(input.target)
      await objects.write({
        object,
        bytes: input.bytes,
        abortSignal: input.abortSignal,
      })
      return { storagePath: object.storagePath }
    },
    read(input: { target: OrderAttachmentTarget; abortSignal?: AbortSignal }) {
      return objects.read({
        object: descriptor(input.target),
        abortSignal: input.abortSignal,
      })
    },
  }
}
