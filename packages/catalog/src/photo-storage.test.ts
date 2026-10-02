import { describe, expect, test } from "bun:test"
import { QaProviderPolicyError } from "@ewatrade/utils/qa-provider-policy"
import {
  CATALOG_PHOTO_MAX_BYTES,
  type CatalogPhotoScope,
  CatalogPhotoStorageError,
} from "./photo-contracts"
import {
  type CatalogPhotoBlobPort,
  createCatalogPhotoStorage,
} from "./photo-storage"

const png = () =>
  new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      "base64",
    ),
  )
const liveScope: CatalogPhotoScope = {
  tenantId: "tenant-photo-fixture",
  storeId: "store-photo-fixture",
  dataClassification: "LIVE",
}
const qaScope: CatalogPhotoScope = { ...liveScope, dataClassification: "QA" }

function fixture() {
  const objects = new Map<string, Uint8Array>()
  const writes: string[] = []
  const reads: string[] = []
  let canceledReads = 0
  const blob: CatalogPhotoBlobPort = {
    async put(path, bytes, options) {
      writes.push(path)
      expect(options.access).toBe("private")
      expect(options.allowOverwrite).toBe(false)
      expect(options.addRandomSuffix).toBe(false)
      expect(options.cacheControlMaxAge).toBe(60)
      if (objects.has(path)) throw new Error("Path already exists")
      objects.set(path, bytes.slice())
    },
    async get(path, options) {
      reads.push(path)
      expect(options.access).toBe("private")
      expect(options.useCache).toBe(false)
      const bytes = objects.get(path)
      if (!bytes) return null
      return {
        contentType: "image/png",
        sizeBytes: bytes.byteLength,
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.slice())
            // Keep open so completion/error must explicitly cancel the reader.
          },
          pull(controller) {
            controller.close()
          },
          cancel() {
            canceledReads += 1
          },
        }),
      }
    },
  }
  return {
    blob,
    objects,
    writes,
    reads,
    canceledReads: () => canceledReads,
    storage: createCatalogPhotoStorage({ blob, configured: () => true }),
  }
}

const request = () => ({
  scope: liveScope,
  assetId: "asset-photo-fixture",
  bytes: png(),
  contentType: "image/png" as const,
})

