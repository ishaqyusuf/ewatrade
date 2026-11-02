import { createHash } from "node:crypto"
import { Prisma } from "../../generated/prisma/client"

export type PublicListingSort =
  | "name_asc"
  | "name_desc"
  | "price_asc"
  | "price_desc"
export type PublicListingAvailability = "available" | "out_of_stock"

/** Structurally matches the shared CatalogQuery; every field is optional. */
export type PublicStorefrontQuery = {
  category?: string
  /** Applies only with its root `category`; a mismatched pair lists nothing. */
  subcategory?: string
  item?: string
  q?: string
  availability?: PublicListingAvailability
  sort?: PublicListingSort
}

const SORTS = new Set<string>([
  "name_asc",
  "name_desc",
  "price_asc",
  "price_desc",
])
const MAX_QUERY_LENGTH = 120
const MAX_CURSOR_PAYLOAD = 1536
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)

export type PublicListing = ReturnType<typeof normalizePublicListing>

/**
 * The bounded query is whitespace-separated literal terms. Every term matches
 * the public name, description or saved category path; SQL patterns are never customer input.
 */
export function normalizePublicListing(query: PublicStorefrontQuery) {
  const trimmed = typeof query.q === "string" ? query.q.trim() : ""
  const q = trimmed && trimmed.length <= MAX_QUERY_LENGTH ? trimmed : undefined
  const terms = [...new Set(q?.split(/\s+/).filter(Boolean) ?? [])]
  const availability =
    query.availability === "available" || query.availability === "out_of_stock"
      ? query.availability
      : undefined
  const sort =
    typeof query.sort === "string" && SORTS.has(query.sort)
      ? (query.sort as PublicListingSort)
      : undefined
  return {
    q,
    terms,
    availability,
    sort,
    advanced: Boolean(q || availability || sort),
    /** Echoed for shared UI controls; only accepted values. */
    query: {
      ...(q ? { q } : {}),
      ...(availability ? { availability } : {}),
      ...(sort ? { sort } : {}),
    },
  }
}

export function publicListingSearchWhere(terms: string[]) {
  return terms.map((term) => ({
    OR: [
      {
        category: {
          contains: escapePublicListingTerm(term),
          mode: "insensitive" as const,
        },
      },
      {
        name: {
          contains: escapePublicListingTerm(term),
          mode: "insensitive" as const,
        },
      },
      {
        description: {
          contains: escapePublicListingTerm(term),
          mode: "insensitive" as const,
        },
      },
    ],
  })) satisfies Prisma.CatalogItemWhereInput[]
}

function escapePublicListingTerm(term: string) {
  return term.replace(/[\\%_]/g, "\\$&")
}

export type PublicListingCursor =
  | { m: "d"; b: "a" | "o"; id: string }
  | { m: "n"; id: string }
  | { m: "p"; p: number | null; id: string }

/** Binds an advanced cursor to its exact Store, category and listing state. */
export function publicListingBinding(input: {
  storeId: string
  category: string | null
  subcategory?: string | null
  listing: PublicListing
}) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.storeId,
        input.category ?? "",
        input.listing.q ?? "",
        input.listing.availability ?? "",
        input.listing.sort ?? "",
        // Appended only when set, so cursors issued before subcategories stay valid.
        ...(input.subcategory ? [input.subcategory] : []),
      ]),
    )
    .digest("base64url")
    .slice(0, 22)
}

const cursorMode = (sort: PublicListingSort | undefined) =>
  !sort ? "d" : sort.startsWith("name") ? "n" : "p"

export function encodePublicListingCursor(
  binding: string,
  cursor: PublicListingCursor,
) {
  const encoded = Buffer.from(
    JSON.stringify({ v: 1, h: binding, ...cursor }),
  ).toString("base64url")
  return encoded.length <= MAX_CURSOR_PAYLOAD ? `s:${encoded}` : null
}

/** Null for malformed, oversized, wrong-mode or stale (differently bound) cursors. */
export function decodePublicListingCursor(
  after: string,
  binding: string,
  sort: PublicListingSort | undefined,
): PublicListingCursor | null {
  const match = /^s:([A-Za-z0-9_-]{1,1536})$/.exec(after)
  if (!match?.[1]) return null
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!value || typeof value !== "object") return null
  const cursor = value as Record<string, unknown>
  if (cursor.v !== 1 || cursor.h !== binding || !validId(cursor.id)) return null
  if (cursor.m !== cursorMode(sort)) return null
  if (cursor.m === "d")
    return cursor.b === "a" || cursor.b === "o"
      ? { m: "d", b: cursor.b, id: cursor.id }
      : null
  if (cursor.m === "n") return { m: "n", id: cursor.id }
  const price = cursor.p
  return price === null ||
    (typeof price === "number" && Number.isSafeInteger(price) && price >= 0)
    ? { m: "p", p: price, id: cursor.id }
    : null
}

