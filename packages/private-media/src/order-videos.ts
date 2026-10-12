import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname, resolve, sep } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { assertQaProviderAllowed } from "@ewatrade/utils/qa-provider-policy"
import { get, head } from "@vercel/blob"
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client"
import {
  LOCAL_TEST_OBJECT_STORE_ID,
  localTestObjectRoot,
} from "./local-test-object-port"
import {
  PrivateObjectStorageError,
  assertPrivateObjectServer,
} from "./object-storage"
import {
  ORDER_VIDEO_MAX_BYTES,
  type OrderAttachmentTarget,
  orderAttachmentKind,
  orderAttachmentStoragePath,
} from "./order-attachments"
import { privateBlobConfiguration } from "./vercel-blob"

type Environment = Readonly<Record<string, string | undefined>>

/** A byte range from a Range header, already checked against the size. */
export type VideoRange = { start: number; end: number }

/** Parses "bytes=a-b", "bytes=a-" or "bytes=-n"; null means the whole file. */
export function parseVideoRange(
  header: string | null,
  sizeBytes: number,
): VideoRange | null | "unsatisfiable" {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) return null
  let start: number
  let end: number
  if (!match[1]) {
    const suffix = Number(match[2])
    if (suffix < 1) return "unsatisfiable"
    start = Math.max(0, sizeBytes - suffix)
    end = sizeBytes - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Math.min(Number(match[2]), sizeBytes - 1) : sizeBytes - 1
  }
  if (start >= sizeBytes || start > end) return "unsatisfiable"
  return { start, end }
}

export type OrderVideoBody = {
  status: 200 | 206
  body: ReadableStream<Uint8Array>
  contentLength: number
  contentRange: string | null
}

function videoTarget(target: OrderAttachmentTarget) {
  if (
    orderAttachmentKind(target.contentType) !== "VIDEO" ||
    !Number.isSafeInteger(target.sizeBytes) ||
    target.sizeBytes < 1 ||
    target.sizeBytes > ORDER_VIDEO_MAX_BYTES
  )
    throw new PrivateObjectStorageError("INVALID_OBJECT")
  return orderAttachmentStoragePath(target)
}

/**
 * Videos on Order activity. They are too large to pass through the API on
 * live data (Vercel caps request bodies), so the device uploads straight to
 * private Blob storage with a short-lived token bound to one path, type and
 * size, and the server confirms the stored object afterwards. QA data streams
 * through the API into the local test store, checking size and SHA-256.
 * Playback streams with Range support so phones can seek.
 */
export function createOrderVideoStorage(
  dataClassification: "LIVE" | "QA",
  environment: Environment = process.env,
) {
  assertPrivateObjectServer()
  assertQaProviderAllowed({
    adapter: dataClassification === "QA" ? "test" : "live",
    operation: "media_analysis",
    tenantDataClassification: dataClassification,
  })
  return dataClassification === "QA"
    ? localVideoStorage(environment)
    : blobVideoStorage(environment)
}

