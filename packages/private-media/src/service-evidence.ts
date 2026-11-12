import { assertQaProviderAllowed } from "@ewatrade/utils/qa-provider-policy"
import { createLocalTestPrivateObjectPort } from "./local-test-object-port"
import {
  type PrivateObjectDescriptor,
  PrivateObjectStorageError,
  createPrivateObjectStorage,
} from "./object-storage"
import {
  ORDER_ATTACHMENT_EXTENSIONS,
  acceptsOrderAttachmentBytes,
} from "./order-attachments"
import { createVercelPrivateObjectPort } from "./vercel-blob"

/** Job photos upload through the API, so stay under the hosted request cap. */
export const SERVICE_EVIDENCE_PHOTO_MAX_BYTES = 4 * 1024 * 1024

export const SERVICE_EVIDENCE_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const

export function isServiceEvidencePhotoType(contentType: string) {
  return (SERVICE_EVIDENCE_PHOTO_TYPES as readonly string[]).includes(
    contentType,
  )
}

/** The declared photo type must match the file's signature. */
export function acceptsServiceEvidencePhotoBytes(
  bytes: Uint8Array,
  contentType: string,
) {
  return (
    isServiceEvidencePhotoType(contentType) &&
    acceptsOrderAttachmentBytes(bytes, contentType)
  )
}

export type ServiceEvidenceFileTarget = {
  tenantId: string
  jobId: string
  evidenceId: string
  contentDigest: string
  contentType: string
  sizeBytes: number
}

function id(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new PrivateObjectStorageError("INVALID_OBJECT")
  return value
}

export function serviceEvidenceStoragePath(target: ServiceEvidenceFileTarget) {
  const extension = ORDER_ATTACHMENT_EXTENSIONS[target.contentType]
  if (
    !extension ||
    !isServiceEvidencePhotoType(target.contentType) ||
    !/^[a-f0-9]{64}$/.test(target.contentDigest)
  )
    throw new PrivateObjectStorageError("INVALID_OBJECT")
  return `services/evidence/${id(target.tenantId)}/${id(target.jobId)}/${id(target.evidenceId)}/${target.contentDigest}.${extension}`
}

/**
 * Same private stores as Order attachments: live businesses use private Blob,
 * QA data the local test adapter outside production.
 */
export function createServiceEvidenceStorage(
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
    maxBytes: SERVICE_EVIDENCE_PHOTO_MAX_BYTES,
    validateBytes: (bytes, contentType) => {
      if (!acceptsServiceEvidencePhotoBytes(bytes, contentType))
        throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
    },
  })
  const descriptor = (
    target: ServiceEvidenceFileTarget,
  ): PrivateObjectDescriptor<string> => ({
    storagePath: serviceEvidenceStoragePath(target),
    contentDigest: target.contentDigest,
    contentType: target.contentType,
    sizeBytes: target.sizeBytes,
  })
  return {
    provider: config.provider,
    storeId: config.storeId,
    async stage(input: {
      target: ServiceEvidenceFileTarget
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
      target: ServiceEvidenceFileTarget
      abortSignal?: AbortSignal
    }) {
      return objects.read({
        object: descriptor(input.target),
        abortSignal: input.abortSignal,
      })
    },
  }
}
