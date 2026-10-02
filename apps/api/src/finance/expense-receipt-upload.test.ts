import { describe, expect, test } from "bun:test"
import {
  type ExpenseReceiptUploadAuthority,
  type ExpenseReceiptUploadClaim,
  type ExpenseReceiptUploadRepository,
  FinanceError,
} from "@ewatrade/db/finance-expense-receipt-upload"
import { expenseReceiptStoragePath } from "@ewatrade/private-media/expense-receipts"
import { privateObjectDigest } from "@ewatrade/private-media/object-storage"
import { QaProviderPolicyError } from "@ewatrade/utils/qa-provider-policy"
import { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import {
  financeExpenseReceiptActorScope,
  registerFinanceExpenseReceiptUploadRoutes,
} from "./expense-receipt-upload"
import {
  type ExpenseReceiptUploadStorage,
  uploadFinanceExpenseReceipt,
} from "./expense-receipt-upload-workflow"

const bytes = new TextEncoder().encode(
  "%PDF-1.7\nowned original upload workflow fixture",
)
function fixture() {
  const now = Date.now()
  const scope = {
    tenantId: "tenant",
    actorUserId: "owner",
    bookId: "book",
    billId: "expense",
    dataClassification: "QA" as "QA" | "LIVE",
  }
  const target: ExpenseReceiptUploadClaim["target"] = {
    ...scope,
    assetId: "asset",
    contentDigest: privateObjectDigest(bytes),
    contentType: "application/pdf",
    sizeBytes: bytes.length,
    createdAt: new Date(now - 1000),
    expiresAt: new Date(now + 86400_000),
  }
  const metadata: Awaited<
    ReturnType<ExpenseReceiptUploadRepository["complete"]>
  > = {
    id: target.assetId,
    billId: target.billId,
    originalFileName: "owned-receipt.pdf",
    contentType: target.contentType,
    sizeBytes: target.sizeBytes,
    uploadState: "PENDING",
    safetyState: "QUARANTINED",
    attachmentState: "UNATTACHED",
    createdAt: target.createdAt,
    expiresAt: target.expiresAt,
    verifiedAt: null,
    attachedAt: null,
    withdrawnAt: null,
    bytesDeletedAt: null,
    retentionHold: true,
  }
  const claim: ExpenseReceiptUploadClaim = {
    scope,
    target,
    claimId: "00000000-0000-4000-8000-000000000001",
    claimVersion: 1,
    leaseUntil: new Date(now + 180_000),
    storageStoreId: "store_owned",
  }
  const calls: string[] = []
  let saved: Uint8Array | undefined
  let revalidations = 0
  const controls: {
    beforeRevalidate?: (count: number) => void | Promise<void>
    lostPutResponse?: boolean
    missingOriginal?: boolean
    completeError?: Error
  } = {}
  const repository: ExpenseReceiptUploadRepository = {
    async load() {
      calls.push("load")
      return {
        kind: "READY",
        scope: { ...scope },
        target: structuredClone(target),
        metadata: structuredClone(metadata),
      }
    },
    async claim(pin, original) {
      calls.push("claim")
      expect(pin).toBe("store_owned")
      expect(original.contentDigest).toBe(target.contentDigest)
      return structuredClone(claim)
    },
    async revalidate(held) {
      calls.push("revalidate")
      await controls.beforeRevalidate?.(++revalidations)
      return {
        ...structuredClone(held),
        scope: { ...scope },
        claimedAt: new Date(now),
      }
    },
    async complete(held, stored) {
      calls.push("complete")
      if (controls.completeError) throw controls.completeError
      expect(held.claimId).toBe(claim.claimId)
      expect(stored.state).toBe("QUARANTINED")
      expect(stored.contentDigest).toBe(target.contentDigest)
      metadata.uploadState = "VERIFIED"
      metadata.verifiedAt = stored.verifiedAt
      return structuredClone(metadata)
    },
  }
  const configuration: ExpenseReceiptUploadStorage = {
    storeId: "store_owned",
    configured: () => true,
    providerMode: "test",
    port: {
      async put(path, value, options) {
        calls.push("put")
        expect(path).toBe(expenseReceiptStoragePath(target))
        expect(options.access).toBe("private")
        expect(options.allowOverwrite).toBe(false)
        expect(options.addRandomSuffix).toBe(false)
        saved = value.slice()
        if (controls.lostPutResponse) throw new Error("lost synthetic response")
      },
      async get(path, options) {
        calls.push("get")
        expect(path).toBe(expenseReceiptStoragePath(target))
        expect(options.useCache).toBe(false)
        if (!saved || controls.missingOriginal) return null
        return {
          sizeBytes: saved.length,
          contentType: target.contentType,
          stream: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(saved?.slice() ?? new Uint8Array())
              controller.close()
            },
          }),
        }
      },
    },
  }
  const request = (body = bytes) =>
    new Request(
      "https://receipt.invalid/api/finance/expense-receipts/asset/upload?bookId=book&billId=expense",
      {
        method: "PUT",
        body,
        headers: { "content-type": target.contentType },
      },
    )
  const storage = () => configuration
  const app = new OpenAPIHono()
  registerFinanceExpenseReceiptUploadRoutes(app, {
    prepare: async (_context, input) => {
      expect(input).toEqual({
        bookId: "book",
        billId: "expense",
        assetId: "asset",
      })
      return repository
    },
    storage,
  })
  return {
    scope,
    target,
    claim,
    metadata,
    repository,
    configuration,
    controls,
    calls,
    request,
    storage,
    app,
  }
}

