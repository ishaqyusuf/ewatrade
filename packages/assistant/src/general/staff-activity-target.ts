import { z } from "zod"

/** Mirrors the canonical staff activity streams (`staffActivityStreams`). */
export const staffActivityTargetStreams = [
  "ORDER",
  "PAYMENT",
  "STOCK_OPERATION",
  "STOCK_COUNT",
  "ORDER_AMENDMENT",
  "PRODUCT_RETURN",
  "SERVICE_FULFILLMENT",
  "SERVICE_AUTHORIZATION",
  "SERVICE_WORK",
  "SERVICE_ASSIGNMENT",
  "PRICE_CHANGE",
  "FINANCE_POSTING",
] as const
/** Mirrors the Prisma `StockOperationType` enum. */
export const staffActivityTargetStockOperationTypes = [
  "OPENING_STOCK",
  "RECEIPT",
  "RESERVATION_COMMIT",
  "SALE_FULFILLMENT",
  "RETURN",
  "COUNT_RECONCILIATION",
  "ADJUSTMENT",
  "TRANSFER",
  "TRANSFORMATION",
  "STOCK_TRANSITION",
  "CUSTODY_ASSIGNMENT",
  "CUSTODY_RETURN",
  "CORRECTION",
  "CORRECTION_REVERSAL",
  "CORRECTION_REPLACEMENT",
  "INTERNAL_USE",
] as const
const id = z.string().trim().min(1).max(160)
const label = z.string().trim().min(1).max(120)
const recordRef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("order"), id, label }).strict(),
  z.object({ kind: z.literal("payment"), id, orderId: id, label }).strict(),
  z.object({ kind: z.literal("stock_operation"), id, label }).strict(),
  z.object({ kind: z.literal("stock_count"), id, label }).strict(),
  z.object({ kind: z.literal("service_job"), id, orderId: id, label }).strict(),
  z.object({ kind: z.literal("product"), id, offeringId: id, label }).strict(),
  z
    .object({ kind: z.literal("finance_entry"), id, bookId: id, label })
    .strict(),
])
const shownEventSchema = z
  .object({
    stream: z.enum(staffActivityTargetStreams),
    id,
    at: z.iso.datetime(),
    summary: z.string().trim().min(1).max(200),
    record: recordRef,
  })
  .strict()

/**
 * Navigation DTO only: the exact filters and page cursor the answer showed.
 * The protected canonical query revalidates filters and authority on open.
 */
export const staffActivityTargetSchema = z
  .object({
    kind: z.literal("staff_activity"),
    filters: z
      .object({
        membershipId: id.optional(),
        storeId: id.optional(),
        stream: z.enum(staffActivityTargetStreams).optional(),
        relation: z.enum(["PERFORMED", "APPROVED", "ASSIGNED"]).optional(),
        catalogItemId: id.optional(),
        stockOperationType: z
          .enum(staffActivityTargetStockOperationTypes)
          .optional(),
        from: z.iso.datetime({ offset: true }),
        to: z.iso.datetime({ offset: true }),
      })
      .strict(),
    /** The cursor of the page the answer showed; null for the first page. */
    cursor: z.string().min(1).max(2048).nullable(),
    limit: z.number().int().min(1).max(10),
    /**
     * The exact events the answer showed. Re-reading filters + cursor later
     * can return different records, so these identities are kept and any
     * re-read is labelled current.
     */
    shown: z.array(shownEventSchema).min(1).max(10),
  })
  .strict()
export type StaffActivityTarget = z.infer<typeof staffActivityTargetSchema>

export type StaffActivityRecordRef = z.infer<typeof recordRef>
export type StaffActivityShownEvent = z.infer<typeof shownEventSchema>

/**
 * What a client may render from the exact-ID authority read. Only a read this
 * mount completed counts: cached rows from earlier access, a refetch in
 * flight, a paused read or an error never show saved or stale events.
 */
export function freshShownRead<T>(query: {
  isError: boolean
  isSuccess: boolean
  isFetching: boolean
  isPaused: boolean
  isFetchedAfterMount: boolean
  data: T | undefined
}) {
  if (query.isError) return { state: "refused" as const }
  if (
    !query.isSuccess ||
    query.isFetching ||
    query.isPaused ||
    !query.isFetchedAfterMount ||
    query.data === undefined
  )
    return { state: "checking" as const }
  return { state: "ready" as const, data: query.data }
}

let mounts = 0
/** A unique id per component mount (not tree position, unlike `useId`). */
export const nextReadMount = () => `mount-${++mounts}`

/**
 * Gives a read its own cache entry for one mount, so reopening never joins a
 * request started (or cached) under earlier authority. Only the local cache
 * identity changes: the generated fetch still receives the SDK's canonical
 * key (procedure path and exact input) and the query's cancellation signal.
 */
export function mountOwnedRead<
  T extends { queryKey: readonly unknown[]; queryFn?: unknown },
>(options: T, mount: string): T {
  const canonicalKey = options.queryKey
  const fetch = options.queryFn
  return {
    ...options,
    queryKey: [...canonicalKey, { mount }] as unknown as T["queryKey"],
    ...(typeof fetch === "function"
      ? {
          queryFn: (context: object) =>
            // Spreading reads `signal`, which arms cancellation on unmount.
            fetch({ ...context, queryKey: canonicalKey }),
        }
      : {}),
  }
}
