import { createHash } from "node:crypto"
import {
  type PrivateObjectPort,
  PrivateObjectStorageError,
  createPrivateObjectStorage,
} from "@ewatrade/private-media/object-storage"
import { createVercelPrivateObjectPort } from "@ewatrade/private-media/vercel-blob"
import { assertQaProviderAllowed } from "@ewatrade/utils/qa-provider-policy"
import {
  CATALOG_PHOTO_MAX_BYTES,
  type CatalogPhotoContentType,
  type CatalogPhotoScope,
  CatalogPhotoStorageError,
  type CatalogStoredPhoto,
  catalogPhotoStoragePath,
} from "./photo-contracts"

/** Stable Catalog port alias; the shared transport never grants actor authority. */
export type CatalogPhotoBlobPort = PrivateObjectPort<CatalogPhotoContentType>

function assertServer() {
  if (typeof window !== "undefined") {
    throw new CatalogPhotoStorageError(
      "PHOTO_STORAGE_UNAVAILABLE",
      "Catalog photo storage is available only on the server.",
    )
  }
}

function assertScope(scope: CatalogPhotoScope) {
  assertServer()
  for (const id of [scope.tenantId, scope.storeId]) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      throw new CatalogPhotoStorageError(
        "PHOTO_SCOPE_MISMATCH",
        "The photo does not belong to the selected business and Store.",
      )
    }
  }
  assertQaProviderAllowed({
    adapter: "live",
    operation: "media_analysis",
    tenantDataClassification: scope.dataClassification,
  })
}

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

function photoPath(input: {
  scope: CatalogPhotoScope
  assetId: string
  contentDigest: string
  contentType: CatalogPhotoContentType
}) {
  return catalogPhotoStoragePath({ ...input, ...input.scope })
}

/** Signature checks are upload validation, not decoding or a safety verdict. */
function assertPhotoBytes(bytes: Uint8Array, type: CatalogPhotoContentType) {
  const size = bytes.byteLength
  const hasSignature =
    type === "image/jpeg"
      ? size >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : type === "image/png"
        ? size >= 8 &&
          [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
            (value, index) => bytes[index] === value,
          )
        : type === "image/webp"
          ? size >= 16 &&
            Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
            Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
          : (type === "image/heic" || type === "image/heif") &&
            size >= 12 &&
            Buffer.from(bytes.subarray(4, 8)).toString("ascii") === "ftyp" &&
            /^(heic|heix|hevc|hevx|mif1|msf1|heif)$/.test(
              Buffer.from(bytes.subarray(8, 12)).toString("ascii"),
            )
  if (!hasSignature || size > CATALOG_PHOTO_MAX_BYTES) {
    throw new CatalogPhotoStorageError(
      "INVALID_PHOTO",
      "Choose a JPG, PNG, WebP or HEIC image smaller than 10 MB.",
    )
  }
}

function storageFailure(error: unknown): never {
  if (error instanceof CatalogPhotoStorageError) throw error
  if (error instanceof PrivateObjectStorageError) {
    if (error.code === "OBJECT_NOT_FOUND")
      throw new CatalogPhotoStorageError("PHOTO_NOT_FOUND", "Photo not found.")
    if (error.code === "INTEGRITY_MISMATCH")
      throw new CatalogPhotoStorageError(
        "PHOTO_INTEGRITY_MISMATCH",
        "This stored photo could not be verified.",
      )
  }
  // Provider exception text can contain private URLs or credential diagnostics.
  throw new CatalogPhotoStorageError(
    "PHOTO_STORAGE_UNAVAILABLE",
    "Photos could not be saved. Try again; your draft is unchanged.",
  )
}

/**
 * Storage only. Callers must authorize the actor and persist scoped asset facts.
 * A successful stage does not approve, publish or attach the photo to an Item.
 */
