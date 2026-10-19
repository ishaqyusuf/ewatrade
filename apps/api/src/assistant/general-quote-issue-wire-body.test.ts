import { describe, expect, test } from "bun:test"
import {
  QUOTE_WIRE_MAX_BYTES,
  QuoteWireBodyError,
  readQuoteWireJSON,
} from "./general-quote-issue-wire-body"

const encoder = new TextEncoder()

function postRequest(
  body: ReadableStream<Uint8Array>,
  headers?: HeadersInit,
  signal?: AbortSignal,
) {
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    body,
    headers,
    signal,
    duplex: "half",
  }
  return new Request("https://fixture.invalid/quote-drafts/edit", init)
}

function streamed(
  parts: Uint8Array[],
  headers?: HeadersInit,
  signal?: AbortSignal,
) {
  let reads = 0
  let cancellations = 0
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const next = parts[reads++]
        if (next) controller.enqueue(next)
        else controller.close()
      },
      cancel() {
        cancellations++
      },
    },
    { highWaterMark: 0 },
  )
  return {
    request: postRequest(stream, headers, signal),
    reads: () => reads,
    cancellations: () => cancellations,
  }
}

describe("dedicated Quote request JSON admission", () => {
  test("the exact full-body boundary accepts, one byte over refuses before decoding the rest", async () => {
    const raw = encoder.encode(JSON.stringify({ reason: "kept" }))
    expect(
      await readQuoteWireJSON(streamed([raw]).request, raw.byteLength),
    ).toEqual({ reason: "kept" })
    const oversized = streamed([
      raw.subarray(0, raw.byteLength - 1),
      raw.subarray(raw.byteLength - 1),
      encoder.encode("unread remainder"),
    ])
    await expect(
      readQuoteWireJSON(oversized.request, raw.byteLength - 1),
    ).rejects.toMatchObject({ reason: "body_byte_limit" })
    expect(oversized.reads()).toBe(2)
    expect(oversized.cancellations()).toBe(1)
  })

  test("counts UTF8 and JSON escapes, retaining split code points and exact strings", async () => {
    const value = { note: "漢\u0001😀", nested: { zero: 0 } }
    const raw = encoder.encode(JSON.stringify(value))
    const chunks = Array.from(raw, (unit) => new Uint8Array([unit]))
    expect(
      await readQuoteWireJSON(streamed(chunks).request, raw.length),
    ).toEqual(value)
    await expect(
      readQuoteWireJSON(streamed(chunks).request, raw.length - 1),
    ).rejects.toMatchObject({ reason: "body_byte_limit" })
  })

  test("a declared oversized body is rejected without reading; short headers do not bypass actual counting", async () => {
    const oversized = streamed([encoder.encode("{}")], {
      "content-length": String(QUOTE_WIRE_MAX_BYTES + 1),
    })
    await expect(readQuoteWireJSON(oversized.request)).rejects.toMatchObject({
      reason: "body_byte_limit",
    })
    expect(oversized.reads()).toBe(0)
    const lying = streamed([encoder.encode('{"note":"long"}')], {
      "content-length": "2",
    })
    await expect(readQuoteWireJSON(lying.request, 2)).rejects.toMatchObject({
      reason: "body_byte_limit",
    })
  })

  test("refuses malformed and incomplete UTF8 without replacement characters", async () => {
    for (const bytes of [
      new Uint8Array([34, 0xc0, 0xaf, 34]),
      new Uint8Array([34, 0xe2, 0x82]),
      new Uint8Array([34, 0xed, 0xa0, 0x80, 34]),
    ])
      await expect(
        readQuoteWireJSON(streamed([bytes]).request),
      ).rejects.toMatchObject({ reason: "invalid_utf8" })
  })

  test("refuses invalid JSON, unsupported compression, missing and already-consumed bodies", async () => {
    await expect(
      readQuoteWireJSON(streamed([encoder.encode('{"note":')]).request),
    ).rejects.toMatchObject({ reason: "invalid_json" })
    const compressed = streamed([encoder.encode("{}")], {
      "content-encoding": "gzip",
    })
    await expect(readQuoteWireJSON(compressed.request)).rejects.toMatchObject({
      reason: "unsupported_encoding",
    })
    expect(compressed.reads()).toBe(0)
    await expect(
      readQuoteWireJSON(new Request("https://fixture.invalid")),
    ).rejects.toMatchObject({ reason: "unreadable" })
    const used = streamed([encoder.encode("{}")]).request
    await used.text()
    await expect(readQuoteWireJSON(used)).rejects.toMatchObject({
      reason: "unreadable",
    })
  })

  test("abort wakes a pending body read without waiting for an unresponsive producer", async () => {
    const abort = new AbortController()
    let cancelled = 0
    const request = postRequest(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelled++
          return new Promise<void>(() => {})
        },
      }),
      undefined,
      abort.signal,
    )
    const reading = readQuoteWireJSON(request)
    abort.abort()
    await expect(reading).rejects.toMatchObject({ reason: "aborted" })
    expect(cancelled).toBe(1)
    const already = new AbortController()
    already.abort()
    const unread = streamed([encoder.encode("{}")], undefined, already.signal)
    await expect(readQuoteWireJSON(unread.request)).rejects.toMatchObject({
      reason: "aborted",
    })
    expect(unread.reads()).toBe(0)
  })

  test("stream failures map to a safe refusal without leaking producer errors", async () => {
    const request = postRequest(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error("private producer diagnostic"))
        },
      }),
    )
    try {
      await readQuoteWireJSON(request)
      throw new Error("expected refusal")
    } catch (error) {
      expect(error).toBeInstanceOf(QuoteWireBodyError)
      expect(error).toMatchObject({ reason: "unreadable" })
      expect((error as Error).message).not.toContain("private producer")
    }
  })
})
