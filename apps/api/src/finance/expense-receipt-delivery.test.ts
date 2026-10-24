import { describe, expect, test } from "bun:test"
import {
  type ExpenseReceiptDeliveryAuthority,
  type ExpenseReceiptDeliveryRepository,
  FinanceError,
} from "@ewatrade/db/finance-expense-receipt-delivery"
import { expenseReceiptStoragePath } from "@ewatrade/private-media/expense-receipts"
import { privateObjectDigest } from "@ewatrade/private-media/object-storage"
import { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import { registerFinanceExpenseReceiptDeliveryRoutes } from "./expense-receipt-delivery"

const bytes = new TextEncoder().encode("%PDF-1.7\nowned HTTP delivery fixture")
const sourceUrl = "/api/finance/expense-receipts/asset"
const scopeQuery = "?bookId=book&billId=expense"
function fixture() {
  const scope = {
    tenantId: "tenant",
    bookId: "book",
    billId: "expense",
    actorUserId: "owner",
    dataClassification: "QA" as const,
  }
  const original = {
    tenantId: "tenant",
    bookId: "book",
    billId: "expense",
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
    original: { ...original, storagePath: expenseReceiptStoragePath(original) },
  }
  let consumed = false
  let reads = 0
  let issued = 0
  const controls: {
    prepareError?: Error
    afterReadDenied?: boolean
    prepared: number
  } = { prepared: 0 }
  const repository: ExpenseReceiptDeliveryRepository = {
    inspect: async () => structuredClone(authority),
    async issue(protocol) {
      issued += 1
      const now = Date.now()
      return {
        id: "grant",
        purpose: protocol.purpose,
        version: protocol.version,
        issuedAt: new Date(now),
        expiresAt: new Date(now + 60_000),
      }
    },
    async consume() {
      if (consumed) throw new FinanceError("FORBIDDEN", "Grant is unavailable.")
      consumed = true
      return { ...structuredClone(authority), grantId: "grant" }
    },
    async revalidate() {
      if (reads && controls.afterReadDenied)
        throw new FinanceError("FORBIDDEN", "Receipt access revoked.")
      return structuredClone(authority)
    },
  }
  const app = new OpenAPIHono()
  registerFinanceExpenseReceiptDeliveryRoutes(app, {
    async prepare(_context, source) {
      controls.prepared += 1
      expect(source).toEqual({
        bookId: "book",
        billId: "expense",
        assetId: "asset",
      })
      if (controls.prepareError) throw controls.prepareError
      return {
        repository,
        sessionId: "owned_session",
        checkSession: async () => undefined,
      }
    },
    secret: () => "owned-private-receipt-http-secret-32-characters",
    storage: () => ({
      configured: () => true,
      storeId: "store_owned",
      providerMode: "test",
      port: {
        async put() {
          throw new Error("HTTP delivery cannot write bytes")
        },
        async get() {
          reads += 1
          return {
            contentType: "application/pdf",
            sizeBytes: bytes.length,
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue(bytes)
                controller.close()
              },
            }),
          }
        },
      },
    }),
  })
  async function grant() {
    const response = await app.request(
      `${sourceUrl}/download-grant${scopeQuery}`,
      { method: "POST" },
    )
    const body = (await response.json()) as { token: string; expiresAt: string }
    return { response, body }
  }
  return { app, controls, grant, reads: () => reads, issued: () => issued }
}

