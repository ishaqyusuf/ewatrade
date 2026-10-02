import { describe, expect, test } from "bun:test"
import {
  type PrivateObjectPort,
  PrivateObjectStorageError,
  createPrivateObjectStorage,
  privateObjectDigest,
} from "./object-storage"

const bytes = new TextEncoder().encode("original private bytes")
const object = {
  storagePath: "owned/quarantine/asset/original.bin",
  contentDigest: privateObjectDigest(bytes),
  contentType: "application/octet-stream",
  sizeBytes: bytes.length,
}

function fixture() {
  const saved = new Map<string, Uint8Array>()
  const calls: string[] = []
  const port: PrivateObjectPort = {
    async put(path, value, options) {
      calls.push("put")
      expect(options).toMatchObject({
        access: "private",
        allowOverwrite: false,
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
      })
      if (saved.has(path)) throw new Error("duplicate private path")
      saved.set(path, value.slice())
    },
    async get(path, options) {
      calls.push("get")
      expect(options).toMatchObject({ access: "private", useCache: false })
      const value = saved.get(path)
      if (!value) return null
      return {
        contentType: object.contentType,
        sizeBytes: value.length,
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(value.slice())
            controller.close()
          },
        }),
      }
    },
    async delete(path) {
      calls.push("delete")
      saved.delete(path)
    },
  }
  const storage = (
    custom: Partial<PrivateObjectPort> = {},
    configured = true,
  ) =>
    createPrivateObjectStorage({
      port: { ...port, ...custom },
      configured: () => configured,
      maxBytes: 10_000_000,
      validateBytes: () => undefined,
    })
  return { port, calls, saved, storage }
}

