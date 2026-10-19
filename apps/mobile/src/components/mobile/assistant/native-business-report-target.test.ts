import { expect, test } from "bun:test"
import {
  type BusinessReportTarget,
  businessReportTargetSchema,
} from "@ewatrade/assistant/general/business-report-target"
import type { BusinessReport } from "@ewatrade/db/business-reporting"
import {
  nativeBusinessReportOriginalRoute,
  nativeBusinessReportPage,
  nativeBusinessReportResultMatches,
  nativeBusinessReportRoute,
  nativeBusinessReportScopeMatches,
  readNativeBusinessReportTarget,
} from "./native-business-report-target"

const period = {
  from: "2026-10-01T01:00:00.123+01:00",
  before: "2026-10-16T00:00:00.123Z",
  timezone: "Africa/Lagos",
  currencyCode: "NGN",
}
const item = {
  kind: "business_report",
  origin: { tenantId: "business", storeId: "store" },
  request: {
    report: "item_sales",
    filters: { ...period, catalogItemId: "exact-item", cursor: "saved-cursor" },
  },
} satisfies BusinessReportTarget
const debt = {
  kind: "business_report",
  origin: { tenantId: "business", storeId: null },
  request: {
    report: "customer_debt",
    filters: {
      currencyCode: "USD",
      query: "Exact customer",
      cursor: "original",
    },
  },
} satisfies BusinessReportTarget
const profit = {
  kind: "business_report",
  origin: debt.origin,
  request: {
    report: "posted_profit",
    filters: {
      bookId: "exact-book",
      timezone: "UTC",
      from: period.from,
      through: period.before,
      snapshotSequence: "9223372036854775807",
    },
  },
} satisfies BusinessReportTarget
const supplier = {
  kind: "business_report",
  origin: debt.origin,
  request: {
    report: "supplier_aging",
    filters: {
      bookId: "exact-book",
      supplierId: "exact-supplier",
      timezone: "UTC",
      asOfDate: "2026-10-15",
      snapshotSequence: "12",
    },
  },
} satisfies BusinessReportTarget
const payment = {
  ...item,
  request: { report: "payment_collections", filters: period },
} satisfies BusinessReportTarget
const stock = {
  ...item,
  request: { report: "stock", filters: { catalogItemId: "exact-item" } },
} satisfies BusinessReportTarget
function report(target: BusinessReportTarget): BusinessReport {
  const type = target.request.report
  return {
    report: type,
    asOf: "2026-10-15T12:00:00Z",
    complete: true,
    scope: "Canonical current scope",
    dateBasis: "Canonical source basis",
    currencyCode:
      type === "stock" ? null : type === "customer_debt" ? "USD" : "NGN",
    period:
      type === "item_sales" ||
      type === "payment_collections" ||
      type === "posted_profit"
        ? {
            from: "2026-10-01T00:00:00.123Z",
            to: period.before,
            timezone: type === "posted_profit" ? "UTC" : period.timezone,
            end: type === "posted_profit" ? "inclusive" : "exclusive",
          }
        : null,
    rows: [],
    summary: "Canonical summary",
    gaps: [],
  }
}
test("serialized target roundtrips all canonical report kinds without adding authority", () => {
  for (const target of [item, payment, debt, stock, profit, supplier]) {
    expect(readNativeBusinessReportTarget(JSON.stringify(target))).toEqual(
      target,
    )
    expect(nativeBusinessReportRoute(target)).toEqual({
      pathname: "/business-report-modal",
      params: { target: JSON.stringify(target) },
    })
  }
  expect(readNativeBusinessReportTarget(item)).toBeNull()
  expect(nativeBusinessReportRoute(JSON.stringify(item))).toBeNull()
})
test("target parser refuses malformed, oversized, extra authority and invalid canonical filters", () => {
  for (const raw of [
    undefined,
    null,
    [],
    "",
    "{",
    "null",
    "{}",
    "x".repeat(65_537),
    JSON.stringify({ ...item, actorUserId: "injected" }),
    JSON.stringify({ ...item, origin: { ...item.origin, role: "OWNER" } }),
    JSON.stringify({
      ...item,
      request: {
        report: "item_sales",
        filters: { ...period, before: period.from },
      },
    }),
    JSON.stringify({
      ...item,
      request: {
        report: "item_sales",
        filters: { ...period, timezone: "wrong/zone" },
      },
    }),
  ])
    expect(readNativeBusinessReportTarget(raw)).toBeNull()
  const circular: { self?: unknown } = {}
  circular.self = circular
  expect(nativeBusinessReportRoute(circular)).toBeNull()
})
test("Next preserves exact origin and every saved filter; First removes only cursor", () => {
  for (const target of [item, debt]) {
    const next = nativeBusinessReportPage(target, 'exact-next"\\cursor')
    expect(next).toEqual(
      businessReportTargetSchema.parse({
        ...target,
        request: {
          ...target.request,
          filters: { ...target.request.filters, cursor: 'exact-next"\\cursor' },
        },
      }),
    )
    const { cursor: _cursor, ...filters } = target.request.filters
    expect(nativeBusinessReportPage(target)).toEqual(
      businessReportTargetSchema.parse({
        ...target,
        request: { ...target.request, filters },
      }),
    )
    for (const cursor of ["", "x".repeat(8193)])
      expect(nativeBusinessReportPage(target, cursor)).toBeNull()
  }
  for (const target of [payment, stock, profit, supplier])
    expect(nativeBusinessReportPage(target, "cursor")).toBeNull()
  // JSON escaping does not shrink the canonical maximum cursor capacity.
  const escaped = "\u0001".repeat(8192)
  expect(nativeBusinessReportPage(item, escaped)?.request).toEqual({
    ...item.request,
    filters: { ...item.request.filters, cursor: escaped },
  })
  expect(item.request.filters.cursor).toBe("saved-cursor")
})
test("origin guards match canonical Store vs business scope and independently fence actor", () => {
  const current = {
    actorUserId: "actor",
    tenantId: "business",
    storeId: "store",
  }
  for (const target of [item, payment, stock]) {
    expect(nativeBusinessReportScopeMatches(target, current, "actor")).toBe(
      true,
    )
    expect(
      nativeBusinessReportScopeMatches(target, {
        ...current,
        storeId: "other",
      }),
    ).toBe(false)
    expect(
      nativeBusinessReportScopeMatches(
        { ...target, origin: debt.origin },
        current,
      ),
    ).toBe(false)
  }
  for (const target of [debt, profit, supplier]) {
    expect(
      nativeBusinessReportScopeMatches(target, { ...current, storeId: null }),
    ).toBe(true)
    expect(
      nativeBusinessReportScopeMatches(target, {
        ...current,
        storeId: "other",
      }),
    ).toBe(true)
    expect(
      nativeBusinessReportScopeMatches(
        { ...target, origin: item.origin },
        current,
      ),
    ).toBe(false)
  }
  expect(
    nativeBusinessReportScopeMatches(item, {
      ...current,
      actorUserId: undefined,
    }),
  ).toBe(false)
  expect(
    nativeBusinessReportScopeMatches(item, { ...current, tenantId: "other" }),
  ).toBe(false)
  expect(
    nativeBusinessReportScopeMatches(item, current, "different-actor"),
  ).toBe(false)
})
test("typed report echoes require exact kind, currency and exclusive vs inclusive period semantics", () => {
  for (const target of [item, payment, debt, stock, profit, supplier]) {
    const value = report(target)
    expect(nativeBusinessReportResultMatches(target, value)).toBe(true)
    expect(
      nativeBusinessReportResultMatches(target, {
        ...value,
        complete: false,
        gaps: ["Source unavailable"],
      }),
    ).toBe(true)
    expect(
      nativeBusinessReportResultMatches(target, {
        ...value,
        report: target.request.report === "stock" ? "item_sales" : "stock",
      }),
    ).toBe(false)
    expect(
      nativeBusinessReportResultMatches(target, {
        ...value,
        currencyCode: "invalid",
      }),
    ).toBe(false)
    if (value.period) {
      for (const changed of [
        { from: "2026-10-02T00:00:00Z" },
        { to: "2026-10-17T00:00:00Z" },
        { timezone: "Etc/UTC" },
        { from: "invalid" },
        {
          end:
            value.period.end === "inclusive"
              ? ("exclusive" as const)
              : ("inclusive" as const),
        },
      ])
        expect(
          nativeBusinessReportResultMatches(target, {
            ...value,
            period: { ...value.period, ...changed },
          }),
        ).toBe(false)
      expect(
        nativeBusinessReportResultMatches(target, { ...value, period: null }),
      ).toBe(false)
    } else
      expect(
        nativeBusinessReportResultMatches(target, {
          ...value,
          period: {
            from: period.from,
            to: period.before,
            end: "inclusive",
            timezone: "UTC",
          },
        }),
      ).toBe(false)
  }
  expect(
    nativeBusinessReportResultMatches(item, {
      ...report(item),
      currencyCode: "USD",
    }),
  ).toBe(false)
  expect(
    nativeBusinessReportResultMatches(debt, {
      ...report(debt),
      currencyCode: "NGN",
    }),
  ).toBe(false)
})
test("supplier and posted-profit checks do not invent Book/sequence/date echoes from prose", () => {
  for (const target of [supplier, profit]) {
    const value = {
      ...report(target),
      scope: "No structured Book or supplier echo",
      dateBasis: "No structured snapshot echo",
      currencyCode: "USD",
    }
    expect(nativeBusinessReportResultMatches(target, value)).toBe(true)
    expect(
      nativeBusinessReportResultMatches(target, {
        ...value,
        currencyCode: null,
      }),
    ).toBe(false)
  }
})
test("original row navigation permits only exact existing customer/catalog destinations", () => {
  expect(
    nativeBusinessReportOriginalRoute(
      {
        kind: "catalog_item",
        id: "same-label-item",
      },
      { role: "OWNER" },
    ),
  ).toEqual({
    pathname: "/catalog-item/[catalogItemId]",
    params: { catalogItemId: "same-label-item" },
  })
  expect(
    nativeBusinessReportOriginalRoute(
      {
        kind: "customer",
        id: "same-label-customer",
      },
      { role: "OWNER" },
    ),
  ).toEqual({
    pathname: "/customer-ledger/[customerId]",
    params: { customerId: "same-label-customer" },
  })
  for (const target of [
    null,
    undefined,
    { kind: "order", id: "id" },
    { kind: "customer", id: "" },
    { kind: "customer", id: "x".repeat(161) },
    { kind: "customer", id: "id", url: "https://other.invalid" },
    { kind: "customer", id: "id", tenantId: "other" },
  ])
    expect(nativeBusinessReportOriginalRoute(target)).toBeNull()
})

test("original routes preserve existing destination access without widening catalog or ledger roles", () => {
  const item = { kind: "catalog_item", id: "original" }
  const customer = { kind: "customer", id: "original" }
  expect(nativeBusinessReportOriginalRoute(item)).toBeNull()
  expect(nativeBusinessReportOriginalRoute(customer)).toBeNull()
  for (const [role, staffAccessMode, catalogEditor, catalog, ledger] of [
    ["OWNER", "LEGACY", false, true, true],
    ["ADMIN", "SCOPED", false, true, true],
    ["MANAGER", "SCOPED", false, true, false],
    ["CASHIER", "LEGACY", false, false, false],
    ["OPERATOR", "SCOPED", false, false, false],
    ["OPERATOR", "SCOPED", true, true, false],
    [undefined, undefined, undefined, false, false],
  ] as const) {
    const profile = { role, staffAccessMode, catalogEditor }
    expect(Boolean(nativeBusinessReportOriginalRoute(item, profile))).toBe(
      catalog,
    )
    expect(Boolean(nativeBusinessReportOriginalRoute(customer, profile))).toBe(
      ledger,
    )
  }
})
