import {
  CATALOG_PHOTO_CONTENT_TYPES,
  CATALOG_PHOTO_MAX_BYTES,
  type CatalogPhotoContentType,
} from "./photo-contracts"

export type CatalogPhotoClientIntent = { assetId: string; state: string }

/** Shared browser/native orchestration. The caller snapshots its authenticated
 * scope and supplies matching transport headers; no provider details enter UI. */
export async function uploadCatalogPhotoDraft(input: {
  clientOperationId: string
  storeId: string
  contentType: string
  readBytes(): Promise<Uint8Array>
  digest(bytes: Uint8Array): Promise<string>
  assertCurrent(): void
  createIntent(input: {
    clientOperationId: string
    storeId: string
    contentType: CatalogPhotoContentType
    contentDigest: string
    sizeBytes: number
  }): Promise<CatalogPhotoClientIntent>
  upload(
    assetId: string,
    bytes: Uint8Array,
    contentType: CatalogPhotoContentType,
  ): Promise<CatalogPhotoClientIntent>
}) {
  input.assertCurrent()
  const contentType = CATALOG_PHOTO_CONTENT_TYPES.find(
    (type) => type === input.contentType,
  )
  if (!contentType) throw new Error("Choose a JPG, PNG, WebP or HEIC photo.")
  const bytes = (await input.readBytes()).slice()
  input.assertCurrent()
  if (!bytes.byteLength || bytes.byteLength > CATALOG_PHOTO_MAX_BYTES)
    throw new Error("Choose a photo smaller than 10 MB.")
  const contentDigest = await input.digest(bytes)
  input.assertCurrent()
  const intent = await input.createIntent({
    clientOperationId: input.clientOperationId,
    storeId: input.storeId,
    contentType,
    contentDigest,
    sizeBytes: bytes.byteLength,
  })
  input.assertCurrent()
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(intent.assetId))
    throw new Error("Photo upload could not be confirmed.")
  if (intent.state === "APPROVED" || intent.state === "PENDING_REVIEW")
    return intent.assetId
  if (intent.state !== "UPLOADING")
    throw new Error("This photo is no longer available. Choose it again.")
  const uploaded = await input.upload(intent.assetId, bytes, contentType)
  input.assertCurrent()
  if (
    uploaded.assetId !== intent.assetId ||
    !["PENDING_REVIEW", "APPROVED"].includes(uploaded.state)
  )
    throw new Error(
      "Photo upload could not be confirmed. Retry the same photo.",
    )
  return intent.assetId
}
