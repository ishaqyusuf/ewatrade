import { del, get, put } from "@vercel/blob"
import {
  type PrivateObjectPort,
  PrivateObjectStorageError,
  assertPrivateObjectServer,
} from "./object-storage"

export type PrivateBlobEnvironment = {
  BLOB_STORE_ID?: string
  BLOB_READ_WRITE_TOKEN?: string
  VERCEL_OIDC_TOKEN?: string
}

/** Server configuration only; never expose the credential-bearing result. */
export function privateBlobConfiguration(env: PrivateBlobEnvironment) {
  assertPrivateObjectServer()
  const storeId = env.BLOB_STORE_ID?.trim()
  if (!storeId || !/^store_[a-zA-Z0-9]+$/.test(storeId)) return null
  const token = env.BLOB_READ_WRITE_TOKEN?.trim()
  if (token) {
    const parts = token.split("_")
    if (
      parts[0] !== "vercel" ||
      parts[1] !== "blob" ||
      parts[2] !== "rw" ||
      parts[3] !== storeId.slice("store_".length) ||
      !parts[4]
    )
      return null
    return { storeId, token }
  }
  const oidcToken = env.VERCEL_OIDC_TOKEN?.trim()
  return oidcToken ? { storeId, oidcToken } : null
}

export function isPrivateBlobUrl(url: string, storeId: string) {
  assertPrivateObjectServer()
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      parsed.hostname ===
        `${storeId.slice("store_".length).toLowerCase()}.private.blob.vercel-storage.com`
    )
  } catch {
    return false
  }
}

function safeFailure(error: unknown): never {
  throw new PrivateObjectStorageError(
    error instanceof PrivateObjectStorageError
      ? error.code
      : "STORAGE_UNAVAILABLE",
  )
}

/** Credentials stay inside this port; no provider URL is returned to consumers. */
export function createVercelPrivateObjectPort<ContentType extends string>(
  env: PrivateBlobEnvironment = {
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
  },
): {
  port: PrivateObjectPort<ContentType>
  configured: () => boolean
  storeId: string | null
} {
  assertPrivateObjectServer()
  const configuration = privateBlobConfiguration(env)
  function ready() {
    assertPrivateObjectServer()
    if (!configuration)
      throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
    return configuration
  }
  const port: PrivateObjectPort<ContentType> = {
    async delete(path, options) {
      try {
        await del(path, { ...options, ...ready() })
      } catch (error) {
        safeFailure(error)
      }
    },
    async put(path, bytes, options) {
      try {
        const config = ready()
        const result = await put(path, Buffer.from(bytes), {
          ...options,
          ...config,
        })
        if (
          result.pathname !== path ||
          result.contentType !== options.contentType ||
          !isPrivateBlobUrl(result.url, config.storeId)
        )
          throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
      } catch (error) {
        safeFailure(error)
      }
    },
    async get(path, options) {
      try {
        const config = ready()
        const result = await get(path, { ...options, ...config })
        if (!result || result.statusCode !== 200 || !result.stream) return null
        if (
          result.blob.pathname !== path ||
          !isPrivateBlobUrl(result.blob.url, config.storeId)
        ) {
          void result.stream.cancel().catch(() => undefined)
          throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
        }
        return {
          stream: result.stream,
          contentType: result.blob.contentType,
          sizeBytes: result.blob.size,
        }
      } catch (error) {
        safeFailure(error)
      }
    },
  }
  return {
    port,
    configured: () => Boolean(configuration),
    storeId: configuration?.storeId ?? null,
  }
}
