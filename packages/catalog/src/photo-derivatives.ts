import { createPrivateObjectStorage } from "@ewatrade/private-media/object-storage"
import { createVercelPrivateObjectPort } from "@ewatrade/private-media/vercel-blob"
import { assertQaProviderAllowed } from "@ewatrade/utils/qa-provider-policy"
import {
  type CatalogPhotoDerivative,
  type CatalogPhotoScope,
  CatalogPhotoStorageError,
  catalogPhotoDerivativePath,
} from "./photo-contracts"

export function validateCatalogPhotoDerivative(photo: CatalogPhotoDerivative) {
  const limit = photo.variant === "display" ? 1600 : 320
  if (
    photo.storagePath !== catalogPhotoDerivativePath(photo) ||
    !/^store_[a-zA-Z0-9]+$/.test(photo.storageStoreId) ||
    !/^[a-f0-9]{64}$/.test(photo.contentDigest) ||
    !/^[a-f0-9]{64}$/.test(photo.displayDigest) ||
    (photo.variant === "display" &&
      photo.displayDigest !== photo.contentDigest) ||
    photo.contentType !== "image/webp" ||
    !Number.isSafeInteger(photo.sizeBytes) ||
    photo.sizeBytes < 16 ||
    photo.sizeBytes > 2 * 1024 * 1024 ||
    !Number.isSafeInteger(photo.width) ||
    photo.width < 1 ||
    photo.width > limit ||
    !Number.isSafeInteger(photo.height) ||
    photo.height < 1 ||
    photo.height > limit
  )
    throw new CatalogPhotoStorageError(
      "INVALID_PHOTO",
      "Invalid derivative receipt.",
    )
}

/** Validated private transport; current actor/public authorization stays upstream. */
export function createVercelCatalogPhotoDerivativeStorage() {
  const { port, configured, storeId } =
    createVercelPrivateObjectPort<"image/webp">()
  const objects = createPrivateObjectStorage({
    port,
    configured,
    maxBytes: 2 * 1024 * 1024,
    validateBytes: (bytes) => {
      if (
        Buffer.from(bytes.subarray(0, 4)).toString("ascii") !== "RIFF" ||
        Buffer.from(bytes.subarray(8, 12)).toString("ascii") !== "WEBP"
      )
        throw new CatalogPhotoStorageError(
          "INVALID_PHOTO",
          "Invalid derivative bytes.",
        )
    },
  })
  function target(scope: CatalogPhotoScope, photo: CatalogPhotoDerivative) {
    assertQaProviderAllowed({
      adapter: "live",
      operation: "media_analysis",
      tenantDataClassification: scope.dataClassification,
    })
    validateCatalogPhotoDerivative(photo)
    if (
      scope.tenantId !== photo.tenantId ||
      scope.storeId !== photo.storeId ||
      storeId !== photo.storageStoreId
    )
      throw new CatalogPhotoStorageError(
        "PHOTO_SCOPE_MISMATCH",
        "Derivative ownership unavailable.",
      )
    return photo
  }
  return {
    read: (
      scope: CatalogPhotoScope,
      photo: CatalogPhotoDerivative,
      abortSignal?: AbortSignal,
    ) => objects.read({ object: target(scope, photo), abortSignal }),
    write: (
      scope: CatalogPhotoScope,
      photo: CatalogPhotoDerivative,
      bytes: Uint8Array,
      abortSignal?: AbortSignal,
    ) => objects.write({ object: target(scope, photo), bytes, abortSignal }),
    remove: (
      scope: CatalogPhotoScope,
      photo: CatalogPhotoDerivative,
      abortSignal?: AbortSignal,
    ) => objects.remove({ object: target(scope, photo), abortSignal }),
  }
}
