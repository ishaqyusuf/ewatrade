import { createHash } from "node:crypto"
import { assertQaProviderAllowed } from "@ewatrade/utils/qa-provider-policy"
import type { CatalogPhotoScope, CatalogStoredPhoto } from "./photo-contracts"
import { processCatalogPhoto } from "./photo-processing"

/** The selected service implements this server port. No client verdict or
 * always-approve fallback exists. Storage and processing never grant approval. */
export type CatalogPhotoReviewProvider = {
  id: string
  policyVersion: string
  inspect(input: {
    bytes: Uint8Array
    contentType: "image/webp"
    signal: AbortSignal
  }): Promise<"APPROVED" | "REJECTED">
}

export async function reviewCatalogPhoto<T>(input: {
  scope: CatalogPhotoScope
  photo: CatalogStoredPhoto
  provider: CatalogPhotoReviewProvider
  read(signal: AbortSignal): Promise<Uint8Array>
  commit(verdict: {
    sourceDigest: string
    displayDigest: string
    provider: string
    policyVersion: string
    verdict: "APPROVED" | "REJECTED"
  }): Promise<T>
  signal?: AbortSignal
  heicWorkerUrl?: URL
}) {
  const scope = { ...input.scope }
  const photo = { ...input.photo }
  assertQaProviderAllowed({
    adapter: "live",
    operation: "media_analysis",
    tenantDataClassification: scope.dataClassification,
  })
  if (photo.tenantId !== scope.tenantId || photo.storeId !== scope.storeId)
    throw new Error("Photo review scope does not match.")
  const provider = input.provider
  const id = provider.id
  const policyVersion = provider.policyVersion
  if (
    !/^[a-zA-Z0-9_.-]{1,80}$/.test(id) ||
    !/^[a-zA-Z0-9_.-]{1,80}$/.test(policyVersion)
  )
    throw new Error("Photo review is not configured.")
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000)
  const bytes = await input.read(signal)
  signal.throwIfAborted()
  if (
    bytes.byteLength !== photo.sizeBytes ||
    createHash("sha256").update(bytes).digest("hex") !== photo.contentDigest
  )
    throw new Error("Photo review bytes could not be verified.")
  const { display } = await processCatalogPhoto({
    bytes,
    contentType: photo.contentType,
    signal,
    heicWorkerUrl: input.heicWorkerUrl,
  })
  let abort = () => {}
  try {
    const verdict = await Promise.race([
      provider.inspect({
        bytes: display.bytes.slice(),
        contentType: "image/webp",
        signal,
      }),
      new Promise<never>((_, reject) => {
        abort = () => reject(new Error("Photo review was interrupted."))
        if (signal.aborted) abort()
        else signal.addEventListener("abort", abort, { once: true })
      }),
    ])
    signal.throwIfAborted()
    if (verdict !== "APPROVED" && verdict !== "REJECTED")
      throw new Error("Photo review returned no valid decision.")
    return await input.commit({
      sourceDigest: photo.contentDigest,
      displayDigest: display.contentDigest,
      provider: id,
      policyVersion,
      verdict,
    })
  } finally {
    signal.removeEventListener("abort", abort)
  }
}