/**
 * One keyset page of eligible item ids by comparable minimum price. Mirrors the
 * Prisma public predicate (tenant, ACTIVE/unarchived item, systemRole, sale
 * usage, ACTIVE/unarchived offering + variant, Store availability) and
 * publicOptionPrice: any quoted, unpriced or non-Store-currency eligible option
 * makes the item incomparable, sorted last in both directions; ties by id.
 * Callers must re-read the ids through the exact Prisma predicate.
 */
type PublicListingSqlScope = {
  tenantId: string
  storeId: string
  category: string | null
  subcategory?: string | null
  terms: string[]
}

/** Public items joined to their public offerings; mirrors `publicCatalogItemWhere`. */
function publicEligibleItemsFromSql(input: PublicListingSqlScope) {
  const filters: Prisma.Sql[] = []
  if (input.category)
    filters.push(Prisma.sql`AND i."categoryId" = ${input.category}`)
  if (input.subcategory)
    filters.push(Prisma.sql`AND i."subcategoryId" = ${input.subcategory}`)
  for (const term of input.terms)
    filters.push(
      Prisma.sql`AND (i.name ILIKE ${`%${escapePublicListingTerm(term)}%`} OR i.description ILIKE ${`%${escapePublicListingTerm(term)}%`} OR i.category ILIKE ${`%${escapePublicListingTerm(term)}%`})`,
    )
  return Prisma.sql`FROM "CatalogItem" i
      JOIN "SellableOffering" o ON o."catalogItemId" = i.id
        AND o."tenantId" = ${input.tenantId}
        AND o.status = 'ACTIVE' AND o."archivedAt" IS NULL
      JOIN "SellableVariant" v ON v.id = o."variantId"
        AND v.status = 'ACTIVE' AND v."archivedAt" IS NULL
      WHERE i."tenantId" = ${input.tenantId}
        AND i.status = 'ACTIVE' AND i."archivedAt" IS NULL
        AND i."systemRole" IS NULL
        AND (i.kind = 'SERVICE' OR (i.kind = 'PRODUCT' AND EXISTS (
          SELECT 1 FROM "CatalogProduct" p
          WHERE p."catalogItemId" = i.id AND p.usage IN ('FOR_SALE', 'BOTH'))))
        AND EXISTS (SELECT 1 FROM "StoreOfferingAvailability" a
          WHERE a."offeringId" = o.id AND a."storeId" = ${input.storeId}
            AND a."isAvailable" = true)
        ${filters.length ? Prisma.join(filters, " ") : Prisma.empty}`
}

/** Sold out: manually unavailable, or a product whose every public option is sold out. */
function publicSoldOutSql(
  input: Pick<PublicListingSqlScope, "tenantId" | "storeId">,
  soldOutVariant: Prisma.Sql,
) {
  return Prisma.sql`(EXISTS (SELECT 1 FROM "CatalogStorefrontPolicy" policy
    WHERE policy."tenantId"=${input.tenantId} AND policy."storeId"=${input.storeId}
      AND policy."catalogItemId"=i.id AND policy.unavailable=true)
    OR (i.kind = 'PRODUCT' AND bool_and(${soldOutVariant})))`
}

export function publicPriceSortedIdsSql(
  input: PublicListingSqlScope & {
    currencyCode: string
    availability: PublicListingAvailability | undefined
    outVariantIds: string[]
    direction: "asc" | "desc"
    after: { p: number | null; id: string } | null
    take: number
  },
) {
  const out = publicSoldOutSql(
    input,
    Prisma.sql`o."variantId" = ANY(${input.outVariantIds}::text[])`,
  )
  const having =
    input.availability === "out_of_stock"
      ? Prisma.sql`HAVING ${out}`
      : input.availability === "available"
        ? Prisma.sql`HAVING NOT ${out}`
        : Prisma.empty
  const beyond = input.direction === "asc" ? Prisma.raw(">") : Prisma.raw("<")
  const keyset = !input.after
    ? Prisma.empty
    : input.after.p === null
      ? Prisma.sql`WHERE price IS NULL AND id COLLATE "C" > ${input.after.id}`
      : Prisma.sql`WHERE price IS NULL OR price ${beyond} ${input.after.p}
          OR (price = ${input.after.p} AND id COLLATE "C" > ${input.after.id})`
  return Prisma.sql`
    WITH eligible AS (
      SELECT i.id,
        CASE WHEN bool_and(o."pricingPolicy" = 'FIXED'
            AND o."fixedPriceMinor" IS NOT NULL
            AND o."currencyCode" = ${input.currencyCode})
          THEN min(o."fixedPriceMinor") END AS price
      ${publicEligibleItemsFromSql(input)}
      GROUP BY i.id
      ${having}
    )
    SELECT id, price FROM eligible
    ${keyset}
    ORDER BY price IS NULL, price ${Prisma.raw(input.direction === "asc" ? "ASC" : "DESC")}, id COLLATE "C"
    LIMIT ${input.take}
  `
}

