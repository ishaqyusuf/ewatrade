import { createHash } from "node:crypto"
import {
  CATALOG_PHOTO_MAX_BYTES,
  type CatalogPhotoContentType,
  type CatalogPhotoScope,
  CatalogPhotoStorageError,
  type CatalogStoredPhoto,
  catalogPhotoStoragePath,
} from "./photo-contracts"

export type CatalogPhotoUploadTarget = {
  assetId: string
  scope: CatalogPhotoScope
  contentDigest: string
  contentType: CatalogPhotoContentType
  sizeBytes: number
}

export class CatalogPhotoUploadError extends Error {
  constructor(
    readonly status: 400 | 408 | 413,
    message: string,
  ) {
    super(message)
    this.name = "CatalogPhotoUploadError"
  }
}

function cancel(stream: ReadableStream<Uint8Array> | null) {
  // A peer-controlled cancellation promise must not hold the response open.
  if (stream) void stream.cancel().catch(() => undefined)
}

async function readUpload(request: Request, target: CatalogPhotoUploadTarget) {
  const length = request.headers.get("content-length")
  const encoding = request.headers.get("content-encoding")
  if (
    request.headers.get("content-type") !== target.contentType ||
    (encoding !== null && encoding !== "identity") ||
    (length !== null &&
      (!/^\d+$/.test(length) || Number(length) !== target.sizeBytes))
  ) {
    cancel(request.body)
    throw new CatalogPhotoUploadError(
      400,
      "Photo bytes must match the upload intent.",
    )
  }
  if (!request.body)
    throw new CatalogPhotoUploadError(400, "Choose a photo to upload.")
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)])
  const reader = request.body.getReader()
  const bytes = new Uint8Array(target.sizeBytes)
  let offset = 0
  let chunks = 0
  const hash = createHash("sha256")
  try {
    while (true) {
      signal.throwIfAborted()
      const result = await new Promise<Awaited<ReturnType<typeof reader.read>>>(
        (resolve, reject) => {
          const abort = () => {
            void reader.cancel().catch(() => undefined)
            reject(signal.reason)
          }
          signal.addEventListener("abort", abort, { once: true })
          reader.read().then(
            (result) => {
              signal.removeEventListener("abort", abort)
              resolve(result)
            },
            (error) => {
              signal.removeEventListener("abort", abort)
              reject(error)
            },
          )
        },
      )
      if (result.done) break
      if (
        !result.value.byteLength ||
        ++chunks > 65_536 ||
        offset + result.value.byteLength > target.sizeBytes
      ) {
        throw new CatalogPhotoUploadError(413, "Photo exceeds its upload size.")
      }
      bytes.set(result.value, offset)
      hash.update(bytes.subarray(offset, offset + result.value.byteLength))
      offset += result.value.byteLength
    }
    if (
      offset !== target.sizeBytes ||
      hash.digest("hex") !== target.contentDigest
    ) {
      throw new CatalogPhotoUploadError(
        400,
        "Photo bytes must match the upload intent.",
      )
    }
    return bytes
  } catch (error) {
    if (error instanceof CatalogPhotoUploadError) throw error
    throw new CatalogPhotoUploadError(
      408,
      "Photo upload was interrupted. Retry the same photo; your draft is unchanged.",
    )
  } finally {
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/** Authorization resolves the target before this function sees request bytes. */
export async function uploadCatalogPhoto<T>(input: {
  request: Request
  target: CatalogPhotoUploadTarget
  storage: {
    assertAvailable(scope: CatalogPhotoScope): void
    stage(input: {
      scope: CatalogPhotoScope
      assetId: string
      bytes: Uint8Array
      contentType: CatalogPhotoContentType
      abortSignal?: AbortSignal
    }): Promise<CatalogStoredPhoto>
  }
  complete(photo: CatalogStoredPhoto): Promise<T>
  validate?(input: {
    bytes: Uint8Array
    contentType: CatalogPhotoContentType
    signal: AbortSignal
  }): Promise<void>
}) {
  // Both identity and bytes are immutable across provider/repository awaits.
  const target = { ...input.target, scope: { ...input.target.scope } }
  try {
    catalogPhotoStoragePath({ ...target, ...target.scope })
    if (
      !Number.isSafeInteger(target.sizeBytes) ||
      target.sizeBytes < 1 ||
      target.sizeBytes > CATALOG_PHOTO_MAX_BYTES
    ) {
      throw new CatalogPhotoUploadError(
        413,
        "Choose a photo smaller than 10 MB.",
      )
    }
    input.storage.assertAvailable(target.scope)
  } catch (error) {
    cancel(input.request.body)
    throw error
  }
  const bytes = await readUpload(input.request, target)
  await input.validate?.({
    bytes: bytes.slice(),
    contentType: target.contentType,
    signal: input.request.signal,
  })
  const photo = await input.storage.stage({
    scope: { ...target.scope },
    assetId: target.assetId,
    bytes,
    contentType: target.contentType,
    abortSignal: input.request.signal,
  })
  // Do not trust an incorrectly configured adapter to complete another intent.
  if (
    photo.assetId !== target.assetId ||
    photo.tenantId !== target.scope.tenantId ||
    photo.storeId !== target.scope.storeId ||
    photo.contentDigest !== target.contentDigest ||
    photo.contentType !== target.contentType ||
    photo.sizeBytes !== target.sizeBytes ||
    photo.storageProvider !== "vercel_blob_private" ||
    photo.storagePath !== catalogPhotoStoragePath(photo)
  ) {
    throw new CatalogPhotoStorageError(
      "PHOTO_INTEGRITY_MISMATCH",
      "This stored photo could not be verified.",
    )
  }
  return input.complete({ ...photo })
}
