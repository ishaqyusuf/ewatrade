import { createLocalTestPrivateObjectPort } from "./local-test-object-port"
import {
  type PrivateObjectPort,
  assertPrivateObjectServer,
  privateObjectOperationSignal,
} from "./object-storage"
import { createVercelPrivateObjectPort } from "./vercel-blob"

export type TenantErasureTarget = {
  storageProvider: string
  storageStoreId: string
  storagePath: string
  dataClassification: "LIVE" | "QA"
}

export type TenantErasureFailureCode =
  | "INVALID_OBJECT"
  | "PROVIDER_UNSUPPORTED"
  | "STORE_PIN_MISMATCH"
  | "STORAGE_UNAVAILABLE"
  | "STILL_PRESENT"

export type TenantErasureResult =
  | { ok: true }
  | { ok: false; code: TenantErasureFailureCode }

export type TenantErasurePort = {
  port: PrivateObjectPort<string>
  configured: () => boolean
  storeId: string | null
}

/** Returns the port for one recorded provider, or null when this process has none. */
export type TenantErasurePortResolver = (
  provider: string,
  dataClassification: "LIVE" | "QA",
) => TenantErasurePort | null

/** LIVE rows only reach private Blob; QA rows only reach the local test port. */
export function defaultTenantErasurePorts(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): TenantErasurePortResolver {
  return (provider, dataClassification) => {
    if (dataClassification === "LIVE" && provider === "vercel_blob_private")
      return createVercelPrivateObjectPort<string>({
        BLOB_STORE_ID: environment.BLOB_STORE_ID,
        BLOB_READ_WRITE_TOKEN: environment.BLOB_READ_WRITE_TOKEN,
        VERCEL_OIDC_TOKEN: environment.VERCEL_OIDC_TOKEN,
      })
    if (dataClassification === "QA" && provider === "local_test")
      return createLocalTestPrivateObjectPort<string>({ environment })
    return null
  }
}

function safePath(path: string) {
  const segments = path.split("/")
  return (
    path.length <= 1_024 &&
    /^[a-zA-Z0-9_./-]+$/.test(path) &&
    !segments.some((part) => !part || part === "." || part === "..")
  )
}

/**
 * Deletes one exact recorded object and then requires an actual not-found
 * read. The recorded store pin must match the configured store; a credential
 * change never redirects a delete. Provider error text is never returned.
 */
export function createTenantObjectEraser(resolve: TenantErasurePortResolver) {
  assertPrivateObjectServer()
  return async function erase(
    target: TenantErasureTarget,
  ): Promise<TenantErasureResult> {
    if (!safePath(target.storagePath))
      return { ok: false, code: "INVALID_OBJECT" }
    const resolved = resolve(target.storageProvider, target.dataClassification)
    if (!resolved?.port.delete)
      return { ok: false, code: "PROVIDER_UNSUPPORTED" }
    if (!resolved.configured())
      return { ok: false, code: "STORAGE_UNAVAILABLE" }
    if (resolved.storeId !== target.storageStoreId)
      return { ok: false, code: "STORE_PIN_MISMATCH" }
    try {
      await resolved.port.delete(target.storagePath, {
        abortSignal: privateObjectOperationSignal(),
      })
      const remaining = await resolved.port.get(target.storagePath, {
        access: "private",
        useCache: false,
        abortSignal: privateObjectOperationSignal(),
      })
      if (!remaining) return { ok: true }
      void remaining.stream.cancel().catch(() => undefined)
      return { ok: false, code: "STILL_PRESENT" }
    } catch {
      return { ok: false, code: "STORAGE_UNAVAILABLE" }
    }
  }
}
