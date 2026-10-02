import { describe, expect, mock, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  type CatalogStoredPhoto,
  catalogPhotoStoragePath,
} from "./photo-contracts"
import { createCatalogPhotoStorage } from "./photo-storage"
import {
  type CatalogPhotoUploadTarget,
  uploadCatalogPhoto,
} from "./photo-upload"

// Transport/signature fixture only; this is not a decoded/screened image.
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
function target(): CatalogPhotoUploadTarget {
  return {
    assetId: "one",
    scope: { tenantId: "tenant", storeId: "store", dataClassification: "LIVE" },
    contentDigest: createHash("sha256").update(bytes).digest("hex"),
    contentType: "image/png",
    sizeBytes: bytes.length,
  }
}
function request(
  body: BodyInit = bytes,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
) {
  return new Request("https://example.invalid/photos/one", {
    method: "PUT",
    body,
    headers: { "content-type": "image/png", ...headers },
    signal,
  })
}
function fixture() {
  const stage = mock(
    async (input: {
      scope: CatalogPhotoUploadTarget["scope"]
      assetId: string
      bytes: Uint8Array
      contentType: "image/png" | "image/jpeg" | "image/webp"
    }) => {
      const photo: CatalogStoredPhoto = {
        assetId: input.assetId,
        ...input.scope,
        contentDigest: createHash("sha256").update(input.bytes).digest("hex"),
        contentType: input.contentType,
        sizeBytes: input.bytes.length,
        storageProvider: "vercel_blob_private",
        storagePath: "",
      }
      photo.storagePath = catalogPhotoStoragePath(photo)
      return photo
    },
  )
  const complete = mock(async (photo: CatalogStoredPhoto) => ({
    assetId: photo.assetId,
    state: "PENDING_REVIEW",
  }))
  const storage = { assertAvailable: mock(() => undefined), stage }
  return { storage, complete }
}

describe("Catalog bounded byte upload", () => {
  test("exact streamed bytes complete only after storage verification", async () => {
    const deps = fixture()
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.subarray(0, 3))
        c.enqueue(bytes.subarray(3))
        c.close()
      },
    })
    expect(
      await uploadCatalogPhoto({
        request: request(stream),
        target: target(),
        ...deps,
      }),
    ).toEqual({ assetId: "one", state: "PENDING_REVIEW" })
    expect(deps.storage.stage.mock.calls[0]?.[0].bytes).toEqual(bytes)
    expect(deps.complete).toHaveBeenCalledTimes(1)
  })

  test("wrong hash, truncation, overflow and incompatible headers never reach storage", async () => {
    const cases = [
      request(new Uint8Array([0, ...bytes.subarray(1)])),
      request(bytes.subarray(0, 7)),
      request(new Uint8Array([...bytes, 1])),
      request(bytes, { "content-length": "9" }),
      request(bytes, { "content-length": "garbage" }),
      request(bytes, { "content-type": "image/jpeg" }),
      request(bytes, { "content-encoding": "gzip" }),
    ]
    for (const req of cases) {
      const deps = fixture()
      await expect(
        uploadCatalogPhoto({ request: req, target: target(), ...deps }),
      ).rejects.toThrow()
      expect(deps.storage.stage).not.toHaveBeenCalled()
      expect(deps.complete).not.toHaveBeenCalled()
    }
  })

  test("unavailable storage and QA live guard refuse before pulling bytes", async () => {
    for (const qa of [false, true]) {
      const pull = mock(() => undefined)
      const cancel = mock(() => undefined)
      const stream = new ReadableStream<Uint8Array>(
        { pull, cancel },
        { highWaterMark: 0 },
      )
      const photo = target()
      if (qa) photo.scope.dataClassification = "QA"
      const storage = createCatalogPhotoStorage({
        configured: () => false,
        blob: {
          put: async () => {
            throw new Error("must not store")
          },
          get: async () => null,
        },
      })
      const complete = mock(async () => undefined)
      await expect(
        uploadCatalogPhoto({
          request: request(stream),
          target: photo,
          storage,
          complete,
        }),
      ).rejects.toThrow()
      expect(pull).not.toHaveBeenCalled()
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(complete).not.toHaveBeenCalled()
    }
  })

  test("abort closes a stalled read without awaiting broken cancellation", async () => {
    const abort = new AbortController()
    const cancel = mock(() => new Promise<void>(() => undefined))
    const stream = new ReadableStream<Uint8Array>(
      { cancel },
      { highWaterMark: 0 },
    )
    const deps = fixture()
    const pending = uploadCatalogPhoto({
      request: request(stream, {}, abort.signal),
      target: target(),
      ...deps,
    })
    abort.abort()
    await expect(pending).rejects.toMatchObject({ status: 408 })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(deps.storage.stage).not.toHaveBeenCalled()
    expect(deps.complete).not.toHaveBeenCalled()
  })

  test("target mutation during body read cannot switch the asset or Store", async () => {
    const photo = target()
    const deps = fixture()
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(c) {
          photo.assetId = "other"
          photo.scope.storeId = "other"
          photo.contentDigest = "f".repeat(64)
          c.enqueue(bytes)
          c.close()
        },
      },
      { highWaterMark: 0 },
    )
    await uploadCatalogPhoto({
      request: request(stream),
      target: photo,
      ...deps,
    })
    expect(deps.complete.mock.calls[0]?.[0].assetId).toBe("one")
    expect(deps.complete.mock.calls[0]?.[0].storeId).toBe("store")
  })

  test("foreign storage descriptors cannot complete the receipt", async () => {
    const deps = fixture()
    const stage = deps.storage.stage
    deps.storage.stage = mock(async (input) => ({
      ...(await stage(input)),
      storeId: "foreign",
    }))
    await expect(
      uploadCatalogPhoto({ request: request(), target: target(), ...deps }),
    ).rejects.toMatchObject({ code: "PHOTO_INTEGRITY_MISMATCH" })
    expect(deps.complete).not.toHaveBeenCalled()
  })

  test("storage and completion failures retain retry identity without unsafe success", async () => {
    const deps = fixture()
    let attempt = 0
    const complete = mock(async (photo: CatalogStoredPhoto) => {
      if (++attempt === 1) throw new Error("repository temporarily unavailable")
      return photo.assetId
    })
    await expect(
      uploadCatalogPhoto({
        request: request(),
        target: target(),
        storage: deps.storage,
        complete,
      }),
    ).rejects.toThrow("repository temporarily unavailable")
    expect(
      await uploadCatalogPhoto({
        request: request(),
        target: target(),
        storage: deps.storage,
        complete,
      }),
    ).toBe("one")
    expect(complete.mock.calls[0]?.[0]).toEqual(complete.mock.calls[1]?.[0])
  })
})
