import type { PrismaClient } from "../../generated/prisma/client"

const MAX_CODE_LENGTH = 120
// A scanned QR link is data only: never followed, fetched or matched as a code.
const LINK = /^(?:[a-z][a-z0-9+.-]*:|www\.)/i

export type CatalogCodeMatch = {
  catalogItemId: string
  offeringId: string
  itemName: string
  offeringName: string
  variantName: string
  unitName: string
  matchedBy: "barcode" | "sku"
}

export type CatalogCodeLookup =
  | { status: "found"; code: string; match: CatalogCodeMatch }
  | { status: "ambiguous"; code: string; matches: CatalogCodeMatch[] }
  | { status: "unknown"; code: string }
  | { status: "link"; code: string }
  | { status: "invalid" }

/** Keeps the code exactly as scanned (leading zeros, case) apart from outer spaces. */
export function normalizeCatalogCode(value: string) {
  const code = value.trim()
  const control = [...code].some((character) => {
    const point = character.charCodeAt(0)
    return point < 32 || point === 127
  })
  return code && code.length <= MAX_CODE_LENGTH && !control ? code : null
}

/**
 * Exact, Business-scoped barcode/SKU lookup to sellable Product offerings.
 * Identification only: it never creates an Order line or follows a link.
 */
export async function findCatalogOfferingsByCode(
  db: PrismaClient,
  input: { tenantId: string; code: string },
): Promise<CatalogCodeLookup> {
  const code = normalizeCatalogCode(input.code)
  if (!code) return { status: "invalid" }
  if (LINK.test(code)) return { status: "link", code }
  const rows = await db.productUnitOffering.findMany({
    where: {
      tenantId: input.tenantId,
      OR: [{ barcode: code }, { sku: code }],
      offering: {
        status: "ACTIVE",
        archivedAt: null,
        catalogItem: { status: "ACTIVE", systemRole: null },
      },
    },
    select: {
      barcode: true,
      inventoryUnit: { select: { name: true } },
      offering: {
        select: {
          id: true,
          name: true,
          variant: { select: { name: true } },
          catalogItem: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { offeringId: "asc" },
    take: 10,
  })
  const matches = rows.map(
    (row): CatalogCodeMatch => ({
      catalogItemId: row.offering.catalogItem.id,
      offeringId: row.offering.id,
      itemName: row.offering.catalogItem.name,
      offeringName: row.offering.name,
      variantName: row.offering.variant.name,
      unitName: row.inventoryUnit.name,
      matchedBy: row.barcode === code ? "barcode" : "sku",
    }),
  )
  const [match] = matches
  if (!match) return { status: "unknown", code }
  if (matches.length === 1) return { status: "found", code, match }
  return { status: "ambiguous", code, matches }
}
