import {
  CatalogError,
  CustomerChannelsError,
  ServiceCommercePolicyError,
} from "@ewatrade/db/queries"

/** Token pages hide expected availability refusals, but surface system failures. */
export function isPublicServiceUnavailable(error: unknown): boolean {
  return (
    error instanceof CatalogError ||
    error instanceof ServiceCommercePolicyError ||
    error instanceof CustomerChannelsError
  )
}
