import { afterEach, beforeEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createLocalTestPrivateObjectPort } from "@ewatrade/private-media/local-test-object-port"
import sharp from "sharp"
import { catalogPhotoStoragePath } from "./photo-contracts"
import { processCatalogPhoto } from "./photo-processing"
import {
  catalogPhotoStorageIdentity,
  catalogPublicPhotoProviderFilter,
  isLocalCatalogPhotoQaEnabled,
} from "./photo-qa-policy"
import { createLocalQaCatalogPhotoReviewProvider } from "./photo-qa-review"
import { reviewCatalogPhoto } from "./photo-review"
import { createCatalogPhotoStorage } from "./photo-storage"
import { uploadCatalogPhoto } from "./photo-upload"

const original = {
  APP_ENV: process.env.APP_ENV,
  DEV_PROFILE: process.env.DEV_PROFILE,
  NODE_ENV: process.env.NODE_ENV,
}
const scope = {
  tenantId: "qa-tenant",
  storeId: "qa-store",
  dataClassification: "QA" as const,
}
let root = ""
beforeEach(async () => {
  process.env.APP_ENV = "local"
  process.env.DEV_PROFILE = "local"
  process.env.NODE_ENV = "test"
  root = await mkdtemp(join(tmpdir(), "catalog-qa-port-"))
})
afterEach(async () => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await rm(root, { recursive: true, force: true })
})
function storage() {
  const config = createLocalTestPrivateObjectPort<"image/png">({
    rootDir: root,
  })
  return createCatalogPhotoStorage({
    blob: config.port,
    configured: config.configured,
    provider: "local_test",
  })
}
async function fixture(name = "qa-primary") {
  return new Uint8Array(
    await Bun.file(
      new URL(`../fixtures/${name}.png`, import.meta.url),
    ).arrayBuffer(),
  )
}

test("local QA is refused outside the explicit local nonproduction runtime; public filters agree", () => {
  for (const environment of [
    { APP_ENV: "production", DEV_PROFILE: "local", NODE_ENV: "development" },
    { APP_ENV: "local", DEV_PROFILE: "local", NODE_ENV: "production" },
    { APP_ENV: "preview", DEV_PROFILE: "local" },
    { APP_ENV: "local", DEV_PROFILE: "dev" },
    {},
  ]) {
    expect(isLocalCatalogPhotoQaEnabled(environment)).toBe(false)
    expect(() => catalogPhotoStorageIdentity("QA", environment)).toThrow()
    expect(catalogPublicPhotoProviderFilter(environment).OR).toHaveLength(1)
  }
  expect(catalogPhotoStorageIdentity("QA").provider).toBe("local_test")
  expect(catalogPhotoStorageIdentity("LIVE").provider).toBe(
    "vercel_blob_private",
  )
  expect(catalogPublicPhotoProviderFilter().OR).toHaveLength(2)
})

test("QA original bytes round-trip through the shared private file port with scope and integrity checks", async () => {
  const port = storage()
  const bytes = await fixture()
  const photo = await port.stage({
    scope,
    assetId: "qa-photo",
    bytes,
    contentType: "image/png",
  })
  expect(photo.storageProvider).toBe("local_test")
  expect(await port.read({ scope, photo })).toEqual(bytes)
  await expect(
    port.read({ scope: { ...scope, storeId: "foreign-store" }, photo }),
  ).rejects.toThrow()
  await expect(
    port.read({
      scope,
      photo: { ...photo, storageProvider: "vercel_blob_private" },
    }),
  ).rejects.toThrow()
  expect(() =>
    port.assertAvailable({ ...scope, dataClassification: "LIVE" }),
  ).toThrow()
  process.env.NODE_ENV = "production"
  await expect(port.read({ scope, photo })).rejects.toThrow()
})

test("registered synthetic images are reviewed on normalized bytes with test-specific provenance", async () => {
  const port = storage()
  for (const name of ["qa-primary", "qa-secondary"]) {
    const bytes = await fixture(name)
    const photo = await port.stage({
      scope,
      assetId: name,
      bytes,
      contentType: "image/png",
    })
    const verdict = await reviewCatalogPhoto({
      scope,
      photo,
      provider: createLocalQaCatalogPhotoReviewProvider(),
      read: (signal) => port.read({ scope, photo, abortSignal: signal }),
      commit: async (verdict) => verdict,
    })
    expect(verdict).toMatchObject({
      verdict: "APPROVED",
      provider: "local_qa_fixture",
      policyVersion: "registered-fixtures-v1",
      sourceDigest: photo.contentDigest,
    })
    expect(verdict.displayDigest).toBe(
      (await processCatalogPhoto({ bytes, contentType: "image/png" })).display
        .contentDigest,
    )
  }
})

test("unregistered images are rejected and a QA review provider cannot approve live data", async () => {
  const bytes = new Uint8Array(
    await sharp({
      create: { width: 8, height: 8, channels: 3, background: "red" },
    })
      .png()
      .toBuffer(),
  )
  const port = storage()
  const photo = await port.stage({
    scope,
    assetId: "unknown",
    bytes,
    contentType: "image/png",
  })
  const input = {
    scope,
    photo,
    provider: createLocalQaCatalogPhotoReviewProvider(),
    read: async () => bytes,
    commit: async (verdict: { verdict: "APPROVED" | "REJECTED" }) => verdict,
  }
  expect((await reviewCatalogPhoto(input)).verdict).toBe("REJECTED")
  await expect(
    reviewCatalogPhoto({
      ...input,
      scope: { ...scope, dataClassification: "LIVE" },
    }),
  ).rejects.toThrow()
})

test("upload refuses a provider-mismatched QA receipt before completing the intent", async () => {
  const bytes = await fixture()
  const target = {
    scope,
    assetId: "qa-upload",
    contentType: "image/png" as const,
    sizeBytes: bytes.length,
    contentDigest: createHash("sha256").update(bytes).digest("hex"),
  }
  let commits = 0
  await expect(
    uploadCatalogPhoto({
      request: new Request("http://test.invalid/upload", {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: new Blob([bytes]),
      }),
      target,
      storage: {
        assertAvailable: () => {},
        stage: async () => ({
          ...target,
          ...scope,
          storageProvider: "vercel_blob_private" as const,
          storagePath: catalogPhotoStoragePath({ ...target, ...scope }),
        }),
      },
      complete: async () => {
        commits++
      },
    }),
  ).rejects.toThrow()
  expect(commits).toBe(0)
})
