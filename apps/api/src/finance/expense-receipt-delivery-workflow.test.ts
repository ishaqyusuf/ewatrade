import { describe, expect, test } from "bun:test"
import {
  type ExpenseReceiptDeliveryAuthority,
  type ExpenseReceiptDeliveryRepository,
  type ExpenseReceiptGrantProtocol,
  FinanceError,
} from "@ewatrade/db/finance-expense-receipt-delivery"
import {
  createExpenseReceiptDownloadTokenCodec,
  expenseReceiptDownloadSessionDigest,
} from "@ewatrade/private-media/expense-receipt-download-token"
import { expenseReceiptStoragePath } from "@ewatrade/private-media/expense-receipts"
import { privateObjectDigest } from "@ewatrade/private-media/object-storage"
import {
  type ExpenseReceiptDeliveryContext,
  downloadFinanceExpenseReceiptOriginal,
  issueFinanceExpenseReceiptDownload,
} from "./expense-receipt-delivery-workflow"

const secret = "owned-receipt-delivery-key-32-characters"
const bytes = new TextEncoder().encode(
  "%PDF-1.7\nowned private original receipt",
)

function fixture() {
  const sessionId = "session_owned"
  const scope = {
    tenantId: "tenant",
    bookId: "book",
    billId: "expense",
    actorUserId: "owner",
    dataClassification: "QA" as "QA" | "LIVE",
  }
  const descriptor = {
    tenantId: scope.tenantId,
    bookId: scope.bookId,
    billId: scope.billId,
    assetId: "asset",
    contentDigest: privateObjectDigest(bytes),
    contentType: "application/pdf" as const,
    sizeBytes: bytes.length,
    storageProvider: "vercel_blob_private" as const,
    storageStoreId: "store_owned",
    verifiedAt: new Date(Date.now() - 1000),
  }
  const authority: ExpenseReceiptDeliveryAuthority = {
    scope,
    original: {
      ...descriptor,
      storagePath: expenseReceiptStoragePath(descriptor),
    },
  }
  const signed = createExpenseReceiptDownloadTokenCodec(secret).issue()
  let persisted: ExpenseReceiptGrantProtocol = {
    ...signed,
    sessionDigest: expenseReceiptDownloadSessionDigest(sessionId),
  }
  let consumed = false
  let checks = 0
  let revalidations = 0
  const calls: string[] = []
  const controls: {
    beforeInspect?: () => void
    beforeRevalidate?: (count: number) => void
    beforeSession?: (count: number) => void
    afterGet?: () => void
    missing?: boolean
    corrupt?: boolean
    readError?: Error
    issueExpired?: boolean
  } = {}
  const repository: ExpenseReceiptDeliveryRepository = {
    async inspect() {
      calls.push("inspect")
      controls.beforeInspect?.()
      return structuredClone(authority)
    },
    async issue(protocol) {
      calls.push("issue")
      persisted = { ...protocol }
      const now = Date.now()
      return {
        id: "grant",
        issuedAt: new Date(now - 1),
        expiresAt: new Date(now + (controls.issueExpired ? -1 : 59_999)),
        purpose: protocol.purpose,
        version: protocol.version,
      }
    },
    async consume(protocol) {
      calls.push("consume")
      checkProtocol(protocol)
      if (consumed) throw new FinanceError("FORBIDDEN", "Grant is unavailable.")
      consumed = true
      return { ...structuredClone(authority), grantId: "grant" }
    },
    async revalidate(held) {
      calls.push("revalidate")
      checkProtocol(held)
      if (!consumed || held.grantId !== "grant")
        throw new FinanceError("FORBIDDEN", "Grant is unavailable.")
      controls.beforeRevalidate?.(++revalidations)
      return structuredClone(authority)
    },
  }
  function checkProtocol(protocol: ExpenseReceiptGrantProtocol) {
    for (const key of [
      "nonceDigest",
      "sessionDigest",
      "purpose",
      "version",
    ] as const)
      if (protocol[key] !== persisted[key])
        throw new FinanceError("FORBIDDEN", "Grant is unavailable.")
  }
  const input: ExpenseReceiptDeliveryContext = {
    repository,
    sessionId,
    secret,
    signal: new AbortController().signal,
    async checkSession() {
      calls.push("session")
      controls.beforeSession?.(++checks)
    },
    storage: () => ({
      configured: () => true,
      storeId: "store_owned",
      providerMode: "test",
      port: {
        async put() {
          calls.push("put")
          throw new Error("Download must never write provider bytes")
        },
        async get(path, options) {
          calls.push("get")
          expect(path).toBe(authority.original.storagePath)
          expect(options.useCache).toBe(false)
          expect(options.access).toBe("private")
          if (controls.readError) throw controls.readError
          controls.afterGet?.()
          if (controls.missing) return null
          const saved = new Uint8Array(bytes)
          if (controls.corrupt) saved[saved.length - 1] = 0
          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue(saved)
                controller.close()
              },
            }),
            contentType: descriptor.contentType,
            sizeBytes: saved.length,
          }
        },
      },
    }),
  }
  const download = (override: Partial<ExpenseReceiptDeliveryContext> = {}) =>
    downloadFinanceExpenseReceiptOriginal({
      ...input,
      ...override,
      token: signed.token,
    })
  return {
    input,
    download,
    calls,
    controls,
    authority,
    signed,
    isConsumed: () => consumed,
    persisted: () => persisted,
  }
}

