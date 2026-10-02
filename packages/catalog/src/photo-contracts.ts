export const CATALOG_PHOTO_MAX_BYTES = 10 * 1024 * 1024
// Covers a target lookup, bounded byte read/processing/provider write and receipt
// completion already in flight when removal makes the asset inaccessible.
export const CATALOG_PHOTO_CLEANUP_GRACE_MS = 180_000

export type CatalogPhotoContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif"

export const CATALOG_PHOTO_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const

/** Pure key construction shared by storage verification and durable receipts. */
export function catalogPhotoStoragePath(
  photo: Pick<
    CatalogStoredPhoto,
    "assetId" | "tenantId" | "storeId" | "contentDigest" | "contentType"
  >,
) {
  const extensions: Record<CatalogPhotoContentType, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  }
  if (
    ![photo.assetId, photo.tenantId, photo.storeId].every((id) =>
      /^[a-zA-Z0-9_-]{1,128}$/.test(id),
    ) ||
    !/^[a-f0-9]{64}$/.test(photo.contentDigest) ||
    !Object.hasOwn(extensions, photo.contentType)
  ) {
    throw new CatalogPhotoStorageError(
      "INVALID_PHOTO",
      "Invalid photo identity.",
    )
  }
  return `catalog/quarantine/${photo.tenantId}/${photo.storeId}/${photo.assetId}/${photo.contentDigest}.${extensions[photo.contentType]}`
}

/** Original bytes remain quarantined; merchant delivery uses normalized WebP. */
export type CatalogStoredPhoto = {
  assetId: string
  tenantId: string
  storeId: string
  storageProvider: "vercel_blob_private"
  storagePath: string
  contentDigest: string
  contentType: CatalogPhotoContentType
  sizeBytes: number
}

/** Derived from authenticated Tenant/Store state, never an upload request body. */
export type CatalogPhotoScope = {
  tenantId: string
  storeId: string
  dataClassification: "LIVE" | "QA"
}

export type CatalogPhotoStorageErrorCode =
  | "INVALID_PHOTO"
  | "PHOTO_SCOPE_MISMATCH"
  | "PHOTO_NOT_FOUND"
  | "PHOTO_INTEGRITY_MISMATCH"
  | "PHOTO_STORAGE_UNAVAILABLE"

export class CatalogPhotoStorageError extends Error {
  constructor(
    readonly code: CatalogPhotoStorageErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "CatalogPhotoStorageError"
  }
}

export type CatalogPhotoVariant = "display" | "thumbnail"
export type CatalogPhotoDerivative = {
  assetId: string
  tenantId: string
  storeId: string
  sourceDigest: string
  processingVersion: string
  variant: CatalogPhotoVariant
  displayDigest: string
  storageStoreId: string
  storagePath: string
  contentDigest: string
  contentType: "image/webp"
  sizeBytes: number
  width: number
  height: number
}

/** Server-built versioned identity; never accept a caller-provided cache key. */
export function catalogPhotoDerivativePath(
  photo: Pick<
    CatalogPhotoDerivative,
    | "assetId"
    | "tenantId"
    | "storeId"
    | "sourceDigest"
    | "processingVersion"
    | "variant"
  >,
) {
  if (
    ![photo.assetId, photo.tenantId, photo.storeId].every((id) =>
      /^[a-zA-Z0-9_-]{1,128}$/.test(id),
    ) ||
    !/^[a-f0-9]{64}$/.test(photo.sourceDigest) ||
    !/^v1-[a-f0-9]{64}$/.test(photo.processingVersion) ||
    (photo.variant !== "display" && photo.variant !== "thumbnail")
  )
    throw new CatalogPhotoStorageError(
      "INVALID_PHOTO",
      "Invalid derivative identity.",
    )
  return `catalog/derivatives/${photo.tenantId}/${photo.storeId}/${photo.assetId}/${photo.sourceDigest}/${photo.processingVersion}/${photo.variant}.webp`
}