describe("private original receipt HTTP contract", () => {
  test("grant and exact original use private headers, generated attachment name and no public URL", async () => {
    const f = fixture()
    const { response, body } = await f.grant()
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(Object.keys(body).sort()).toEqual(["expiresAt", "token"])
    expect(body.token).toMatch(/^v1\.[a-f0-9]{64}\.[a-f0-9]{64}$/)
    expect(f.reads()).toBe(0)
    const downloaded = await f.app.request(
      `${sourceUrl}/original${scopeQuery}`,
      {
        headers: {
          "x-receipt-download-token": body.token,
          "if-none-match": "*",
        },
      },
    )
    expect(downloaded.status).toBe(200)
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(bytes)
    expect(downloaded.headers.get("content-type")).toBe("application/pdf")
    expect(downloaded.headers.get("content-length")).toBe(String(bytes.length))
    expect(downloaded.headers.get("content-disposition")).toBe(
      'attachment; filename="receipt-asset.pdf"',
    )
    expect(downloaded.headers.get("cache-control")).toBe("private, no-store")
    expect(downloaded.headers.get("x-content-type-options")).toBe("nosniff")
    expect(downloaded.headers.get("etag")).toBeNull()
    expect(downloaded.headers.get("location")).toBeNull()
    const duplicate = await f.app.request(
      `${sourceUrl}/original${scopeQuery}`,
      { headers: { "x-receipt-download-token": body.token } },
    )
    expect(duplicate.status).toBe(403)
    expect(f.reads()).toBe(1)
  })

  test("strict source query rejects client authority, duplicate identities and token URLs before prepare", async () => {
    const f = fixture()
    for (const query of [
      "?bookId=book",
      `${scopeQuery}&bookId=book`,
      `${scopeQuery}&tenantId=tenant`,
      `${scopeQuery}&sessionId=session`,
      `${scopeQuery}&token=signed`,
      `${scopeQuery}&storageStoreId=store_owned`,
    ]) {
      const response = await f.app.request(`${sourceUrl}/original${query}`)
      expect(response.status).toBe(400)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
    }
    expect(f.controls.prepared).toBe(0)
    expect(f.reads()).toBe(0)
  })

  test("raw bodies and partial Range requests are refused before grant work", async () => {
    const f = fixture()
    const body = await f.app.request(
      `${sourceUrl}/download-grant${scopeQuery}`,
      { method: "POST", body: "untrusted grant fields" },
    )
    expect(body.status).toBe(400)
    const partial = await f.app.request(`${sourceUrl}/original${scopeQuery}`, {
      headers: { range: "bytes=0-4" },
    })
    expect(partial.status).toBe(400)
    expect(f.controls.prepared).toBe(0)
    expect(f.issued()).toBe(0)
  })

  test("missing or malformed signature refuses with a private error response", async () => {
    const f = fixture()
    const response = await f.app.request(`${sourceUrl}/original${scopeQuery}`)
    expect(response.status).toBe(403)
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(f.reads()).toBe(0)
  })

  test("protected preparation refusal maps unsigned and unauthorized roles without provider work", async () => {
    for (const code of ["UNAUTHORIZED", "FORBIDDEN"] as const) {
      const f = fixture()
      f.controls.prepareError = new TRPCError({
        code,
        message: "Current protected access refused.",
      })
      const response = await f.app.request(
        `${sourceUrl}/download-grant${scopeQuery}`,
        { method: "POST" },
      )
      expect(response.status).toBe(code === "UNAUTHORIZED" ? 401 : 403)
      expect(f.issued()).toBe(0)
      expect(f.reads()).toBe(0)
    }
  })

  test("revocation after original read returns JSON refusal and withholds verified byte body", async () => {
    const f = fixture()
    const { body } = await f.grant()
    f.controls.afterReadDenied = true
    const response = await f.app.request(`${sourceUrl}/original${scopeQuery}`, {
      headers: { "x-receipt-download-token": body.token },
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "Receipt access revoked." })
    expect(response.headers.get("content-disposition")).toBeNull()
  })

  test("unexpected private diagnostics are scrubbed", async () => {
    const f = fixture()
    f.controls.prepareError = new Error(
      "private provider token or database diagnostic",
    )
    const response = await f.app.request(
      `${sourceUrl}/download-grant${scopeQuery}`,
      { method: "POST" },
    )
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain("private provider token")
    expect(f.issued()).toBe(0)
  })
})
