import { describe, expect, it } from "bun:test"
import {
  createExpenseReceiptFetcher,
  expenseReceiptDownloadGrantRequest,
  expenseReceiptIntentIdentity,
  expenseReceiptOriginalRequest,
  expenseReceiptUploadUrl,
} from "./expense-receipt-client"

describe("expense receipt API transport", () => {
  it("keys intent recovery by filename, MIME, size, and content digest", async () => {
    const original = {
      fileName: "receipt.pdf",
      contentType: "application/pdf" as const,
      sizeBytes: 4,
      contentDigest: "a".repeat(64),
    }
    const identity = await expenseReceiptIntentIdentity(original)
    expect(identity).toMatch(/^[a-f0-9]{64}$/)
    expect(
      await expenseReceiptIntentIdentity({ ...original, fileName: "copy.pdf" }),
    ).not.toBe(identity)
    expect(
      await expenseReceiptIntentIdentity({ ...original, sizeBytes: 5 }),
    ).not.toBe(identity)
    expect(
      await expenseReceiptIntentIdentity({
        ...original,
        contentDigest: "b".repeat(64),
      }),
    ).not.toBe(identity)
  })

  it("sends upload bytes to the configured same-origin API route with the dashboard tenant header", async () => {
    let destination: RequestInfo | URL | undefined
    let request: RequestInit | undefined
    const fetcher = createExpenseReceiptFetcher(
      async (input, init) => {
        destination = input
        request = init
        return new Response("{}", { status: 200 })
      },
      () => "market-west",
    )
    const url = expenseReceiptUploadUrl("asset-1", "book-1", "expense-1")
    await fetcher(url, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: new Blob(["test"], { type: "application/pdf" }),
    })

    expect(destination).toBe(
      "/api/finance/expense-receipts/asset-1/upload?bookId=book-1&billId=expense-1",
    )
    expect(request?.method).toBe("PUT")
    expect(request?.credentials).toBe("same-origin")
    expect(request?.cache).toBe("no-store")
    expect(new Headers(request?.headers).get("x-tenant-slug")).toBe(
      "market-west",
    )
    expect(new Headers(request?.headers).get("content-type")).toBe(
      "application/pdf",
    )
  })

  it("keeps the one-time download token in the required header, never the URL", async () => {
    const sent: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const fetcher = createExpenseReceiptFetcher(
      async (input, init) => {
        sent.push({ input, init })
        return new Response("{}", { status: 200 })
      },
      () => "market-west",
    )
    const grant = expenseReceiptDownloadGrantRequest(
      "asset-1",
      "book-1",
      "expense-1",
    )
    await fetcher(grant.url, grant.init)
    const original = expenseReceiptOriginalRequest(
      "asset-1",
      "book-1",
      "expense-1",
      "opaque-one-time-token",
    )
    await fetcher(original.url, original.init)

    expect(sent[0]?.input).toBe(
      "/api/finance/expense-receipts/asset-1/download-grant?bookId=book-1&billId=expense-1",
    )
    expect(sent[0]?.init?.method).toBe("POST")
    expect(sent[1]?.input).toBe(
      "/api/finance/expense-receipts/asset-1/original?bookId=book-1&billId=expense-1",
    )
    expect(String(sent[1]?.input)).not.toContain("opaque-one-time-token")
    expect(
      new Headers(sent[1]?.init?.headers).get("X-Receipt-Download-Token"),
    ).toBe("opaque-one-time-token")
    expect(sent.every(({ init }) => init?.credentials === "same-origin")).toBe(
      true,
    )
    expect(
      sent.every(
        ({ init }) =>
          new Headers(init?.headers).get("x-tenant-slug") === "market-west",
      ),
    ).toBe(true)
  })
})
