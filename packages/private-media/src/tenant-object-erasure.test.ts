import { describe, expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  LOCAL_TEST_OBJECT_STORE_ID,
  createLocalTestPrivateObjectPort,
} from "./local-test-object-port"
import type { PrivateObjectPort } from "./object-storage"
import {
  type TenantErasurePort,
  createTenantObjectEraser,
  defaultTenantErasurePorts,
} from "./tenant-object-erasure"

const path = `orders/attachments/tenant/order/attachment/${"a".repeat(64)}.jpg`

function memoryPort(
  behavior: { ignoreDelete?: boolean; failDelete?: boolean } = {},
) {
  const objects = new Map<string, Uint8Array>([[path, new Uint8Array([1])]])
  const deletes: string[] = []
  const port: PrivateObjectPort<string> = {
    async put() {
      throw new Error("write must not be called")
    },
    async get(key) {
      const bytes = objects.get(key)
      if (!bytes) return null
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(bytes)
            controller.close()
          },
        }),
        contentType: "image/jpeg",
        sizeBytes: bytes.byteLength,
      }
    },
    async delete(key) {
      deletes.push(key)
      if (behavior.failDelete)
        throw new Error("provider said token=secret https://x")
      if (!behavior.ignoreDelete) objects.delete(key)
    },
  }
  const resolved: TenantErasurePort = {
    port,
    configured: () => true,
    storeId: "store_pinned",
  }
  return { objects, deletes, resolve: () => resolved }
}

const target = {
  storageProvider: "vercel_blob_private",
  storageStoreId: "store_pinned",
  storagePath: path,
  dataClassification: "LIVE" as const,
}

describe("Tenant object eraser", () => {
  test("deletes the exact object and certifies only an actual not-found read", async () => {
    const fake = memoryPort()
    expect(await createTenantObjectEraser(fake.resolve)(target)).toEqual({
      ok: true,
    })
    expect(fake.deletes).toEqual([path])
    expect(fake.objects.size).toBe(0)
    // An already-missing object is the idempotent retry after uncertain success.
    expect(await createTenantObjectEraser(fake.resolve)(target)).toEqual({
      ok: true,
    })
  })

  test("a delete that leaves bytes readable is never success", async () => {
    const fake = memoryPort({ ignoreDelete: true })
    expect(await createTenantObjectEraser(fake.resolve)(target)).toEqual({
      ok: false,
      code: "STILL_PRESENT",
    })
  })

  test("provider failures return a code without provider text", async () => {
    const fake = memoryPort({ failDelete: true })
    const result = await createTenantObjectEraser(fake.resolve)(target)
    expect(result).toEqual({ ok: false, code: "STORAGE_UNAVAILABLE" })
    expect(JSON.stringify(result)).not.toContain("secret")
  })

  test("store pin, provider and path mismatches never reach the provider", async () => {
    const fake = memoryPort()
    const erase = createTenantObjectEraser(fake.resolve)
    expect(await erase({ ...target, storageStoreId: "store_other" })).toEqual({
      ok: false,
      code: "STORE_PIN_MISMATCH",
    })
    expect(await erase({ ...target, storagePath: "../escape" })).toEqual({
      ok: false,
      code: "INVALID_OBJECT",
    })
    expect(
      await createTenantObjectEraser(() => null)({
        ...target,
        storageProvider: "local_test",
      }),
    ).toEqual({ ok: false, code: "PROVIDER_UNSUPPORTED" })
    expect(fake.deletes).toEqual([])
  })

  test("default resolver keeps LIVE on Blob and QA on the local test port", () => {
    const resolve = defaultTenantErasurePorts({
      APP_ENV: "development",
      BLOB_STORE_ID: "store_synthetic",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_synthetic_not-a-real-token",
    })
    expect(resolve("vercel_blob_private", "LIVE")?.storeId).toBe(
      "store_synthetic",
    )
    expect(resolve("local_test", "QA")?.storeId).toBe(
      LOCAL_TEST_OBJECT_STORE_ID,
    )
    expect(resolve("local_test", "LIVE")).toBeNull()
    expect(resolve("vercel_blob_private", "QA")).toBeNull()
  })

  test("QA objects are removed from the local test port", async () => {
    const root = await mkdtemp(join(tmpdir(), "tenant-erasure-"))
    try {
      const environment = { APP_ENV: "development" }
      const local = createLocalTestPrivateObjectPort<string>({
        rootDir: root,
        environment,
      })
      await local.port.put(path, new Uint8Array([1, 2]), {
        access: "private",
        abortSignal: AbortSignal.timeout(1000),
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 60,
        contentType: "image/jpeg",
      })
      const erase = createTenantObjectEraser((provider, classification) =>
        provider === "local_test" && classification === "QA" ? local : null,
      )
      expect(
        await erase({
          storageProvider: "local_test",
          storageStoreId: LOCAL_TEST_OBJECT_STORE_ID,
          storagePath: path,
          dataClassification: "QA",
        }),
      ).toEqual({ ok: true })
      expect(
        await readdir(join(root, "orders/attachments/tenant/order/attachment")),
      ).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
