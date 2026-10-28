import { createHash } from "node:crypto"
import {
  CATALOG_QA_REVIEW_POLICY,
  CATALOG_QA_REVIEW_PROVIDER,
  isLocalCatalogPhotoQaEnabled,
} from "./photo-qa-policy"
import type { CatalogPhotoReviewProvider } from "./photo-review"

/** Normalized digests of the two synthetic PNGs in catalog/fixtures. Unknown
 * images are rejected: this adapter is not a safety verdict for arbitrary media. */
const registeredDisplays = new Set([
  "e51ce6a364a4b2f857bec89a704ac774112903b0c84441742eea9228f5e79e0a",
  "a1ce2f7e04ea8ea882d2dafaec20dcc0b16c89573adcac716a3eb111a6d28c84",
])

export function createLocalQaCatalogPhotoReviewProvider(): CatalogPhotoReviewProvider {
  if (!isLocalCatalogPhotoQaEnabled())
    throw new Error("QA Catalog image review requires the local test runtime.")
  return {
    id: CATALOG_QA_REVIEW_PROVIDER,
    policyVersion: CATALOG_QA_REVIEW_POLICY,
    mode: "test",
    async inspect({ bytes, signal }) {
      signal.throwIfAborted()
      if (!isLocalCatalogPhotoQaEnabled())
        throw new Error("QA Catalog image review is unavailable.")
      return registeredDisplays.has(
        createHash("sha256").update(bytes).digest("hex"),
      )
        ? "APPROVED"
        : "REJECTED"
    },
  }
}
