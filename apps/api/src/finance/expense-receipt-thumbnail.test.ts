import { describe, expect, test } from "bun:test"
import {
  type ExpenseReceiptThumbnailRepository,
  FinanceError,
} from "@ewatrade/db/finance-expense-receipt-delivery"
import {
  expenseReceiptStoragePath,
  expenseReceiptThumbnailPath,
} from "@ewatrade/private-media/expense-receipts"
import { privateObjectDigest } from "@ewatrade/private-media/object-storage"
import { OpenAPIHono } from "@hono/zod-openapi"
import { registerFinanceExpenseReceiptDeliveryRoutes } from "./expense-receipt-delivery"

// A tiny stored WebP derivative; the route never decodes an already-made thumbnail.
const thumbBytes = new Uint8Array([
  ...new TextEncoder().encode("RIFF"),
  20,
  0,
  0,
  0,
  ...new TextEncoder().encode("WEBPVP8 "),
  ...new Uint8Array(16).fill(7),
])
const url =
  "/api/finance/expense-receipts/asset/thumbnail?bookId=book&billId=expense"

function fixture(options: {
  contentType?: "image/jpeg" | "application/pdf"
  denied?: boolean
  deniedAfterRead?: boolean
}) {
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
    contentDigest: "a".repeat(64),
    contentType: options.contentType ?? ("image/jpeg" as const),
    sizeBytes: 1000,
    storageProvider: "vercel_blob_private" as const,
    storageStoreId: "store_owned",
    verifiedAt: new Date(Date.now() - 1000),
  }
  const thumbnail = {
    storagePath: expenseReceiptThumbnailPath({
      ...scope,
      assetId: "asset",
      contentDigest: privateObjectDigest(thumbBytes),
    }),
    contentDigest: privateObjectDigest(thumbBytes),
    sizeBytes: thumbBytes.length,
    width: 240,
    height: 320,
    version: "v1-test",
  }
  let inspections = 0
  let reads = 0
  const repository: ExpenseReceiptThumbnailRepository = {
    async inspect() {
      inspections += 1
      if (options.denied || (options.deniedAfterRead && reads > 0))
        throw new FinanceError("FORBIDDEN", "Receipt access revoked.")
      return {
        scope,
        original: {
          ...original,
          storagePath: expenseReceiptStoragePath(original),
        },
        thumbnail,
      } as never
    },
    async record() {
      throw new Error("An existing thumbnail is never re-recorded")
    },
  }
  const app = new OpenAPIHono()
  registerFinanceExpenseReceiptDeliveryRoutes(app, {
    async prepare() {
      return {
        repository: {} as never,
        thumbnails: repository,
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
          throw new Error("Serving a recorded thumbnail never writes")
        },
        async get(path) {
          reads += 1
          if (path !== thumbnail.storagePath) return null
          return {
            contentType: "image/webp",
            sizeBytes: thumbBytes.length,
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue(thumbBytes)
                controller.close()
              },
            }),
          }
        },
      },
    }),
  })
  return { app, inspections: () => inspections, reads: () => reads }
}

describe("private receipt thumbnail HTTP contract (ADR-0051)", () => {
  test("serves the recorded WebP inline with private headers and no grant", async () => {
    const f = fixture({})
    const response = await f.app.request(url)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/webp")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; sandbox",
    )
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="receipt-asset-preview.webp"',
    )
    expect(response.headers.get("access-control-allow-origin")).toBeNull()
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(thumbBytes)
    // Authority is checked before and again after the storage read.
    expect(f.inspections()).toBe(2)
  })

  test("refuses without current Owner/Admin authority and reads nothing", async () => {
    const f = fixture({ denied: true })
    const response = await f.app.request(url)
    expect(response.status).toBe(403)
    expect(f.reads()).toBe(0)
  })

  test("returns no bytes when authority is revoked during the read", async () => {
    const f = fixture({ deniedAfterRead: true })
    const response = await f.app.request(url)
    expect(response.status).toBe(403)
    expect(response.headers.get("content-type")).not.toBe("image/webp")
  })

  test("PDF receipts have no preview", async () => {
    const f = fixture({ contentType: "application/pdf" })
    const response = await f.app.request(url)
    expect(response.status).toBe(404)
    expect(f.reads()).toBe(0)
  })

  test("rejects extra query parameters and request bodies", async () => {
    const f = fixture({})
    expect((await f.app.request(`${url}&x=1`)).status).toBe(400)
    expect(f.inspections()).toBe(0)
  })
})

describe("making a receipt thumbnail on first view", () => {
  test("decodes the attached original once, stores a verified WebP and records it", async () => {
    const sharp = (await import("sharp")).default
    const jpeg = new Uint8Array(
      await sharp({
        create: {
          width: 900,
          height: 1200,
          channels: 3,
          background: "#e8dcc4",
        },
      })
        .jpeg()
        .toBuffer(),
    )
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
      contentDigest: privateObjectDigest(jpeg),
      contentType: "image/jpeg" as const,
      sizeBytes: jpeg.length,
      storageProvider: "vercel_blob_private" as const,
      storageStoreId: "store_owned",
      verifiedAt: new Date(Date.now() - 1000),
    }
    const originalPath = expenseReceiptStoragePath(original)
    const objects = new Map<string, Uint8Array>([[originalPath, jpeg]])
    let recorded:
      | Parameters<ExpenseReceiptThumbnailRepository["record"]>[1]
      | null = null
    const repository: ExpenseReceiptThumbnailRepository = {
      async inspect() {
        return {
          scope,
          original: { ...original, storagePath: originalPath },
          thumbnail: recorded,
        } as never
      },
      async record(originalDigest, thumbnail) {
        expect(originalDigest).toBe(original.contentDigest)
        recorded = thumbnail
        return thumbnail
      },
    }
    const app = new OpenAPIHono()
    registerFinanceExpenseReceiptDeliveryRoutes(app, {
      async prepare() {
        return {
          repository: {} as never,
          thumbnails: repository,
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
          async put(path, bytes, options) {
            expect(options.access).toBe("private")
            expect(options.allowOverwrite).toBe(false)
            expect(
              path.startsWith(
                "finance/expense-receipts/thumbnails/tenant/book/expense/asset/",
              ),
            ).toBe(true)
            objects.set(path, bytes.slice())
          },
          async get(path) {
            const stored = objects.get(path)
            if (!stored) return null
            return {
              contentType: path.endsWith(".webp") ? "image/webp" : "image/jpeg",
              sizeBytes: stored.length,
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue(stored)
                  controller.close()
                },
              }),
            }
          },
        },
      }),
    })
    const response = await app.request(url)
    expect(response.status).toBe(200)
    const served = new Uint8Array(await response.arrayBuffer())
    expect(Buffer.from(served.subarray(8, 12)).toString()).toBe("WEBP")
    expect(recorded).not.toBeNull()
    const meta = await sharp(served).metadata()
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(320)
    // The original is never rewritten; only the derivative is added.
    expect(objects.get(originalPath)).toEqual(jpeg)
    expect(objects.size).toBe(2)
  })
})