describe("authenticated original Expense receipt upload orchestration", () => {
  test("current authority precedes every provider effect and completion follows uncached original reread", async () => {
    const f = fixture()
    const response = await f.app.request(f.request())
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    const result = await response.json()
    expect(result.uploadState).toBe("VERIFIED")
    expect(result.safetyState).toBe("QUARANTINED")
    expect(result.attachmentState).toBe("UNATTACHED")
    for (const field of [
      "contentDigest",
      "storagePath",
      "storageStoreId",
      "claimId",
      "url",
      "scope",
      "target",
      "token",
    ])
      expect(result).not.toHaveProperty(field)
    expect(f.calls).toEqual([
      "load",
      "claim",
      "revalidate",
      "put",
      "revalidate",
      "get",
      "complete",
    ])
  })

  test("bad original body is rejected before any claim, provider call or completion", async () => {
    const f = fixture()
    const response = await f.app.request(f.request(bytes.slice(0, -1)))
    expect(response.status).toBe(400)
    expect(f.calls).toEqual(["load"])
  })

  test("revocation before write and after write refuse without hiding the authority error", async () => {
    for (const at of [1, 2]) {
      const f = fixture()
      f.controls.beforeRevalidate = (count) => {
        if (count === at)
          throw new FinanceError(
            "FORBIDDEN",
            "Current finance access was revoked.",
          )
      }
      const response = await f.app.request(f.request())
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({
        error: "Current finance access was revoked.",
      })
      expect(f.calls.includes("put")).toBe(at === 2)
      expect(f.calls).not.toContain("get")
      expect(f.calls).not.toContain("complete")
    }
  })

  test("fresh QA classification blocks a formerly LIVE transport before a provider effect", async () => {
    const f = fixture()
    f.scope.dataClassification = "LIVE"
    f.configuration.providerMode = "live"
    f.controls.beforeRevalidate = () => {
      f.scope.dataClassification = "QA"
    }
    const response = await f.app.request(f.request())
    expect(response.status).toBe(412)
    expect(f.calls).not.toContain("put")
    expect(f.calls).not.toContain("get")
    expect(f.calls).not.toContain("complete")
  })

  test("lost write responses require independently authorized exact rereads without overwriting", async () => {
    const f = fixture()
    f.controls.lostPutResponse = true
    const result = await uploadFinanceExpenseReceipt({
      request: f.request(),
      repository: f.repository,
      storage: f.storage,
    })
    expect(result.uploadState).toBe("VERIFIED")
    expect(f.calls).toEqual([
      "load",
      "claim",
      "revalidate",
      "put",
      "revalidate",
      "get",
      "revalidate",
      "get",
      "complete",
    ])
  })

  test("missing original after successful write cannot certify completion", async () => {
    const f = fixture()
    f.controls.missingOriginal = true
    const response = await f.app.request(f.request())
    expect(response.status).toBe(503)
    expect(f.calls).toContain("put")
    expect(f.calls).toContain("get")
    expect(f.calls).not.toContain("complete")
  })

  test("changed scope/identity/lease or pin after claiming cannot reach the provider", async () => {
    for (const changed of ["digest", "actor", "lease", "pin"] as const) {
      const f = fixture()
      const revalidate = f.repository.revalidate
      f.repository.revalidate = async (claim) => {
        const current = await revalidate(claim)
        if (changed === "digest") current.target.contentDigest = "f".repeat(64)
        if (changed === "actor") current.scope.actorUserId = "other"
        if (changed === "lease") current.leaseUntil = new Date(0)
        if (changed === "pin") current.storageStoreId = "store_foreign"
        return current
      }
      expect((await f.app.request(f.request())).status).toBe(409)
      expect(f.calls).not.toContain("put")
      expect(f.calls).not.toContain("get")
      expect(f.calls).not.toContain("complete")
    }
  })

  test("verified original retry reauthorizes after body and retains later withdrawal without storage", async () => {
    const f = fixture()
    let loads = 0
    f.repository.load = async (): Promise<ExpenseReceiptUploadAuthority> => {
      loads++
      return {
        kind: "VERIFIED",
        scope: { ...f.scope },
        target: structuredClone(f.target),
        stored: {
          ...f.target,
          storagePath: expenseReceiptStoragePath(f.target),
          storageProvider: "vercel_blob_private",
          verifiedAt: new Date(f.target.createdAt.getTime() + 1),
          storageStoreId: "store_owned",
        },
        metadata: {
          ...f.metadata,
          uploadState: "VERIFIED",
          safetyState: "SAFE",
          attachmentState: loads === 1 ? "ATTACHED" : "WITHDRAWN",
        },
      }
    }
    const result = await uploadFinanceExpenseReceipt({
      request: f.request(),
      repository: f.repository,
      storage() {
        throw new Error("Retained retry must not configure storage")
      },
    })
    expect(loads).toBe(2)
    expect(result.attachmentState).toBe("WITHDRAWN")
    expect(result.safetyState).toBe("SAFE")
    expect(f.calls).toEqual([])
  })

  test("current completed-retry revocation still refuses after valid body", async () => {
    const f = fixture()
    let loads = 0
    f.repository.load = async () => {
      if (++loads > 1)
        throw new FinanceError("FORBIDDEN", "Current access required.")
      return {
        kind: "VERIFIED",
        scope: f.scope,
        target: f.target,
        stored: {
          ...f.target,
          storagePath: expenseReceiptStoragePath(f.target),
          storageProvider: "vercel_blob_private",
          verifiedAt: new Date(f.target.createdAt.getTime() + 1),
          storageStoreId: "store_owned",
        },
        metadata: f.metadata,
      }
    }
    expect((await f.app.request(f.request())).status).toBe(403)
    expect(f.calls).toEqual([])
  })

  test("completed retry cannot silently change its original private store pin", async () => {
    const f = fixture()
    let loads = 0
    f.repository.load = async () => ({
      kind: "VERIFIED",
      scope: f.scope,
      target: f.target,
      stored: {
        ...f.target,
        storagePath: expenseReceiptStoragePath(f.target),
        storageProvider: "vercel_blob_private",
        verifiedAt: new Date(f.target.createdAt.getTime() + 1),
        storageStoreId: ++loads === 1 ? "store_owned" : "store_foreign",
      },
      metadata: f.metadata,
    })
    expect((await f.app.request(f.request())).status).toBe(409)
    expect(loads).toBe(2)
    expect(f.calls).toEqual([])
  })

  test("unavailable Finance configuration refuses before claim or provider work", async () => {
    const f = fixture()
    f.configuration.storeId = null
    f.configuration.configured = () => false
    expect((await f.app.request(f.request())).status).toBe(503)
    expect(f.calls).toEqual(["load"])
  })

  test("abort during authority recheck prevents a late provider effect and exposes no reason", async () => {
    const f = fixture()
    const abort = new AbortController()
    f.controls.beforeRevalidate = () => {
      abort.abort(new Error("private secret abort reason"))
    }
    const response = await f.app.request(
      new Request(f.request(), { signal: abort.signal }),
    )
    expect(response.status).toBe(408)
    expect(await response.text()).not.toContain("secret")
    expect(f.calls).not.toContain("put")
    expect(f.calls).not.toContain("get")
    expect(f.calls).not.toContain("complete")
  })

  test("request query cannot inject actor, provider state or ambiguous duplicate identities", async () => {
    const f = fixture()
    for (const suffix of [
      "&tenantId=foreign",
      "&actorUserId=foreign",
      "&storageStoreId=store_foreign",
      "&safe=true",
      "&bookId=other",
      "&billId=other",
    ]) {
      const req = f.request()
      const ambiguous = new Request(req.url + suffix, req)
      expect((await f.app.request(ambiguous)).status).toBe(400)
    }
    expect(f.calls).toEqual([])
  })

  test("configuration/provider/database diagnostics never escape the private HTTP response", async () => {
    const f = fixture()
    f.controls.completeError = new Error(
      "secret https://private.invalid/original",
    )
    const response = await f.app.request(f.request())
    expect(response.status).toBe(500)
    const value = await response.text()
    expect(value).not.toContain("secret")
    expect(value).not.toContain("private.invalid")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
  })
})

