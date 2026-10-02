import { describe, expect, test } from "bun:test"
import { QaProviderPolicyError } from "@ewatrade/utils/qa-provider-policy"
import {
  type ExpenseReceiptContentType,
  type ExpenseReceiptStorageScope,
  type ExpenseReceiptUploadTarget,
  createExpenseReceiptStorage,
  createVercelExpenseReceiptStorage,
} from "./expense-receipts"
import { type PrivateObjectPort, privateObjectDigest } from "./object-storage"

const bytes = new TextEncoder().encode(
  "%PDF-1.7\nowned synthetic original; no safety clearance",
)
const date = new Date("2026-10-02T12:00:00Z")
const scope: ExpenseReceiptStorageScope = {
  tenantId: "tenant",
  bookId: "book",
  billId: "expense",
  actorUserId: "owner",
  dataClassification: "LIVE",
}
const target: ExpenseReceiptUploadTarget = {
  ...scope,
  assetId: "receipt",
  contentType: "application/pdf",
  contentDigest: privateObjectDigest(bytes),
  sizeBytes: bytes.length,
  createdAt: date,
  expiresAt: new Date(date.getTime() + 24 * 60 * 60_000),
}

function fixture() {
  const saved = new Map<string, { bytes: Uint8Array; contentType: string }>()
  const calls: string[] = []
  const port: PrivateObjectPort<ExpenseReceiptContentType> = {
    async put(path, value, options) {
      calls.push("put")
      if (saved.has(path)) throw new Error("duplicate")
      saved.set(path, {
        bytes: value.slice(),
        contentType: options.contentType,
      })
    },
    async get(path) {
      calls.push("get")
      const value = saved.get(path)
      if (!value) return null
      return {
        contentType: value.contentType,
        sizeBytes: value.bytes.length,
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(value.bytes.slice())
            controller.close()
          },
        }),
      }
    },
  }
  const storage = (
    overrides: Partial<PrivateObjectPort<ExpenseReceiptContentType>> = {},
    now = () => new Date(date),
  ) =>
    createExpenseReceiptStorage({
      port: { ...port, ...overrides },
      configured: () => true,
      storeId: "store_owned",
      now,
    })
  return { port, saved, calls, storage }
}

