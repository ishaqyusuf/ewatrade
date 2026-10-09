import { createHash } from "node:crypto"
import { EventEmitter } from "node:events"
import { URL } from "node:url"
import { Worker } from "node:worker_threads"
import sharp, { type Sharp } from "sharp"

// Includes exact native codec versions, fixed HEIC decoder and settings revision.
// A dependency/algorithm change creates a different private cache namespace.
export const CATALOG_PHOTO_PROCESSING_VERSION = `v1-${createHash("sha256")
  .update(
    JSON.stringify({
      settings: "catalog-webp-1600-82-3-320-76-2-heic-worker-v1",
      heif: "1.23.2",
      platform: process.platform,
      architecture: process.arch,
      codecs: Object.entries(sharp.versions).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    }),
  )
  .digest("hex")}`

export const CATALOG_PHOTO_MAX_PIXELS = 16_000_000
export const CATALOG_PHOTO_SOURCE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const
export type CatalogPhotoSourceType = (typeof CATALOG_PHOTO_SOURCE_TYPES)[number]

export class CatalogPhotoProcessingError extends Error {
  constructor(public readonly code: "INVALID_PHOTO" | "PHOTO_PROCESSING_BUSY") {
    super(
      code === "PHOTO_PROCESSING_BUSY"
        ? "Photo processing is busy. Try again."
        : "This photo could not be processed. Choose a valid photo up to 10 MB and 16 megapixels.",
    )
  }
}

export interface ProcessedCatalogPhoto {
  bytes: Uint8Array
  contentType: "image/webp"
  contentDigest: string
  sizeBytes: number
  width: number
  height: number
}

let active = 0