test("authenticated context supplies Tenant/actor and only current Owner/Admin reaches finance", () => {
  const ctx = {
    session: { user: { id: "authenticated-owner" } },
    tenantContext: {
      tenant: { id: "authenticated-tenant" },
      membership: { role: "OWNER" },
    },
  }
  expect(financeExpenseReceiptActorScope(ctx)).toEqual({
    tenantId: "authenticated-tenant",
    actorUserId: "authenticated-owner",
  })
  expect(
    financeExpenseReceiptActorScope({
      ...ctx,
      tenantContext: { ...ctx.tenantContext, membership: { role: "admin" } },
    }),
  ).toEqual({
    tenantId: "authenticated-tenant",
    actorUserId: "authenticated-owner",
  })
  for (const role of [
    "MANAGER",
    "CASHIER",
    "OPERATOR",
    "MEMBER",
    "SUPPORT",
    "GUEST",
  ])
    expect(() =>
      financeExpenseReceiptActorScope({
        ...ctx,
        tenantContext: { ...ctx.tenantContext, membership: { role } },
      }),
    ).toThrow(TRPCError)
  expect(() =>
    financeExpenseReceiptActorScope({ ...ctx, session: null }),
  ).toThrow(TRPCError)
  expect(() =>
    financeExpenseReceiptActorScope({ ...ctx, tenantContext: null }),
  ).toThrow(TRPCError)
})
