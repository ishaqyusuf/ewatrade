import { z } from "zod"
import { readRecordOriginSchema } from "./read-record-target"

/** A form prefill, never a proposal or permission to create an item. */
export const catalogCreateHandoffSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    kind: z.enum(["product", "service"]),
    origin: readRecordOriginSchema,
  })
  .strict()
export type CatalogCreateHandoff = z.infer<typeof catalogCreateHandoffSchema>

/** Only an empty first page across all statuses establishes a missing search. */
export function missingCatalogItemAnswer(
  input: {
    query?: string
    kind?: "product" | "service"
    status?: string
    cursor?: string
  },
  page: { items: readonly unknown[]; nextCursor?: string | null },
  origin: CatalogCreateHandoff["origin"],
  businessName: string,
) {
  if (
    !input.query?.trim() ||
    !input.kind ||
    input.status ||
    input.cursor ||
    page.items.length ||
    page.nextCursor
  )
    return null
  const catalogCreate = catalogCreateHandoffSchema.parse({
    name: input.query,
    kind: input.kind,
    origin,
  })
  return {
    id: `catalog_missing_${crypto.randomUUID()}`,
    title:
      input.kind === "service" ? "Service not listed" : "Product not listed",
    value: catalogCreate.name,
    scope: businessName,
    asOf: new Date().toISOString(),
    detail:
      "No catalog matches for this name, including saved choices and archived items. Open the form to review and add it; nothing has been created.",
    catalogCreate,
  }
}

export function catalogCreateScopeMatches(
  handoff: CatalogCreateHandoff,
  current: CatalogCreateHandoff["origin"],
) {
  return (
    handoff.origin.tenantId === current.tenantId &&
    handoff.origin.storeId === current.storeId
  )
}