describe("private Catalog photo storage", () => {
  test("stages under scoped content identity and returns no provider URL", async () => {
    const f = fixture()
    const photo = await f.storage.stage(request())
    expect(photo.storagePath).toMatch(
      /^catalog\/quarantine\/tenant-photo-fixture\/store-photo-fixture\/asset-photo-fixture\/[a-f0-9]{64}\.png$/,
    )
    expect(photo.sizeBytes).toBe(png().byteLength)
    expect(Object.keys(photo).sort()).toEqual(
      [
        "assetId",
        "tenantId",
        "storeId",
        "storageProvider",
        "storagePath",
        "contentDigest",
        "contentType",
        "sizeBytes",
      ].sort(),
    )
    expect(await f.storage.read({ scope: liveScope, photo })).toEqual(png())
  })

  test("replay verifies existing bytes and does not overwrite them", async () => {
    const f = fixture()
    const first = await f.storage.stage(request())
    const replay = await f.storage.stage(request())
    expect(replay).toEqual(first)
    expect(f.objects.size).toBe(1)
    expect(f.reads).toEqual([first.storagePath])
    f.objects.set(
      first.storagePath,
      png().map((byte) => byte ^ 1),
    )
    await expect(f.storage.stage(request())).rejects.toMatchObject({
      code: "PHOTO_INTEGRITY_MISMATCH",
    })
  })

  test("retry recovers a write whose first outcome was unknown", async () => {
    const f = fixture()
    let failed = false
    const blob: CatalogPhotoBlobPort = {
      ...f.blob,
      async put(path, bytes, options) {
        const result = await f.blob.put(path, bytes, options)
        if (!failed) {
          failed = true
          throw new Error("lost response after the provider stored the bytes")
        }
        return result
      },
    }
    const storage = createCatalogPhotoStorage({ blob, configured: () => true })
    const recovered = await storage.stage(request())
    const retry = await storage.stage(request())
    expect(recovered).toEqual(retry)
    expect(f.objects.size).toBe(1)
    expect(f.writes).toEqual([retry.storagePath, retry.storagePath])
    expect(f.reads).toEqual([retry.storagePath, retry.storagePath])
  })

  test("QA data cannot reach live storage even for a read", async () => {
    const f = fixture()
    await expect(
      f.storage.stage({ ...request(), scope: qaScope }),
    ).rejects.toBeInstanceOf(QaProviderPolicyError)
    expect(f.writes).toEqual([])
    const photo = await f.storage.stage(request())
    await expect(
      f.storage.read({ scope: qaScope, photo }),
    ).rejects.toMatchObject({ code: "QA_LIVE_EFFECT_BLOCKED" })
    expect(f.reads).toEqual([])
  })

  test("cross-Tenant/Store and arbitrary paths are rejected before provider read", async () => {
    const f = fixture()
    const photo = await f.storage.stage(request())
    for (const scope of [
      { ...liveScope, tenantId: "other-tenant" },
      { ...liveScope, storeId: "other-store" },
      { ...liveScope, storeId: "../outside" },
    ]) {
      await expect(f.storage.read({ scope, photo })).rejects.toMatchObject({
        code: "PHOTO_SCOPE_MISMATCH",
      })
    }
    for (const path of [
      "https://private.example/photo.png",
      photo.storagePath.replace("quarantine", "approved"),
    ]) {
      await expect(
        f.storage.read({
          scope: liveScope,
          photo: { ...photo, storagePath: path },
        }),
      ).rejects.toMatchObject({ code: "PHOTO_SCOPE_MISMATCH" })
    }
    expect(f.reads).toEqual([])
  })

  test("invalid identities, MIME mismatch, empty and oversized bytes never upload", async () => {
    const f = fixture()
    const oversized = new Uint8Array(CATALOG_PHOTO_MAX_BYTES + 1)
    oversized.set(png())
    for (const candidate of [
      { ...request(), assetId: "../outside" },
      { ...request(), bytes: new Uint8Array() },
      { ...request(), bytes: oversized },
      {
        ...request(),
        bytes: new TextEncoder().encode("<svg>not a photo</svg>"),
      },
      { ...request(), bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) },
    ]) {
      await expect(f.storage.stage(candidate)).rejects.toBeInstanceOf(
        CatalogPhotoStorageError,
      )
    }
    expect(f.writes).toEqual([])
  })

  test("input buffer mutation during upload cannot change the staged identity", async () => {
    const f = fixture()
    const candidate = request()
    const blob: CatalogPhotoBlobPort = {
      ...f.blob,
      async put(path, bytes, options) {
        candidate.bytes.fill(0)
        return f.blob.put(path, bytes, options)
      },
    }
    const storage = createCatalogPhotoStorage({ blob, configured: () => true })
    const photo = await storage.stage(candidate)
    expect(await storage.read({ scope: liveScope, photo })).toEqual(png())
  })

  test("stored descriptor mutation during read cannot change integrity authority", async () => {
    const f = fixture()
    const photo = await f.storage.stage(request())
    const blob: CatalogPhotoBlobPort = {
      ...f.blob,
      async get(path, options) {
        photo.contentDigest = "0".repeat(64)
        photo.sizeBytes = 1
        return f.blob.get(path, options)
      },
    }
    const storage = createCatalogPhotoStorage({ blob, configured: () => true })
    expect(await storage.read({ scope: liveScope, photo })).toEqual(png())
  })

  test("truncated, extra and modified stored bytes fail their original digest", async () => {
    const f = fixture()
    const photo = await f.storage.stage(request())
    for (const bytes of [
      png().slice(0, -1),
      new Uint8Array([...png(), 0]),
      png().map((byte, index) => (index === 20 ? byte ^ 1 : byte)),
    ]) {
      f.objects.set(photo.storagePath, bytes)
      await expect(
        f.storage.read({ scope: liveScope, photo }),
      ).rejects.toMatchObject({ code: "PHOTO_INTEGRITY_MISMATCH" })
    }
  })

  test("stream exceeding its advertised size is canceled without buffering the remainder", async () => {
    const f = fixture()
    const photo = await f.storage.stage(request())
    let canceled = false
    const blob: CatalogPhotoBlobPort = {
      ...f.blob,
      async get() {
        return {
          sizeBytes: photo.sizeBytes,
          contentType: "image/png",
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(photo.sizeBytes + 1))
            },
            cancel() {
              canceled = true
            },
          }),
        }
      },
    }
    const storage = createCatalogPhotoStorage({ blob, configured: () => true })
    await expect(
      storage.read({ scope: liveScope, photo }),
    ).rejects.toMatchObject({
      code: "PHOTO_INTEGRITY_MISMATCH",
    })
    expect(canceled).toBe(true)
  })

  test("many small chunks preserve exact bytes without changing content identity", async () => {
    const f = fixture()
    const photo = await f.storage.stage(request())
    let offset = 0
    const blob: CatalogPhotoBlobPort = {
      ...f.blob,
      async get() {
        return {
          sizeBytes: photo.sizeBytes,
          contentType: "image/png",
          stream: new ReadableStream({
            pull(controller) {
              if (offset === photo.sizeBytes) controller.close()
              else controller.enqueue(png().slice(offset, ++offset))
            },
          }),
        }
      },
    }
    const storage = createCatalogPhotoStorage({ blob, configured: () => true })
    expect(await storage.read({ scope: liveScope, photo })).toEqual(png())
  })

  test("missing configuration and unavailable objects never masquerade as saved photos", async () => {
    const f = fixture()
    const storage = createCatalogPhotoStorage({
      blob: f.blob,
      configured: () => false,
    })
    await expect(storage.stage(request())).rejects.toMatchObject({
      code: "PHOTO_STORAGE_UNAVAILABLE",
    })
    expect(f.writes).toEqual([])
    const photo = await f.storage.stage(request())
    f.objects.clear()
    await expect(
      f.storage.read({ scope: liveScope, photo }),
    ).rejects.toMatchObject({ code: "PHOTO_NOT_FOUND" })
  })

  test("cancellation interrupts a stalled stream and does not wait on broken cleanup", async () => {
    const f = fixture()
    const photo = await f.storage.stage(request())
    const abort = new AbortController()
    let canceled = false
    const blob: CatalogPhotoBlobPort = {
      ...f.blob,
      async get() {
        return {
          sizeBytes: photo.sizeBytes,
          contentType: "image/png",
          stream: new ReadableStream(
            {
              pull() {
                abort.abort(new Error("fixture canceled"))
              },
              cancel() {
                canceled = true
                return new Promise(() => {})
              },
            },
            { highWaterMark: 0 },
          ),
        }
      },
    }
    const storage = createCatalogPhotoStorage({ blob, configured: () => true })
    await expect(
      storage.read({ scope: liveScope, photo, abortSignal: abort.signal }),
    ).rejects.toMatchObject({ code: "PHOTO_STORAGE_UNAVAILABLE" })
    expect(canceled).toBe(true)
  })

  test("already canceled requests make no provider call", async () => {
    const f = fixture()
    const photo = await f.storage.stage(request())
    const abort = new AbortController()
    abort.abort()
    await expect(
      f.storage.stage({ ...request(), abortSignal: abort.signal }),
    ).rejects.toMatchObject({ code: "PHOTO_STORAGE_UNAVAILABLE" })
    await expect(
      f.storage.read({ scope: liveScope, photo, abortSignal: abort.signal }),
    ).rejects.toMatchObject({ code: "PHOTO_STORAGE_UNAVAILABLE" })
    expect(f.writes).toHaveLength(1)
    expect(f.reads).toEqual([])
  })

  test("provider credential diagnostics are not returned in error text or cause", async () => {
    const f = fixture()
    const blob: CatalogPhotoBlobPort = {
      ...f.blob,
      async put() {
        throw new Error("secret-token at https://private.example/photo.png")
      },
    }
    const storage = createCatalogPhotoStorage({ blob, configured: () => true })
    try {
      await storage.stage(request())
      throw new Error("Expected storage failure")
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogPhotoStorageError)
      expect(String(error)).not.toContain("secret-token")
      expect(String(error)).not.toContain("private.example")
      expect(error).not.toHaveProperty("cause")
    }
  })
  test("deletion preserves exact Store identity and the QA provider boundary", async () => {
    const f = fixture()
    const deleted: string[] = []
    const storage = createCatalogPhotoStorage({
      blob: {
        ...f.blob,
        delete: async (path) => {
          deleted.push(path)
        },
      },
      configured: () => true,
    })
    const photo = await storage.stage(request())
    await expect(
      storage.remove({ scope: { ...liveScope, storeId: "foreign" }, photo }),
    ).rejects.toMatchObject({ code: "PHOTO_SCOPE_MISMATCH" })
    await expect(
      storage.remove({
        scope: { ...liveScope, dataClassification: "QA" },
        photo,
      }),
    ).rejects.toThrow()
    expect(deleted).toEqual([])
    await storage.remove({ scope: liveScope, photo })
    expect(deleted).toEqual([photo.storagePath])
  })
})