function decodeHeic(bytes: Uint8Array, signal: AbortSignal, workerUrl?: URL) {
  return new Promise<{ bytes: Uint8Array; width: number; height: number }>(
    (resolve, reject) => {
      if (signal.aborted)
        return reject(new CatalogPhotoProcessingError("INVALID_PHOTO"))
      const worker = new Worker(
        workerUrl ?? new URL("./photo-heic-worker.mjs", import.meta.url),
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
      const finish = (value?: {
        bytes: Uint8Array
        width: number
        height: number
      }) => {
        if (settled) return
        settled = true
        signal.removeEventListener("abort", abort)
        void worker.terminate().catch(() => {})
        if (value) resolve(value)
        else reject(new CatalogPhotoProcessingError("INVALID_PHOTO"))
      }
      const abort = () => finish()
      signal.addEventListener("abort", abort, { once: true })
      // Node 24/25 declaration merging differs across workspace consumers.
      // Worker inherits this runtime API; calling its prototype avoids casts.
      EventEmitter.prototype.once.call(worker, "error", () => finish())
      EventEmitter.prototype.once.call(worker, "exit", () => finish())
      EventEmitter.prototype.once.call(worker, "message", (value: unknown) => {
        if (
          !value ||
          typeof value !== "object" ||
          !("width" in value) ||
          !("height" in value) ||
          !("bytes" in value)
        ) {
          finish()
          return
        }
        const { width, height } = value
        if (
          typeof width !== "number" ||
          !Number.isInteger(width) ||
          typeof height !== "number" ||
          !Number.isInteger(height) ||
          width < 1 ||
          height < 1 ||
          width * height > CATALOG_PHOTO_MAX_PIXELS ||
          !(value.bytes instanceof Uint8Array) ||
          value.bytes.byteLength !== width * height * 4
        ) {
          finish()
          return
        }
        finish({ bytes: value.bytes, width, height })
      })
      worker.postMessage({ bytes, maxPixels: CATALOG_PHOTO_MAX_PIXELS })
    },
  )
}

function derivative(
  bytes: Buffer,
  width: number,
  height: number,
): ProcessedCatalogPhoto {
  if (bytes.byteLength > 2 * 1024 * 1024)
    throw new CatalogPhotoProcessingError("INVALID_PHOTO")
  return {
    bytes: new Uint8Array(bytes),
    contentType: "image/webp",
    contentDigest: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
    width,
    height,
  }
}

/** Decode and strip metadata. Processing is never a moderation approval. */
export async function processCatalogPhoto(input: {
  bytes: Uint8Array
  contentType: CatalogPhotoSourceType
  signal?: AbortSignal
  heicWorkerUrl?: URL
}): Promise<{
  display: ProcessedCatalogPhoto
  thumbnail: ProcessedCatalogPhoto
}> {
  if (active >= 4)
    throw new CatalogPhotoProcessingError("PHOTO_PROCESSING_BUSY")
  const bytes = new Uint8Array(input.bytes)
  const contentType = input.contentType
  if (
    !bytes.byteLength ||
    bytes.byteLength > 10 * 1024 * 1024 ||
    !CATALOG_PHOTO_SOURCE_TYPES.some((type) => type === contentType)
  ) {
    throw new CatalogPhotoProcessingError("INVALID_PHOTO")
  }
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(15_000)])
    : AbortSignal.timeout(15_000)
  if (signal.aborted) throw new CatalogPhotoProcessingError("INVALID_PHOTO")
  active++
  const pipelines: Sharp[] = []
  const abort = () => {
    for (const pipeline of pipelines) pipeline.destroy()
  }
  signal.addEventListener("abort", abort, { once: true })
  try {
    let source: Sharp
    if (contentType === "image/heic" || contentType === "image/heif") {
      if (
        Buffer.from(bytes.subarray(4, 8)).toString() !== "ftyp" ||
        !/^(heic|heix|hevc|hevx|mif1|msf1|heif)$/.test(
          Buffer.from(bytes.subarray(8, 12)).toString(),
        )
      ) {
        throw new CatalogPhotoProcessingError("INVALID_PHOTO")
      }
      const decoded = await decodeHeic(bytes, signal, input.heicWorkerUrl)
      source = sharp(decoded.bytes, {
        raw: { width: decoded.width, height: decoded.height, channels: 4 },
      })
    } else {
      source = sharp(bytes, {
        failOn: "warning",
        limitInputPixels: CATALOG_PHOTO_MAX_PIXELS,
      })
      pipelines.push(source)
      const metadata = await source.metadata()
      if (
        metadata.format !== contentType.slice(6) ||
        (metadata.pages ?? 1) !== 1 ||
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > CATALOG_PHOTO_MAX_PIXELS
      ) {
        throw new CatalogPhotoProcessingError("INVALID_PHOTO")
      }
    }
    pipelines.push(source)
    const displayPipeline = source
      .autoOrient()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 3 })
      .timeout({ seconds: 5 })
    const display = await displayPipeline.toBuffer({ resolveWithObject: true })
    if (signal.aborted) throw new CatalogPhotoProcessingError("INVALID_PHOTO")
    const thumbnailPipeline = sharp(display.data)
      .resize({
        width: 320,
        height: 320,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 76, effort: 2 })
      .timeout({ seconds: 5 })
    pipelines.push(thumbnailPipeline)
    const thumbnail = await thumbnailPipeline.toBuffer({
      resolveWithObject: true,
    })
    if (signal.aborted) throw new CatalogPhotoProcessingError("INVALID_PHOTO")
    return {
      display: derivative(
        display.data,
        display.info.width,
        display.info.height,
      ),
      thumbnail: derivative(
        thumbnail.data,
        thumbnail.info.width,
        thumbnail.info.height,
      ),
    }
  } catch (error) {
    if (error instanceof CatalogPhotoProcessingError) throw error
    throw new CatalogPhotoProcessingError("INVALID_PHOTO")
  } finally {
    signal.removeEventListener("abort", abort)
    for (const pipeline of pipelines) pipeline.destroy()
    active--
  }
}