describe("session-bound private original receipt delivery workflow", () => {
  test("issues an opaque bounded grant without reading provider bytes or exposing private descriptors", async () => {
    const f = fixture()
    const result = await issueFinanceExpenseReceiptDownload(f.input)
    expect(result.token).toMatch(/^v1\.[a-f0-9]{64}\.[a-f0-9]{64}$/)
    expect(Object.keys(result).sort()).toEqual(["expiresAt", "token"])
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(
      createExpenseReceiptDownloadTokenCodec(secret).verifySignature(
        result.token,
      ),
    ).toMatchObject({ nonceDigest: f.persisted().nonceDigest })
    expect(f.calls).toEqual([
      "session",
      "inspect",
      "issue",
      "session",
      "inspect",
    ])
  })

  test("private uncached exact bytes require committed consumption and fresh checks before and after read", async () => {
    const f = fixture()
    const result = await f.download()
    expect(result.bytes).toEqual(bytes)
    expect(result.contentType).toBe("application/pdf")
    expect(result.fileName).toBe("receipt-asset.pdf")
    expect(Object.keys(result).sort()).toEqual([
      "bytes",
      "contentType",
      "fileName",
    ])
    expect(f.calls).toEqual([
      "session",
      "inspect",
      "session",
      "consume",
      "session",
      "revalidate",
      "get",
      "session",
      "revalidate",
    ])
    await expect(f.download()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.calls.filter((call) => call === "get")).toHaveLength(1)
  })

  test("signature tampering refuses before any grant/provider access", async () => {
    const f = fixture()
    await expect(
      downloadFinanceExpenseReceiptOriginal({
        ...f.input,
        token: "v1.invalid",
      }),
    ).rejects.toMatchObject({ code: "INVALID_DOWNLOAD_TOKEN" })
    expect(f.calls).toEqual(["session"])
  })

  test("another authenticated session cannot consume the same signed grant", async () => {
    const f = fixture()
    await expect(
      f.download({ sessionId: "other_session" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.isConsumed()).toBe(false)
    expect(f.calls).not.toContain("get")
  })

  test("missing key or unavailable explicit Finance storage refuses before grant consumption", async () => {
    const f = fixture()
    await expect(f.download({ secret: undefined })).rejects.toMatchObject({
      code: "DOWNLOAD_NOT_CONFIGURED",
    })
    expect(f.calls).toEqual(["session"])
    await expect(
      f.download({
        storage: () => ({ ...f.input.storage(), configured: () => false }),
      }),
    ).rejects.toMatchObject({ code: "RECEIPT_STORAGE_UNAVAILABLE" })
    expect(f.calls).not.toContain("consume")
  })

  test("changed private store configuration refuses before consumption", async () => {
    const f = fixture()
    await expect(
      f.download({
        storage: () => ({ ...f.input.storage(), storeId: "store_changed" }),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(f.calls).not.toContain("consume")
  })

  test("revoked current session before private read prevents provider work", async () => {
    const f = fixture()
    f.controls.beforeSession = (count) => {
      if (count === 3)
        throw new FinanceError("FORBIDDEN", "Current session revoked.")
    }
    await expect(f.download()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.isConsumed()).toBe(true)
    expect(f.calls).not.toContain("get")
  })

  test("current grant/source refusal is preserved instead of being masked by transport errors", async () => {
    const f = fixture()
    f.controls.beforeRevalidate = () => {
      throw new FinanceError("FORBIDDEN", "Evidence withdrawn.")
    }
    await expect(f.download()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Evidence withdrawn.",
    })
    expect(f.calls).not.toContain("get")
  })

  test("current original digest or pin mutation before or after provider read withholds bytes", async () => {
    for (const afterRead of [false, true]) {
      const f = fixture()
      f.controls.beforeRevalidate = (count) => {
        if (count === (afterRead ? 2 : 1))
          f.authority.original.storageStoreId = "store_mutated"
      }
      await expect(f.download()).rejects.toMatchObject({ code: "CONFLICT" })
      expect(f.calls.filter((call) => call === "get")).toHaveLength(
        afterRead ? 1 : 0,
      )
    }
  })

  test("revocation during byte reading refuses before response", async () => {
    const f = fixture()
    f.controls.afterGet = () => {
      f.controls.beforeSession = () => {
        throw new FinanceError("FORBIDDEN", "Current session revoked.")
      }
    }
    await expect(f.download()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.calls.filter((call) => call === "get")).toHaveLength(1)
  })

  test("missing/corrupt provider originals never release bytes or renew the consumed grant", async () => {
    for (const kind of ["missing", "corrupt"] as const) {
      const f = fixture()
      f.controls[kind] = true
      await expect(f.download()).rejects.toMatchObject({
        name: "ExpenseReceiptStorageError",
      })
      expect(f.isConsumed()).toBe(true)
      await expect(f.download()).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(f.calls.filter((call) => call === "get")).toHaveLength(1)
    }
  })

  test("live provider mode refuses actual QA before consumption or effects", async () => {
    const f = fixture()
    await expect(
      f.download({
        storage: () => ({ ...f.input.storage(), providerMode: "live" }),
      }),
    ).rejects.toMatchObject({ name: "QaProviderPolicyError" })
    expect(f.calls).not.toContain("consume")
    expect(f.calls).not.toContain("get")
  })

  test("abort during provider read exposes no raw reason and cannot return bytes", async () => {
    const f = fixture()
    const abort = new AbortController()
    f.controls.afterGet = () =>
      abort.abort(new Error("private diagnostic secret"))
    await expect(f.download({ signal: abort.signal })).rejects.toMatchObject({
      status: 408,
    })
  })

  test("issue refuses expired saved grants and authority loss before token exposure", async () => {
    const expired = fixture()
    expired.controls.issueExpired = true
    await expect(
      issueFinanceExpenseReceiptDownload(expired.input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    const changed = fixture()
    let inspections = 0
    changed.controls.beforeInspect = () => {
      if (++inspections === 2)
        throw new FinanceError("FORBIDDEN", "Evidence withdrawn.")
    }
    await expect(
      issueFinanceExpenseReceiptDownload(changed.input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(changed.calls).not.toContain("get")
  })
})