/**
 * Default bucket order in one round trip: in-stock entries, then sold-out, each by
 * creation then ID. Store stock is aggregated here as `publicStockAvailability`
 * does (per selling unit, exact numerics; no balance rows is not sold out), so no
 * separate stock read gates the page. A cursor continues after its own current
 * position; one outside this listing yields no rows. The caller re-reads the IDs
 * through the exact Prisma predicate.
 */
export function publicBucketOrderedIdsSql(
  input: PublicListingSqlScope & {
    only?: "a" | "o"
    after: string | null
    take: number
  },
) {
  const soldOut = publicSoldOutSql(
    input,
    Prisma.sql`o."variantId" IN (SELECT "variantId" FROM sold_out_variant)`,
  )
  const conditions: Prisma.Sql[] = []
  if (input.only) conditions.push(Prisma.sql`e.out = ${input.only === "o"}`)
  if (input.after)
    conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM eligible c
      WHERE c.id = ${input.after} AND (e.out > c.out OR (e.out = c.out
        AND (e."createdAt", e.id) > (c."createdAt", c.id))))`)
  return Prisma.sql`
    WITH unit_free AS (
      SELECT b."variantId",
        COALESCE(sum(b."onHandQuantity"), 0) - COALESCE(sum(b."reservedQuantity"), 0) AS free
      FROM "StockBalanceSource" b
      WHERE b."tenantId" = ${input.tenantId} AND b."storeId" = ${input.storeId}
        AND b."custodyType" = 'STORE'
      GROUP BY b."variantId", b."inventoryUnitId"
    ), sold_out_variant AS (
      SELECT "variantId" FROM unit_free GROUP BY "variantId" HAVING bool_and(free <= 0)
    ), eligible AS (
      SELECT i.id, i."createdAt", ${soldOut} AS out
      ${publicEligibleItemsFromSql(input)}
      GROUP BY i.id
    )
    SELECT e.id, e.out FROM eligible e
    ${conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty}
    ORDER BY e.out, e."createdAt", e.id
    LIMIT ${input.take}
  `
}

type ListedItem = {
  id: string
  name: string
  description: string | null
  priceMinor: number | null
  currencyCode: string
  availability: string | null
}

/** Store-currency minimum or null when no comparable price can be claimed. */
export const comparablePrice = (item: ListedItem, currencyCode: string) =>
  item.priceMinor !== null && item.currencyCode === currencyCode
    ? item.priceMinor
    : null

const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/**
 * Included plans only: filters and sorts the already capped first-N entries in
 * memory, so search can never reach an entry beyond the plan's public cap.
 */
export function applyCappedListing<T extends ListedItem>(
  items: T[],
  listing: PublicListing,
  currencyCode: string,
  categoryLabel: (item: T) => string | null | undefined = () => null,
) {
  const terms = listing.terms.map((term) => term.toLowerCase())
  const filtered = items.filter(
    (item) =>
      terms.every(
        (term) =>
          item.name.toLowerCase().includes(term) ||
          (item.description ?? "").toLowerCase().includes(term) ||
          (categoryLabel(item) ?? "").toLowerCase().includes(term),
      ) &&
      (listing.availability === undefined ||
        (item.availability === "OUT_OF_STOCK") ===
          (listing.availability === "out_of_stock")),
  )
  const { sort } = listing
  if (!sort)
    return filtered.sort(
      (a, b) =>
        Number(a.availability === "OUT_OF_STOCK") -
        Number(b.availability === "OUT_OF_STOCK"),
    )
  const direction = sort.endsWith("_asc") ? 1 : -1
  return filtered.sort((a, b) => {
    if (sort.startsWith("name"))
      return (
        direction * (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
        byId(a, b)
      )
    const left = comparablePrice(a, currencyCode)
    const right = comparablePrice(b, currencyCode)
    if (left === null || right === null)
      return Number(left === null) - Number(right === null) || byId(a, b)
    return direction * (left - right) || byId(a, b)
  })
}