function blobVideoStorage(environment: Environment) {
  const config = privateBlobConfiguration({
    BLOB_STORE_ID: environment.BLOB_STORE_ID,
    BLOB_READ_WRITE_TOKEN: environment.BLOB_READ_WRITE_TOKEN,
    VERCEL_OIDC_TOKEN: environment.VERCEL_OIDC_TOKEN,
  })
  function ready() {
    if (!config) throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
    return config
  }
  return {
    mode: "direct" as const,
    provider: "vercel_blob_private" as const,
    storeId: config?.storeId ?? null,
    /** Lets one device write exactly this object, once, while the upload is open. */
    async uploadToken(target: OrderAttachmentTarget) {
      const pathname = videoTarget(target)
      const configured = ready()
      // Client tokens are minted from the read-write token; OIDC can't.
      if (!("token" in configured))
        throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
      const clientToken = await generateClientTokenFromReadWriteToken({
        token: configured.token,
        pathname,
        allowedContentTypes: [target.contentType],
        maximumSizeInBytes: target.sizeBytes,
        addRandomSuffix: false,
        allowOverwrite: false,
        // Matches the attachment's 30-minute upload window.
        validUntil: Date.now() + 30 * 60 * 1000,
      })
      return { pathname, clientToken }
    },
    /** The stored object must be the promised path, type and size. */
    async confirm(target: OrderAttachmentTarget) {
      const pathname = videoTarget(target)
      let stored: Awaited<ReturnType<typeof head>>
      try {
        stored = await head(pathname, ready())
      } catch {
        throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
      }
      if (
        stored.pathname !== pathname ||
        stored.size !== target.sizeBytes ||
        stored.contentType !== target.contentType
      )
        throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
      return { storagePath: pathname }
    },
    async open(
      target: OrderAttachmentTarget,
      range: VideoRange | null,
      abortSignal?: AbortSignal,
    ): Promise<OrderVideoBody> {
      const pathname = videoTarget(target)
      const result = await get(pathname, {
        ...ready(),
        access: "private",
        abortSignal,
        ...(range
          ? { headers: { range: `bytes=${range.start}-${range.end}` } }
          : {}),
      }).catch(() => {
        throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
      })
      if (!result?.stream)
        throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
      const contentRange = result.headers.get("content-range")
      const length = Number(result.headers.get("content-length"))
      return {
        status: contentRange ? 206 : 200,
        body: result.stream,
        contentLength: Number.isSafeInteger(length)
          ? length
          : contentRange && range
            ? range.end - range.start + 1
            : target.sizeBytes,
        contentRange,
      }
    },
  }
}

function localVideoStorage(environment: Environment) {
  const root = localTestObjectRoot(environment)
  const locate = (target: OrderAttachmentTarget) => {
    if (environment.APP_ENV === "production")
      throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
    const path = videoTarget(target)
    const file = resolve(root, path)
    if (!file.startsWith(`${root}${sep}`))
      throw new PrivateObjectStorageError("INVALID_OBJECT")
    return { path, file }
  }
  return {
    mode: "api" as const,
    provider: "local_test" as const,
    storeId: LOCAL_TEST_OBJECT_STORE_ID,
    /**
     * Streams the request body to disk; the length, SHA-256 and file
     * signature must match what the intent promised, or nothing is kept.
     */
    async write(
      target: OrderAttachmentTarget,
      body: ReadableStream<Uint8Array>,
      abortSignal?: AbortSignal,
    ) {
      const { path, file } = locate(target)
      await mkdir(dirname(file), { recursive: true })
      const partial = `${file}.partial`
      const hash = createHash("sha256")
      let received = 0
      // The first 12 bytes hold the "ftyp" box that marks MP4/QuickTime.
      let signature = new Uint8Array(0)
      try {
        await pipeline(
          Readable.fromWeb(body as never),
          async function* (source: AsyncIterable<Uint8Array>) {
            for await (const chunk of source) {
              received += chunk.byteLength
              if (received > target.sizeBytes)
                throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
              if (signature.byteLength < 12)
                signature = Uint8Array.from([...signature, ...chunk]).subarray(
                  0,
                  12,
                )
              hash.update(chunk)
              yield chunk
            }
          },
          createWriteStream(partial, { flags: "wx" }),
          { signal: abortSignal },
        )
        if (
          received !== target.sizeBytes ||
          hash.digest("hex") !== target.contentDigest ||
          String.fromCharCode(...signature.subarray(4, 8)) !== "ftyp"
        )
          throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
        await rename(partial, file)
        await writeFile(`${file}.type`, target.contentType)
      } catch (error) {
        await rm(partial, { force: true })
        throw error instanceof PrivateObjectStorageError
          ? error
          : new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
      }
      return { storagePath: path }
    },
    async open(
      target: OrderAttachmentTarget,
      range: VideoRange | null,
    ): Promise<OrderVideoBody> {
      const { file } = locate(target)
      const size = await stat(file).then(
        (info) => info.size,
        () => {
          throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
        },
      )
      const start = range?.start ?? 0
      const end = range?.end ?? size - 1
      return {
        status: range ? 206 : 200,
        body: Readable.toWeb(
          createReadStream(file, { start, end }),
        ) as unknown as ReadableStream<Uint8Array>,
        contentLength: end - start + 1,
        contentRange: range ? `bytes ${start}-${end}/${size}` : null,
      }
    },
  }
}