async function withQaRuntime(run: () => Promise<void>) {
  const keys = ["NODE_ENV", "APP_ENV", "DEV_PROFILE", "EWATRADE_ENV_MODE"]
  const saved = keys.map((key) => [key, process.env[key]] as const)
  process.env.NODE_ENV = "test"
  process.env.APP_ENV = "local"
  process.env.DEV_PROFILE = "local"
  process.env.EWATRADE_ENV_MODE = "local"
  try {
    await run()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe("quarantined original Expense receipts", () => {
  test("explicit synthetic mode accepts only actual QA scope in a nonproduction runtime", async () => {
    await withQaRuntime(async () => {
      const f = fixture()
      const storage = createExpenseReceiptStorage({
        port: f.port,
        configured: () => true,
        storeId: "store_owned",
        now: () => new Date(date),
        providerMode: "test",
      })
      const qa = { ...scope, dataClassification: "QA" as const }
      const object = await storage.stage({ scope: qa, target, bytes })
      expect(object.state).toBe("QUARANTINED")
      expect(f.calls).toEqual(["put", "get"])
      expect(
        await storage.readQuarantinedOriginal({ scope: qa, object }),
      ).toEqual(bytes)
      f.calls.length = 0
      await expect(
        storage.stage({ scope, target, bytes }),
      ).rejects.toMatchObject({ code: "RECEIPT_STORAGE_UNAVAILABLE" })
      await expect(
        storage.readQuarantinedOriginal({ scope, object }),
      ).rejects.toMatchObject({ code: "RECEIPT_STORAGE_UNAVAILABLE" })
      expect(f.calls).toEqual([])
    })
  })

  test("every production signal blocks synthetic writes and reads before provider I/O", async () => {
    await withQaRuntime(async () => {
      const f = fixture()
      const storage = createExpenseReceiptStorage({
        port: f.port,
        configured: () => true,
        storeId: "store_owned",
        now: () => new Date(date),
        providerMode: "test",
      })
      const qa = { ...scope, dataClassification: "QA" as const }
      const object = await storage.stage({ scope: qa, target, bytes })
      f.calls.length = 0
      for (const key of [
        "NODE_ENV",
        "APP_ENV",
        "DEV_PROFILE",
        "EWATRADE_ENV_MODE",
      ]) {
        const prior = process.env[key]
        process.env[key] = "production"
        try {
          await expect(
            storage.stage({ scope: qa, target, bytes }),
          ).rejects.toMatchObject({ code: "RECEIPT_STORAGE_UNAVAILABLE" })
          await expect(
            storage.readQuarantinedOriginal({ scope: qa, object }),
          ).rejects.toMatchObject({ code: "RECEIPT_STORAGE_UNAVAILABLE" })
        } finally {
          process.env[key] = prior
        }
      }
      expect(f.calls).toEqual([])
    })
  })

  test("successful put must reread exact originals before any verified descriptor exists", async () => {
    const f = fixture()
    const object = await f.storage().stage({ scope, target, bytes })
    expect(f.calls).toEqual(["put", "get"])
    expect(object).toMatchObject({
      tenantId: "tenant",
      bookId: "book",
      billId: "expense",
      assetId: "receipt",
      contentType: "application/pdf",
      sizeBytes: bytes.length,
      contentDigest: target.contentDigest,
      state: "QUARANTINED",
      storageProvider: "vercel_blob_private",
      storageStoreId: "store_owned",
    })
    expect(object.storagePath).toBe(
      `finance/expense-receipts/quarantine/tenant/book/expense/receipt/${target.contentDigest}.pdf`,
    )
    expect(object).not.toHaveProperty("url")
    expect(object).not.toHaveProperty("safe")
    expect(object).not.toHaveProperty("attachedAt")
    expect(object).not.toHaveProperty("token")
    expect(
      await f.storage().readQuarantinedOriginal({
        scope: { ...scope, actorUserId: "current-admin" },
        object,
      }),
    ).toEqual(bytes)
  })

  test("successful provider metadata with missing/changed bytes never certifies upload", async () => {
    const f = fixture()
    await expect(
      f.storage({ async put() {} }).stage({ scope, target, bytes }),
    ).rejects.toMatchObject({ code: "RECEIPT_NOT_FOUND" })
    await expect(
      f
        .storage({
          async put(path, value, options) {
            await f.port.put(path, value, options)
            f.saved.set(path, {
              bytes: new Uint8Array(value.length),
              contentType: options.contentType,
            })
          },
        })
        .stage({ scope, target, bytes }),
    ).rejects.toMatchObject({ code: "RECEIPT_INTEGRITY_MISMATCH" })
  })

  test("same original retry recovers lost responses without overwrite", async () => {
    const f = fixture()
    const storage = f.storage({
      async put(...args) {
        await f.port.put(...args)
        throw new Error("lost provider success")
      },
    })
    const first = await storage.stage({ scope, target, bytes })
    const second = await storage.stage({ scope, target, bytes })
    expect(first).toEqual(second)
    expect(f.saved.size).toBe(1)
    expect(f.calls).toEqual(["put", "get", "get", "put", "get", "get"])
  })

  test("scope/creator/expiry refusals happen before provider I/O", async () => {
    const f = fixture()
    for (const patch of [
      { tenantId: "other" },
      { bookId: "other" },
      { billId: "other" },
      { actorUserId: "other" },
    ]) {
      await expect(
        f.storage().stage({ scope, target: { ...target, ...patch }, bytes }),
      ).rejects.toMatchObject({ code: "RECEIPT_SCOPE_MISMATCH" })
    }
    for (const patch of [
      { expiresAt: date },
      { createdAt: new Date(date.getTime() + 1) },
      { expiresAt: new Date("invalid") },
    ]) {
      await expect(
        f.storage().stage({ scope, target: { ...target, ...patch }, bytes }),
      ).rejects.toMatchObject({ code: "INVALID_RECEIPT" })
    }
    expect(f.calls).toEqual([])
  })

  test("QA cannot reach live writes or scanner reads even with an owned descriptor", async () => {
    const f = fixture()
    const storage = f.storage()
    const qa = { ...scope, dataClassification: "QA" as const }
    await expect(
      storage.stage({ scope: qa, target, bytes }),
    ).rejects.toBeInstanceOf(QaProviderPolicyError)
    expect(f.calls).toEqual([])
    const object = await storage.stage({ scope, target, bytes })
    f.calls.length = 0
    await expect(
      storage.readQuarantinedOriginal({ scope: qa, object }),
    ).rejects.toBeInstanceOf(QaProviderPolicyError)
    expect(f.calls).toEqual([])
  })

  test("a provider token/pin cannot substitute for expected Expense scope", async () => {
    const f = fixture()
    const storage = f.storage()
    const object = await storage.stage({ scope, target, bytes })
    f.calls.length = 0
    for (const patch of [
      { tenantId: "foreign" },
      { bookId: "foreign" },
      { billId: "replacement" },
      { storageStoreId: "store_foreign" },
      { storagePath: "https://private.example/object" },
      { storagePath: object.storagePath.replace("quarantine", "approved") },
    ]) {
      await expect(
        storage.readQuarantinedOriginal({
          scope,
          object: { ...object, ...patch },
        }),
      ).rejects.toMatchObject({ code: "RECEIPT_SCOPE_MISMATCH" })
    }
    expect(f.calls).toEqual([])
  })

  test("wrong signature, length, hash and unsupported MIME never upload", async () => {
    const f = fixture()
    for (const patch of [
      { sizeBytes: 0 },
      { sizeBytes: 10_000_001 },
      { sizeBytes: bytes.length + 1 },
      { contentDigest: "f".repeat(64) },
      { contentType: "image/png" as const },
    ]) {
      await expect(
        f.storage().stage({ scope, target: { ...target, ...patch }, bytes }),
      ).rejects.toThrow()
    }
    const html = new TextEncoder().encode("<html>fake receipt</html>")
    await expect(
      f.storage().stage({
        scope,
        target: {
          ...target,
          contentDigest: privateObjectDigest(html),
          sizeBytes: html.length,
        },
        bytes: html,
      }),
    ).rejects.toMatchObject({ code: "RECEIPT_INTEGRITY_MISMATCH" })
    expect(f.calls).toEqual([])
  })

  test("original HEIC content is preserved without pretending a derivative is original", async () => {
    const f = fixture()
    const heic = new Uint8Array([
      0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99, 0, 0, 0, 0,
    ])
    const object = await f.storage().stage({
      scope,
      target: {
        ...target,
        contentType: "image/heic",
        contentDigest: privateObjectDigest(heic),
        sizeBytes: heic.length,
      },
      bytes: heic,
    })
    expect(object.contentType).toBe("image/heic")
    expect(object.storagePath).toEndWith(".heic")
    expect(
      await f.storage().readQuarantinedOriginal({ scope, object }),
    ).toEqual(heic)
    expect(object.state).toBe("QUARANTINED")
  })

  test("mutable caller input cannot change original provenance after upload begins", async () => {
    const f = fixture()
    const candidate = { ...target }
    const value = bytes.slice()
    const selectedScope = { ...scope }
    const storage = f.storage({
      async put(path, original, options) {
        candidate.billId = "other"
        value.fill(0)
        selectedScope.tenantId = "other"
        await f.port.put(path, original, options)
      },
    })
    const object = await storage.stage({
      scope: selectedScope,
      target: candidate,
      bytes: value,
    })
    expect(object.billId).toBe("expense")
    expect(object.tenantId).toBe("tenant")
    expect(await storage.readQuarantinedOriginal({ scope, object })).toEqual(
      bytes,
    )
  })

  test("expiry after provider write leaves an orphan rather than upload success", async () => {
    const f = fixture()
    let current = new Date(date)
    const storage = f.storage(
      {
        async put(...args) {
          await f.port.put(...args)
          current = new Date(target.expiresAt)
        },
      },
      () => current,
    )
    await expect(storage.stage({ scope, target, bytes })).rejects.toMatchObject(
      { code: "RECEIPT_STORAGE_UNAVAILABLE" },
    )
    expect(f.saved.size).toBe(1)
  })

  test("verifiedAt is recorded only after reread; metadata never grants merchant delivery", async () => {
    const f = fixture()
    let current = new Date(date)
    const storage = f.storage(
      {
        async get(...args) {
          current = new Date(date.getTime() + 1_000)
          return f.port.get(...args)
        },
      },
      () => current,
    )
    const object = await storage.stage({ scope, target, bytes })
    expect(object.verifiedAt).toEqual(current)
    expect(storage).not.toHaveProperty("download")
    expect(storage).not.toHaveProperty("attach")
    expect(storage).not.toHaveProperty("remove")
    expect(storage).not.toHaveProperty("approve")
  })

  test("unconfigured or mismatched store identity fails without a network request", async () => {
    for (const env of [
      {},
      {
        BLOB_STORE_ID: "store_owned",
        BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_foreign_fixture",
      },
    ]) {
      await expect(
        createVercelExpenseReceiptStorage(env).stage({ scope, target, bytes }),
      ).rejects.toMatchObject({ code: "RECEIPT_STORAGE_UNAVAILABLE" })
    }
  })

  test("provider diagnostics never escape receipt errors", async () => {
    const f = fixture()
    const storage = f.storage({
      async put() {
        throw new Error("secret https://private.example/original")
      },
    })
    try {
      await storage.stage({ scope, target, bytes })
      throw new Error("Expected failure")
    } catch (error) {
      expect(String(error)).not.toContain("secret")
      expect(String(error)).not.toContain("private.example")
      expect(error).not.toHaveProperty("cause")
    }
  })
})
