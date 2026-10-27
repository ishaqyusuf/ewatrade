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
 * the public name or description; SQL patterns are never customer input.
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
export function publicPriceSortedIdsSql(input: {
  tenantId: string
  storeId: string
  currencyCode: string
  category: string | null
  terms: string[]
  availability: PublicListingAvailability | undefined
  outVariantIds: string[]
  direction: "asc" | "desc"
  after: { p: number | null; id: string } | null
  take: number
}) {
  const filters: Prisma.Sql[] = []
  if (input.category)
    filters.push(Prisma.sql`AND i."categoryId" = ${input.category}`)
  for (const term of input.terms)
    filters.push(
      Prisma.sql`AND (i.name ILIKE ${`%${escapePublicListingTerm(term)}%`} OR i.description ILIKE ${`%${escapePublicListingTerm(term)}%`})`,
    )
  const out = Prisma.sql`(i.kind = 'PRODUCT' AND bool_and(o."variantId" = ANY(${input.outVariantIds}::text[])))`
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
      FROM "CatalogItem" i
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
        ${filters.length ? Prisma.join(filters, " ") : Prisma.empty}
      GROUP BY i.id
      ${having}
    )
    SELECT id, price FROM eligible
    ${keyset}
    ORDER BY price IS NULL, price ${Prisma.raw(input.direction === "asc" ? "ASC" : "DESC")}, id COLLATE "C"
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
) {
  const terms = listing.terms.map((term) => term.toLowerCase())
  const filtered = items.filter(
    (item) =>
      terms.every(
        (term) =>
          item.name.toLowerCase().includes(term) ||
          (item.description ?? "").toLowerCase().includes(term),
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
