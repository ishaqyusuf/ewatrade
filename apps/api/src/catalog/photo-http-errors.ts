import { CatalogPhotoStorageError } from "@ewatrade/catalog/photo-contracts"
import { CatalogPhotoProcessingError } from "@ewatrade/catalog/photo-processing"
import { CatalogPhotoUploadError } from "@ewatrade/catalog/photo-upload"
import { CatalogPhotoError } from "@ewatrade/db/catalog-photos"
import { QaProviderPolicyError } from "@ewatrade/utils/qa-provider-policy"
import { TRPCError } from "@trpc/server"
import { getHTTPStatusCodeFromError } from "@trpc/server/http"
import { catalogPhotoTRPCError } from "../trpc/routers/catalog-photos"

export function catalogPhotoHttpError(error: unknown) {
  const mapped =
    error instanceof CatalogPhotoError ? catalogPhotoTRPCError(error) : error
  let status: number
  if (mapped instanceof TRPCError) status = getHTTPStatusCodeFromError(mapped)
  else if (mapped instanceof CatalogPhotoUploadError) status = mapped.status
  else if (mapped instanceof QaProviderPolicyError) status = 412
  else if (mapped instanceof CatalogPhotoProcessingError)
    status = mapped.code === "PHOTO_PROCESSING_BUSY" ? 429 : 400
  else if (mapped instanceof CatalogPhotoStorageError)
    status = mapped.code === "INVALID_PHOTO" ? 400 : 503
  else throw error
  return Response.json(
    { error: mapped.message },
    { status, headers: { "Cache-Control": "private, no-store" } },
  )
}
