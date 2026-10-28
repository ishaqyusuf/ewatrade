import { CatalogPhotoStorageError } from "./photo-contracts"

/** The existing private-media local store; never a live Blob identity. */
export const CATALOG_QA_STORE_ID = "store_localtest"
export const CATALOG_QA_REVIEW_PROVIDER = "local_qa_fixture"
export const CATALOG_QA_REVIEW_POLICY = "registered-fixtures-v1"

export function isLocalCatalogPhotoQaEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return (
    environment.APP_ENV === "local" &&
    environment.DEV_PROFILE === "local" &&
    environment.NODE_ENV !== "production"
  )
}

/** DB classification chooses the adapter. A browser cannot select a provider. */
export function catalogPhotoStorageIdentity(
  classification: "LIVE" | "QA",
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (classification === "QA") {
    if (!isLocalCatalogPhotoQaEnabled(environment))
      throw new CatalogPhotoStorageError(
        "PHOTO_STORAGE_UNAVAILABLE",
        "QA Catalog photos require the local test runtime.",
      )
    return {
      provider: "local_test" as const,
      storeId: CATALOG_QA_STORE_ID,
      mode: "test" as const,
    }
  }
  return {
    provider: "vercel_blob_private" as const,
    storeId: environment.BLOB_STORE_ID?.trim() || "",
    mode: "live" as const,
  }
}

/** Listing and anonymous delivery share the same provider/provenance fence. */
export function catalogPublicPhotoProviderFilter(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return {
    OR: [
      {
        tenant: { dataClassification: "LIVE" as const },
        storageProvider: "vercel_blob_private",
        storageStoreId: environment.BLOB_STORE_ID?.trim() || "unconfigured",
        reviewProvider: { not: CATALOG_QA_REVIEW_PROVIDER },
      },
      ...(isLocalCatalogPhotoQaEnabled(environment)
        ? [
            {
              tenant: { dataClassification: "QA" as const },
              storageProvider: "local_test",
              storageStoreId: CATALOG_QA_STORE_ID,
              reviewProvider: CATALOG_QA_REVIEW_PROVIDER,
              reviewPolicyVersion: CATALOG_QA_REVIEW_POLICY,
            },
          ]
        : []),
    ],
  }
}
