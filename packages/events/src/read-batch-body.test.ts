import { expect, test } from "bun:test"
import { readBatchBody } from "./read-batch-body"

test("rejects and cancels oversized streaming bodies before consuming the rest", async () => {
  let cancelled = false
  let reads = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      reads++
      controller.enqueue(new Uint8Array(32 * 1024))
    },
    cancel() {
      cancelled = true
    },
  })
  const request = new Request("https://example.test", { method: "POST", body })
  expect(await readBatchBody(request)).toEqual({ ok: false, status: 413 })
  expect(cancelled).toBe(true)
  expect(reads).toBeLessThanOrEqual(3)
})
test("accepts exact byte limit and rejects malformed JSON", async () => {
  const text = JSON.stringify("a".repeat(48 * 1024 - 2))
  const result = await readBatchBody(
    new Request("https://example.test", { method: "POST", body: text }),
  )
  expect(result.ok).toBe(true)
  expect(
    await readBatchBody(
      new Request("https://example.test", { method: "POST", body: "{" }),
    ),
  ).toEqual({ ok: false, status: 400 })
})