describe("bounded private object transport", () => {
  test("immutable writes and duplicate replay prove exact original bytes", async () => {
    const f = fixture()
    const storage = f.storage()
    await storage.write({ object, bytes })
    await storage.write({ object, bytes })
    expect(await storage.read({ object })).toEqual(bytes)
    expect(f.saved.size).toBe(1)
    expect(f.calls).toEqual(["put", "put", "get", "get"])
  })

  test("lost provider write response recovers only through original byte proof", async () => {
    const f = fixture()
    const storage = f.storage({
      async put(...args) {
        await f.port.put(...args)
        throw new Error("lost secret provider response")
      },
    })
    await storage.write({ object, bytes })
    expect(f.calls).toEqual(["put", "get"])
    f.saved.set(object.storagePath, new Uint8Array(bytes.length))
    await expect(storage.write({ object, bytes })).rejects.toMatchObject({
      code: "INTEGRITY_MISMATCH",
    })
  })

  test("invalid and public descriptors cannot make provider calls", async () => {
    const f = fixture()
    const storage = f.storage()
    for (const patch of [
      { storagePath: "https://public.example/file" },
      { storagePath: "../outside" },
      { storagePath: "owned//file" },
      { sizeBytes: 0 },
      { sizeBytes: 10_000_001 },
      { contentDigest: "wrong" },
      { contentType: "bad\r\nheader" },
    ]) {
      await expect(
        storage.read({ object: { ...object, ...patch } }),
      ).rejects.toMatchObject({ code: "INVALID_OBJECT" })
    }
    await expect(
      storage.write({ object, bytes: bytes.slice(0, -1) }),
    ).rejects.toMatchObject({ code: "INTEGRITY_MISMATCH" })
    expect(f.calls).toEqual([])
  })

  test("source buffer and descriptor are snapshotted before provider awaits", async () => {
    const f = fixture()
    const original = bytes.slice()
    const candidate = { ...object }
    const storage = f.storage({
      async put(path, value, options) {
        original.fill(0)
        candidate.contentDigest = "f".repeat(64)
        await f.port.put(path, value, options)
      },
    })
    await storage.write({ object: candidate, bytes: original })
    expect(await storage.read({ object })).toEqual(bytes)
  })

  test("a read descriptor mutation cannot change digest or allocation authority", async () => {
    const f = fixture()
    await f.storage().write({ object, bytes })
    const candidate = { ...object }
    const storage = f.storage({
      async get(...args) {
        candidate.sizeBytes = 1
        candidate.contentDigest = "f".repeat(64)
        return f.port.get(...args)
      },
    })
    expect(await storage.read({ object: candidate })).toEqual(bytes)
  })

  test("wrong provider metadata, truncated, oversized and modified streams refuse", async () => {
    const f = fixture()
    for (const outcome of [
      { contentType: "text/html", sizeBytes: bytes.length, value: bytes },
      {
        contentType: object.contentType,
        sizeBytes: bytes.length + 1,
        value: bytes,
      },
      {
        contentType: object.contentType,
        sizeBytes: bytes.length,
        value: bytes.slice(0, -1),
      },
      {
        contentType: object.contentType,
        sizeBytes: bytes.length,
        value: new Uint8Array([...bytes, 1]),
      },
      {
        contentType: object.contentType,
        sizeBytes: bytes.length,
        value: new Uint8Array(bytes.length),
      },
    ]) {
      let canceled = false
      const storage = f.storage({
        async get() {
          return {
            contentType: outcome.contentType,
            sizeBytes: outcome.sizeBytes,
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue(outcome.value)
              },
              pull(controller) {
                if (
                  outcome.contentType === object.contentType &&
                  outcome.sizeBytes === bytes.length &&
                  outcome.value.length <= bytes.length
                )
                  controller.close()
              },
              cancel() {
                canceled = true
              },
            }),
          }
        },
      })
      await expect(storage.read({ object })).rejects.toMatchObject({
        code: "INTEGRITY_MISMATCH",
      })
      if (
        outcome.contentType !== object.contentType ||
        outcome.sizeBytes !== bytes.length ||
        outcome.value.length > bytes.length
      )
        expect(canceled).toBe(true)
    }
  })

  test("empty chunks are refused rather than retained or retried forever", async () => {
    const f = fixture()
    let canceled = false
    const storage = f.storage({
      async get() {
        return {
          ...object,
          stream: new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array())
            },
            cancel() {
              canceled = true
            },
          }),
        }
      },
    })
    await expect(storage.read({ object })).rejects.toMatchObject({
      code: "INTEGRITY_MISMATCH",
    })
    expect(canceled).toBe(true)
  })

  test("chunk work is bounded as well as total byte allocation", async () => {
    const f = fixture()
    let offset = 0
    let canceled = false
    const value = new Uint8Array(65_537)
    const target = {
      ...object,
      sizeBytes: value.length,
      contentDigest: privateObjectDigest(value),
    }
    const storage = f.storage({
      async get() {
        return {
          contentType: object.contentType,
          sizeBytes: value.length,
          stream: new ReadableStream(
            {
              pull(controller) {
                if (offset++ < value.length)
                  controller.enqueue(new Uint8Array([0]))
                else controller.close()
              },
              cancel() {
                canceled = true
              },
            },
            { highWaterMark: 0 },
          ),
        }
      },
    })
    await expect(storage.read({ object: target })).rejects.toMatchObject({
      code: "INTEGRITY_MISMATCH",
    })
    expect(canceled).toBe(true)
    expect(offset).toBe(65_537)
  })

  test("aborted provider get cancels a late returned stream without waiting", async () => {
    const f = fixture()
    const abort = new AbortController()
    let complete:
      | ((value: Awaited<ReturnType<PrivateObjectPort["get"]>>) => void)
      | undefined
    let canceled = false
    const storage = f.storage({
      get() {
        abort.abort()
        return new Promise((resolve) => {
          complete = resolve
        })
      },
    })
    await expect(
      storage.read({ object, abortSignal: abort.signal }),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" })
    complete?.({
      contentType: object.contentType,
      sizeBytes: bytes.length,
      stream: new ReadableStream({
        cancel() {
          canceled = true
          return new Promise(() => undefined)
        },
      }),
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(canceled).toBe(true)
  })

  test("aborted put/delete cannot hang on a provider ignoring its signal", async () => {
    for (const action of ["put", "delete"] as const) {
      const f = fixture()
      const abort = new AbortController()
      const storage = f.storage({
        [action]: async () => {
          abort.abort()
          return new Promise<void>(() => undefined)
        },
      })
      await expect(
        action === "put"
          ? storage.write({ object, bytes, abortSignal: abort.signal })
          : storage.remove({ object, abortSignal: abort.signal }),
      ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" })
    }
  })

  test("aborted requests and missing configuration never reach provider", async () => {
    const f = fixture()
    const abort = new AbortController()
    abort.abort()
    await expect(
      f.storage().read({ object, abortSignal: abort.signal }),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" })
    await expect(
      f.storage({}, false).write({ object, bytes }),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" })
    expect(f.calls).toEqual([])
  })

  test("provider failure details and cause are discarded, missing remains distinct", async () => {
    const f = fixture()
    await expect(f.storage().read({ object })).rejects.toMatchObject({
      code: "OBJECT_NOT_FOUND",
    })
    const storage = f.storage({
      async get() {
        throw new Error("secret-token https://private.example/object")
      },
    })
    try {
      await storage.read({ object })
      throw new Error("Expected failure")
    } catch (error) {
      expect(error).toBeInstanceOf(PrivateObjectStorageError)
      expect(String(error)).not.toContain("secret-token")
      expect(String(error)).not.toContain("private.example")
      expect(error).not.toHaveProperty("cause")
    }
  })

  test("exact object deletion is idempotent but provider failure is not success", async () => {
    const f = fixture()
    const storage = f.storage()
    await storage.write({ object, bytes })
    await storage.remove({ object })
    await storage.remove({ object })
    expect(f.saved.size).toBe(0)
    await expect(
      f
        .storage({
          async delete() {
            throw new Error("delete failed")
          },
        })
        .remove({ object }),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" })
  })
})
