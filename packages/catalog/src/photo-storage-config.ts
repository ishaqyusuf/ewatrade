// Compatibility names preserve existing callers; credentials remain server-only.
export {
  privateBlobConfiguration as catalogBlobConfiguration,
  isPrivateBlobUrl as isCatalogBlobUrl,
} from "@ewatrade/private-media/vercel-blob"
