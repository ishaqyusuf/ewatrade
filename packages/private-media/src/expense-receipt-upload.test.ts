import { describe, expect, test } from "bun:test"
import { readExpenseReceiptUpload } from "./expense-receipt-upload"
import { privateObjectDigest } from "./object-storage"

const bytes = new TextEncoder().encode("%PDF-1.7\nowned synthetic original")
const original = {
  sizeBytes: bytes.length,
  contentDigest: privateObjectDigest(bytes),
  contentType: "application/pdf" as const,
}

function request(
  chunks: Uint8Array[] = [bytes],
  headers: Record<string, string> = {},
  signal?: AbortSignal,
) {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
    cancel() {
      cancelled = true
    },
  })
  return {
    request: new Request("https://receipt.invalid/upload", {
      method: "PUT",
      body,
      signal,
      headers: { "content-type": original.contentType, ...headers },
    }),
    cancelled: () => cancelled,
  }
}

describe("bounded original receipt ingress", () => {
  test("reads split exact originals into detached bytes without any safety authority", async () => {
    const chunks = [bytes.slice(0, 9), bytes.slice(9)]
    const f = request(chunks, { "content-length": String(bytes.length) })
    const result = await readExpenseReceiptUpload(f.request, original)
    expect(result).toEqual(bytes)
    chunks[0]?.fill(0)
    chunks[1]?.fill(0)
    expect(result).toEqual(bytes)
    expect(result).not.toHaveProperty("safe")
    expect(f.request.body?.locked).toBe(false)
  })

  test("rejects encoded, mismatched and non-exact headers before stream ingestion", async () => {
    const cases: Array<Record<string, string>> = [
      { "content-type": "image/png" },
      { "content-type": "application/pdf; charset=utf-8" },
      { "content-encoding": "gzip" },
      { "content-length": "0" },
      { "content-length": String(bytes.length + 1) },
      { "content-length": "1e2" },
      { "content-length": "100000000" },
    ]
    for (const headers of cases) {
      const f = request([bytes], headers)
      await expect(
        readExpenseReceiptUpload(f.request, original),
      ).rejects.toMatchObject({ status: 400 })
      expect(f.request.body?.locked).toBe(false)
    }
    expect(
      await readExpenseReceiptUpload(
        request([bytes], { "content-encoding": "identity" }).request,
        original,
      ),
    ).toEqual(bytes)
  })

  test("invalid saved original bounds fail before body reads and cancel an unconsumed body", async () => {
    let reads = 0
    let cancelled = false
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          reads++
        },
        cancel() {
          cancelled = true
        },
      },
      { highWaterMark: 0 },
    )
    const req = new Request("https://receipt.invalid/upload", {
      method: "PUT",
      body,
    })
    await expect(
      readExpenseReceiptUpload(req, { ...original, sizeBytes: 10_000_001 }),
    ).rejects.toMatchObject({ status: 413 })
    expect(reads).toBe(0)
    expect(cancelled).toBe(true)
    for (const sizeBytes of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      1.5,
    ]) {
      await expect(
        readExpenseReceiptUpload(request().request, { ...original, sizeBytes }),
      ).rejects.toMatchObject({ status: 413 })
    }
    await expect(
      readExpenseReceiptUpload(request().request, {
        ...original,
        contentDigest: "F".repeat(64),
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  test("same size with another digest or MIME never returns bytes", async () => {
    await expect(
      readExpenseReceiptUpload(request().request, {
        ...original,
        contentDigest: "f".repeat(64),
      }),
    ).rejects.toMatchObject({ status: 400 })
    const html = new TextEncoder().encode("<html>unsafe original</html>")
    await expect(
      readExpenseReceiptUpload(request([html]).request, {
        ...original,
        sizeBytes: html.length,
        contentDigest: privateObjectDigest(html),
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  test("rejects short and oversized bodies without accepting a valid prefix", async () => {
    await expect(
      readExpenseReceiptUpload(request([bytes.slice(0, -1)]).request, original),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      readExpenseReceiptUpload(
        request([bytes, new Uint8Array([1])]).request,
        original,
      ),
    ).rejects.toMatchObject({ status: 413 })
    await expect(
      readExpenseReceiptUpload(request([new Uint8Array()]).request, original),
    ).rejects.toMatchObject({ status: 413 })
  })

  test("bounds adversarial fragment counts independent of total byte size", async () => {
    const fragmented = new Uint8Array(65_537)
    fragmented.set(bytes)
    const chunks = Array.from(fragmented, (byte) => new Uint8Array([byte]))
    await expect(
      readExpenseReceiptUpload(request(chunks).request, {
        ...original,
        sizeBytes: fragmented.length,
        contentDigest: privateObjectDigest(fragmented),
      }),
    ).rejects.toMatchObject({ status: 413 })
  })

  test("abort interrupts a non-cooperating pending reader and releases its lock", async () => {
    const controller = new AbortController()
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      },
    })
    const req = new Request("https://receipt.invalid/upload", {
      method: "PUT",
      body,
      signal: controller.signal,
      headers: { "content-type": original.contentType },
    })
    const pending = readExpenseReceiptUpload(req, original)
    controller.abort(new Error("private provider secret"))
    await expect(pending).rejects.toMatchObject({ status: 408 })
    expect(cancelled).toBe(true)
    expect(req.body?.locked).toBe(false)
  })

  test("stream failures produce safe errors without provider diagnostics or causes", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("secret https://private.invalid/original"))
      },
    })
    const req = new Request("https://receipt.invalid/upload", {
      method: "PUT",
      body,
      headers: { "content-type": original.contentType },
    })
    try {
      await readExpenseReceiptUpload(req, original)
      throw new Error("Expected failure")
    } catch (error) {
      expect(error).toMatchObject({ status: 408 })
      expect(String(error)).not.toContain("secret")
      expect(String(error)).not.toContain("private.invalid")
      expect(error).not.toHaveProperty("cause")
    }
  })

  test("missing, already consumed or locked bodies cannot leak raw stream errors", async () => {
    const empty = new Request("https://receipt.invalid/upload", {
      method: "PUT",
      headers: { "content-type": original.contentType },
    })
    await expect(
      readExpenseReceiptUpload(empty, original),
    ).rejects.toMatchObject({ status: 400 })
    const consumed = request().request
    await consumed.arrayBuffer()
    await expect(
      readExpenseReceiptUpload(consumed, original),
    ).rejects.toMatchObject({ status: 400 })
    const locked = request().request
    const reader = locked.body?.getReader()
    try {
      await expect(
        readExpenseReceiptUpload(locked, original),
      ).rejects.toMatchObject({ status: 400 })
    } finally {
      await reader?.cancel()
      reader?.releaseLock()
    }
  })

  test("detaches original identity before asynchronous reads", async () => {
    const candidate = { ...original }
    const pending = readExpenseReceiptUpload(request().request, candidate)
    candidate.contentDigest = "f".repeat(64)
    candidate.sizeBytes = 1
    expect(await pending).toEqual(bytes)
  })
})
