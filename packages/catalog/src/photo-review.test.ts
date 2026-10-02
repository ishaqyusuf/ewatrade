import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import sharp from "sharp"
import {
  type CatalogStoredPhoto,
  catalogPhotoStoragePath,
} from "./photo-contracts"
import { reviewCatalogPhoto } from "./photo-review"

test("review inspects normalized bytes and binds approval to both immutable digests", async () => {
  const bytes = await sharp({
    create: { width: 20, height: 30, channels: 3, background: "red" },
  })
    .png()
    .toBuffer()
  const photo: CatalogStoredPhoto = {
    assetId: "photo",
    tenantId: "tenant",
    storeId: "store",
    contentType: "image/png",
    contentDigest: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length,
    storageProvider: "vercel_blob_private",
    storagePath: "",
  }
  photo.storagePath = catalogPhotoStoragePath(photo)
  const input: Parameters<typeof reviewCatalogPhoto>[0] = {
    photo,
    scope: { tenantId: "tenant", storeId: "store", dataClassification: "LIVE" },
    read: async () => bytes,
    provider: {
      id: "owned-test-port",
      policyVersion: "v1",
      inspect: async (request) => {
        expect((await sharp(request.bytes).metadata()).format).toBe("webp")
        return "APPROVED"
      },
    },
    commit: async (result) => result,
  }
  const result = await reviewCatalogPhoto(input)
  expect(result).toMatchObject({
    sourceDigest: photo.contentDigest,
    provider: "owned-test-port",
    verdict: "APPROVED",
  })
  let commits = 0
  input.commit = async () => {
    commits++
    return null
  }
  input.read = async () => new Uint8Array([1])
  await expect(reviewCatalogPhoto(input)).rejects.toThrow(
    "could not be verified",
  )
  expect(commits).toBe(0)
  input.scope.dataClassification = "QA"
  await expect(reviewCatalogPhoto(input)).rejects.toThrow()
  expect(commits).toBe(0)
})