export function createCatalogPhotoStorage(input: {
  blob: CatalogPhotoBlobPort
  configured: () => boolean
}) {
  assertServer()
  const objects = createPrivateObjectStorage({
    port: input.blob,
    configured: input.configured,
    maxBytes: CATALOG_PHOTO_MAX_BYTES,
    // Photo validation remains in the Catalog facade.
    validateBytes: () => undefined,
  })
  function assertReady(scope: CatalogPhotoScope) {
    assertScope(scope)
    if (!input.configured()) {
      throw new CatalogPhotoStorageError(
        "PHOTO_STORAGE_UNAVAILABLE",
        "Photo storage is not configured yet. Your draft is unchanged.",
      )
    }
  }
  return {
    assertAvailable: assertReady,
    async remove(request: {
      scope: CatalogPhotoScope
      photo: CatalogStoredPhoto
      abortSignal?: AbortSignal
    }) {
      assertReady(request.scope)
      const photo = { ...request.photo }
      if (
        photo.tenantId !== request.scope.tenantId ||
        photo.storeId !== request.scope.storeId ||
        photo.storageProvider !== "vercel_blob_private" ||
        photo.storagePath !== catalogPhotoStoragePath(photo)
      )
        throw new CatalogPhotoStorageError(
          "PHOTO_SCOPE_MISMATCH",
          "Photo scope does not match.",
        )
      if (!input.blob.delete)
        throw new CatalogPhotoStorageError(
          "PHOTO_STORAGE_UNAVAILABLE",
          "Photo removal is unavailable.",
        )
      try {
        await objects.remove({
          object: photo,
          abortSignal: request.abortSignal,
        })
      } catch (error) {
        storageFailure(error)
      }
    },
    async stage(request: {
      scope: CatalogPhotoScope
      assetId: string
      bytes: Uint8Array
      contentType: CatalogPhotoContentType
      abortSignal?: AbortSignal
    }): Promise<CatalogStoredPhoto> {
      assertReady(request.scope)
      assertPhotoBytes(request.bytes, request.contentType)
      // Bound allocation, then snapshot mutable input before any provider await.
      const bytes = request.bytes.slice()
      const contentDigest = digest(bytes)
      const photo: CatalogStoredPhoto = {
        assetId: request.assetId,
        tenantId: request.scope.tenantId,
        storeId: request.scope.storeId,
        storageProvider: "vercel_blob_private",
        storagePath: photoPath({
          ...request,
          contentDigest,
        }),
        contentDigest,
        contentType: request.contentType,
        sizeBytes: bytes.byteLength,
      }
      try {
        await objects.write({
          object: photo,
          bytes,
          abortSignal: request.abortSignal,
        })
        return photo
      } catch (error) {
        storageFailure(error)
      }
    },
    async read(request: {
      scope: CatalogPhotoScope
      photo: CatalogStoredPhoto
      abortSignal?: AbortSignal
    }): Promise<Uint8Array> {
      assertReady(request.scope)
      const photo = { ...request.photo }
      const scope = { ...request.scope }
      if (
        photo.tenantId !== scope.tenantId ||
        photo.storeId !== scope.storeId ||
        photo.storageProvider !== "vercel_blob_private" ||
        photo.storagePath !== photoPath({ ...photo, scope }) ||
        !Number.isSafeInteger(photo.sizeBytes) ||
        photo.sizeBytes <= 0 ||
        photo.sizeBytes > CATALOG_PHOTO_MAX_BYTES
      ) {
        throw new CatalogPhotoStorageError(
          "PHOTO_SCOPE_MISMATCH",
          "The photo does not belong to the selected business and Store.",
        )
      }
      try {
        const bytes = await objects.read({
          object: photo,
          abortSignal: request.abortSignal,
        })
        assertPhotoBytes(bytes, photo.contentType)
        return bytes
      } catch (error) {
        storageFailure(error)
      }
    },
  }
}

export function createVercelCatalogPhotoStorage() {
  assertServer()
  const { port, configured } =
    createVercelPrivateObjectPort<CatalogPhotoContentType>()
  return createCatalogPhotoStorage({ blob: port, configured })
}
