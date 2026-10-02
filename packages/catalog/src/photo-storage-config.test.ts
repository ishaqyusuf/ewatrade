import { expect, test } from "bun:test"
import {
  catalogBlobConfiguration,
  isCatalogBlobUrl,
} from "./photo-storage-config"

test("private Catalog storage needs a pinned identity matching its credential", () => {
  expect(catalogBlobConfiguration({})).toBeNull()
  expect(
    catalogBlobConfiguration({
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_owned_test",
    }),
  ).toBeNull()
  expect(
    catalogBlobConfiguration({
      BLOB_STORE_ID: "store_owned",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_foreign_test",
    }),
  ).toBeNull()
  expect(
    catalogBlobConfiguration({
      BLOB_STORE_ID: "store_owned",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_owned_test",
    }),
  ).toEqual({ storeId: "store_owned", token: "vercel_blob_rw_owned_test" })
  expect(
    catalogBlobConfiguration({
      BLOB_STORE_ID: "store_owned",
      VERCEL_OIDC_TOKEN: "test-oidc",
    }),
  ).toEqual({ storeId: "store_owned", oidcToken: "test-oidc" })
  expect(
    catalogBlobConfiguration({
      BLOB_STORE_ID: "store_owned",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_foreign_test",
      VERCEL_OIDC_TOKEN: "test-oidc",
    }),
  ).toBeNull()
})

test("provider results must belong to the pinned private host", () => {
  expect(
    isCatalogBlobUrl(
      "https://owned.private.blob.vercel-storage.com/photo",
      "store_owned",
    ),
  ).toBe(true)
  for (const url of [
    "https://foreign.private.blob.vercel-storage.com/photo",
    "https://owned.public.blob.vercel-storage.com/photo",
    "http://owned.private.blob.vercel-storage.com/photo",
    "https://owned.private.blob.vercel-storage.com.example.invalid/photo",
    "https://user:pass@owned.private.blob.vercel-storage.com/photo",
  ])
    expect(isCatalogBlobUrl(url, "store_owned")).toBe(false)
})
