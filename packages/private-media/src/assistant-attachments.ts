import { detectServiceCommerceMediaMimeType } from "@ewatrade/service-commerce"
import { assertQaProviderAllowed } from "@ewatrade/utils/qa-provider-policy"
import { createLocalTestPrivateObjectPort } from "./local-test-object-port"
import {
  type PrivateObjectDescriptor,
  type PrivateObjectPort,
  PrivateObjectStorageError,
  createPrivateObjectStorage,
} from "./object-storage"
import { createVercelPrivateObjectPort } from "./vercel-blob"

export const ASSISTANT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "application/pdf": "pdf",
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
}

const TEXT_TYPES = new Set([
  "text/csv",
  "text/tab-separated-values",
  "text/plain",
])

/** Signature check for binary types; strict UTF-8 without NULs for text types. */
export function acceptsAssistantAttachmentBytes(
  bytes: Uint8Array,
  contentType: string,
) {
  if (!Object.hasOwn(EXTENSIONS, contentType) || bytes.byteLength < 1)
    return false
  if (TEXT_TYPES.has(contentType)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      return !text.includes("\u0000")
    } catch {
      return false
    }
  }
  if (
    contentType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return (
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    )
  const detected = detectServiceCommerceMediaMimeType(bytes)
  // Recorders label mp4 audio inconsistently; the container is what matters.
  return (
    detected === contentType ||
    (contentType === "image/heif" && detected === "image/heic") ||
    (contentType === "image/heic" && detected === "image/heif")
  )
}

export type AssistantAttachmentTarget = {
  tenantId: string
  conversationId: string
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

export function assistantAttachmentStoragePath(
  target: Pick<
    AssistantAttachmentTarget,
    | "tenantId"
    | "conversationId"
    | "attachmentId"
    | "contentDigest"
    | "contentType"
  >,
) {
  const extension = EXTENSIONS[target.contentType]
  if (!extension || !/^[a-f0-9]{64}$/.test(target.contentDigest))
    throw new PrivateObjectStorageError("INVALID_OBJECT")
  return `assistant/attachments/${id(target.tenantId)}/${id(target.conversationId)}/${id(target.attachmentId)}/${target.contentDigest}.${extension}`
}

export type AssistantAttachmentStorageConfig = {
  port: PrivateObjectPort<string>
  configured: () => boolean
  storeId: string | null
  provider: "vercel_blob_private" | "local_test"
  mode: "live" | "test"
}

/**
 * Live businesses use private Blob storage. QA data uses the local test
 * adapter outside production and is refused in production.
 */
export function resolveAssistantAttachmentStorage(
  dataClassification: "LIVE" | "QA",
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AssistantAttachmentStorageConfig {
  if (dataClassification === "QA") {
    const local = createLocalTestPrivateObjectPort<string>({ environment })
    return { ...local, provider: "local_test", mode: "test" }
  }
  const live = createVercelPrivateObjectPort<string>({
    BLOB_STORE_ID: environment.BLOB_STORE_ID,
    BLOB_READ_WRITE_TOKEN: environment.BLOB_READ_WRITE_TOKEN,
    VERCEL_OIDC_TOKEN: environment.VERCEL_OIDC_TOKEN,
  })
  return { ...live, provider: "vercel_blob_private", mode: "live" }
}

export function createAssistantAttachmentStorage(
  config: AssistantAttachmentStorageConfig,
  dataClassification: "LIVE" | "QA",
) {
  assertQaProviderAllowed({
    adapter: config.mode,
    operation: "media_analysis",
    tenantDataClassification: dataClassification,
  })
  const objects = createPrivateObjectStorage<string>({
    port: config.port,
    configured: config.configured,
    maxBytes: ASSISTANT_ATTACHMENT_MAX_BYTES,
    validateBytes: (bytes, contentType) => {
      if (!acceptsAssistantAttachmentBytes(bytes, contentType))
        throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
    },
  })
  const descriptor = (
    target: AssistantAttachmentTarget,
  ): PrivateObjectDescriptor<string> => ({
    storagePath: assistantAttachmentStoragePath(target),
    contentDigest: target.contentDigest,
    contentType: target.contentType,
    sizeBytes: target.sizeBytes,
  })
  return {
    assertAvailable: () => objects.assertAvailable(),
    provider: config.provider,
    storeId: config.storeId,
    async stage(input: {
      target: AssistantAttachmentTarget
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
    read(input: {
      target: AssistantAttachmentTarget
      abortSignal?: AbortSignal
    }) {
      return objects.read({
        object: descriptor(input.target),
        abortSignal: input.abortSignal,
      })
    },
    remove(input: {
      target: AssistantAttachmentTarget
      abortSignal?: AbortSignal
    }) {
      return objects.remove({
        object: descriptor(input.target),
        abortSignal: input.abortSignal,
      })
    },
  }
}
