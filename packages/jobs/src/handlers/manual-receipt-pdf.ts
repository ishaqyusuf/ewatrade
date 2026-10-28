import { EventEmitter } from "node:events"
import { URL } from "node:url"
import { Worker } from "node:worker_threads"
import type { ReceiptPage } from "@ewatrade/payments/receipt-extractor"

const MAX_BYTES = 4 * 1024 * 1024
let active = 0

function pagesFromWorker(value: unknown): ReceiptPage[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return null
  const pages: ReceiptPage[] = []
  let pixels = 0
  let bytes = 0
  for (const candidate of value) {
    const page: unknown = candidate
    if (!page || typeof page !== "object") return null
    const width: unknown = Reflect.get(page, "width")
    const height: unknown = Reflect.get(page, "height")
    const image: unknown = Reflect.get(page, "bytes")
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      width * height > 4_000_000 ||
      !(image instanceof Uint8Array) ||
      image.byteLength < 24 ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every(
        (byte, index) => image[index] === byte,
      )
    )
      return null
    const header = Buffer.from(image.buffer, image.byteOffset, image.byteLength)
    if (
      header.toString("ascii", 12, 16) !== "IHDR" ||
      header.readUInt32BE(16) !== width ||
      header.readUInt32BE(20) !== height
    )
      return null
    pixels += width * height
    bytes += image.byteLength
    if (pixels > 8_000_000 || bytes > MAX_BYTES) return null
    pages.push({ bytes: image, width, height, contentType: "image/png" })
  }
  return pages
}

/** Untrusted PDFs run in a disposable worker; rejection always keeps manual review. */
export async function renderManualReceiptPdf(
  bytes: Uint8Array,
  abortSignal?: AbortSignal,
): Promise<ReceiptPage[] | null> {
  if (
    active >= 2 ||
    abortSignal?.aborted ||
    bytes.byteLength < 8 ||
    bytes.byteLength > MAX_BYTES ||
    Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-"
  )
    return null
  active++
  try {
    const signal = abortSignal
      ? AbortSignal.any([abortSignal, AbortSignal.timeout(8_000)])
      : AbortSignal.timeout(8_000)
    return await new Promise<ReceiptPage[] | null>((resolve) => {
      const worker = new Worker(
        new URL("./manual-receipt-pdf-worker.mjs", import.meta.url),
        process.versions.bun
          ? {}
          : {
              resourceLimits: {
                maxOldGenerationSizeMb: 192,
                maxYoungGenerationSizeMb: 32,
              },
              stdout: true,
              stderr: true,
            },
      )
      worker.stdout?.resume()
      worker.stderr?.resume()
      let settled = false
      const finish = (pages: ReceiptPage[] | null = null) => {
        if (settled) return
        settled = true
        signal.removeEventListener("abort", abort)
        // Await termination before releasing the concurrency slot.
        void worker
          .terminate()
          .catch(() => {})
          .finally(() => resolve(pages))
      }
      const abort = () => finish()
      signal.addEventListener("abort", abort, { once: true })
      EventEmitter.prototype.once.call(worker, "error", () => finish())
      EventEmitter.prototype.once.call(worker, "exit", () => finish())
      EventEmitter.prototype.once.call(worker, "message", (value: unknown) =>
        finish(pagesFromWorker(value)),
      )
      if (signal.aborted) return finish()
      worker.postMessage({ bytes: Uint8Array.from(bytes) })
    })
  } catch {
    return null
  } finally {
    active--
  }
}
