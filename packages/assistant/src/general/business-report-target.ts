import { z } from "zod"

const identity = z.string().trim().min(1).max(160)
const cursor = z.string().min(1).max(8192)
const timezone = z
  .string()
  .min(1)
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format()
      return true
    } catch {
      return false
    }
  }, "Choose an IANA timezone")
const period = {
  from: z.string().datetime({ offset: true }),
  before: z.string().datetime({ offset: true }),
  timezone,
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
}
const validPeriod = (value: { from: string; before: string }) =>
  Date.parse(value.from) < Date.parse(value.before) &&
  Date.parse(value.before) - Date.parse(value.from) <= 366 * 86_400_000

export const itemSalesReportInput = z
  .object({
    ...period,
    catalogItemId: identity.optional(),
    cursor: cursor.optional(),
  })
  .strict()
  .refine(validPeriod, "Choose a positive period of at most 366 days")
export const paymentCollectionsReportInput = z
  .object(period)
  .strict()
  .refine(validPeriod, "Choose a positive period of at most 366 days")
export const customerDebtReportInput = z
  .object({
    currencyCode: period.currencyCode,
    query: z.string().trim().min(1).max(160).optional(),
    cursor: cursor.optional(),
  })
  .strict()
export const stockReportInput = z
  .object({ catalogItemId: identity.optional() })
  .strict()

const sequence = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n)
export const supplierAgingReportInput = z
  .object({
    bookId: identity,
    supplierId: identity,
    timezone: z.literal("UTC"),
    asOfDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`)
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value &&
          value >= "0001-01-01" &&
          value <= "9999-12-30"
        )
      }),
    snapshotSequence: sequence.optional(),
  })
  .strict()
export const postedProfitReportInput = z
  .object({
    bookId: identity,
    timezone: z.literal("UTC"),
    from: period.from,
    through: period.before,
    snapshotSequence: sequence.optional(),
  })
  .strict()
  .refine(
    (value) =>
      Date.parse(value.from) <= Date.parse(value.through) &&
      Date.parse(value.through) - Date.parse(value.from) <= 366 * 86_400_000,
    "Choose an inclusive period of at most 366 days",
  )

/** Navigation filters and original scope identity only; no actor, authority or arbitrary URL. */
export const businessReportTargetSchema = z
  .object({
    kind: z.literal("business_report"),
    /** Identity for navigation freshness only. Native reads re-authorize it. */
    origin: z
      .object({ tenantId: identity, storeId: identity.nullable() })
      .strict(),
    request: z.discriminatedUnion("report", [
      z
        .object({
          report: z.literal("supplier_aging"),
          filters: supplierAgingReportInput,
        })
        .strict(),
      z
        .object({
          report: z.literal("posted_profit"),
          filters: postedProfitReportInput,
        })
        .strict(),
      z
        .object({
          report: z.literal("item_sales"),
          filters: itemSalesReportInput,
        })
        .strict(),
      z
        .object({
          report: z.literal("payment_collections"),
          filters: paymentCollectionsReportInput,
        })
        .strict(),
      z
        .object({
          report: z.literal("customer_debt"),
          filters: customerDebtReportInput,
        })
        .strict(),
      z
        .object({ report: z.literal("stock"), filters: stockReportInput })
        .strict(),
    ]),
  })
  .strict()
export type BusinessReportTarget = z.infer<typeof businessReportTargetSchema>
