import { expect, mock, test } from "bun:test"
import type { BusinessReport } from "@ewatrade/db/business-reporting"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Actual content consumer; native primitives stand in. No transport or database.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/text", { Text: children })
standIn("components/ui/view", { View: children })
standIn("components/mobile/green-till/kit", {
  ListCard: children,
  StatusPill: ({ label }: { label: string }) => <span>{label}</span>,
})
standIn("components/ui/icon", { Icon: () => null })
const buttons: Array<() => void> = []
standIn("components/ui/pressable", {
  Pressable: ({
    children,
    onPress,
  }: { children: ReactNode; onPress: () => void }) => {
    buttons.push(onPress)
    return <button type="button">{children}</button>
  },
})
const { NativeBusinessReportContent } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-business-report-content"
)
type RowTarget = NonNullable<BusinessReport["rows"][number]["target"]>
const opened: RowTarget[] = []
const checked: RowTarget[] = []
function render(
  report: BusinessReport,
  canOpen: (target: RowTarget) => boolean = () => true,
) {
  buttons.length = 0
  opened.length = 0
  checked.length = 0
  return renderToStaticMarkup(
    createElement(NativeBusinessReportContent, {
      report,
      onOpen: (target) => opened.push(target),
      canOpen: (target) => {
        checked.push(target)
        return canOpen(target)
      },
    }),
  )
}
function firstRow(source: BusinessReport) {
  const row = source.rows[0]
  if (!row) throw Error("Fixture requires one source row")
  return row
}
function report(kind: BusinessReport["report"] = "item_sales"): BusinessReport {
  return {
    report: kind,
    complete: true,
    scope: "Original business · Store A",
    dateBasis: "Original Order createdAt · confirmed through completed",
    currencyCode: "NGN",
    asOf: "2026-10-15T11:12:13.123Z",
    period: {
      from: "2026-10-01T00:00:00+01:00",
      to: "2026-10-15T00:00:00+01:00",
      end: "exclusive",
      timezone: "Africa/Lagos",
    },
    summary: "Raw source summary is not a formatted monetary total.",
    totals: {
      kind: "item_sales",
      groupCount: "147",
      lineCount: "500",
      bookedValueMinor: "9223372036854775807",
    },
    rows: [
      {
        id: "saved-source",
        label: "Original item · original variant",
        value: "0.125 original boxes",
        detail:
          "Snapshot unit/configuration/custody, not current catalog labels.",
        moneyDetails: [
          { label: "Booked original value", amountMinor: "12345" },
        ],
        target: { kind: "catalog_item", id: "original-catalog-item" },
      },
    ],
    pagination: {
      totalRows: "147",
      nextCursor: "PRIVATE_CURSOR_DO_NOT_RENDER",
    },
    gaps: ["Original source snapshots only; missing snapshots remain unknown."],
  }
}
test("item totals retain huge exact cents and complete counts separately from ten details", () => {
  const source = report()
  source.rows = Array.from({ length: 10 }, (_, index) => ({
    ...firstRow(source),
    id: `source-${index}`,
  }))
  const html = render(source)
  for (const text of [
    "Item sales",
    "147",
    "500",
    "₦92,233,720,368,547,758.07",
    "10 details shown of 147",
    "never add detail pages",
    "0.125 original boxes",
    "Booked original value",
    "₦123.45",
    "Booked original Order line value",
  ])
    expect(html).toContain(text)
  expect(html).not.toContain(source.summary)
  expect(html).not.toContain("PRIVATE_CURSOR_DO_NOT_RENDER")
  expect(buttons).toHaveLength(10)
})
test("raw period boundaries timezone scope currency and asOf stay visible", () => {
  const source = report()
  const html = render(source)
  for (const text of [
    source.scope,
    source.dateBasis,
    source.asOf,
    "2026-10-01T00:00:00+01:00",
    "2026-10-15T00:00:00+01:00",
    "To (exclusive)",
    "From (inclusive)",
    "Africa/Lagos",
    "NGN",
  ])
    expect(html).toContain(text)
  source.period = {
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-15T00:00:00.000Z",
    end: "inclusive",
    timezone: "UTC",
  }
  expect(render(source)).toContain("To (inclusive)")
})
test("collections show received refunds net money and separate customer credit without summing detail rows", () => {
  const source = report("payment_collections")
  source.totals = {
    kind: "payment_collections",
    receivedMinor: "30000",
    refundedMinor: "10000",
    netMoneyMinor: "20000",
    netCustomerCreditMinor: "1200",
  }
  source.rows = [
    {
      id: "refund",
      label: "Cash · Refund",
      moneyMinor: "10000",
      value: "unsafe fallback",
      detail: "Recorded payment time regardless of Order age",
    },
  ]
  const html = render(source)
  for (const text of [
    "Payment collections",
    "Money received",
    "₦300.00",
    "Money refunded",
    "₦100.00",
    "Net money",
    "₦200.00",
    "Net customer-credit settlement (separate)",
    "₦12.00",
    "Provider settlement and unallocated receipts are excluded",
  ])
    expect(html).toContain(text)
  expect(html).not.toContain("unsafe fallback")
})
test("customer debt preserves complete accounts debt credit and net balance with exact original customer navigation", () => {
  const source = report("customer_debt")
  source.period = null
  source.totals = {
    kind: "customer_debt",
    accountCount: "25",
    outstandingDebtMinor: "50000",
    availableCreditMinor: "7000",
    netBalanceMinor: "43000",
  }
  source.rows = [
    {
      id: "account",
      label: "Saved customer label",
      value: "unsafe fallback",
      detail: "Posted account sequence 100",
      moneyMinor: "1000",
      moneyLabel: "debt",
      moneyDetails: [
        { label: "Available credit", amountMinor: "100" },
        { label: "Net balance", amountMinor: "900" },
      ],
      target: { kind: "customer", id: "exact-customer" },
    },
  ]
  const html = render(source)
  for (const text of [
    "Customer debt",
    "Matching posted accounts",
    "25",
    "Outstanding debt",
    "₦500.00",
    "Available credit",
    "₦70.00",
    "Net account balance",
    "₦430.00",
    "₦10.00 debt",
    "₦1.00",
    "₦9.00",
    "no account does not mean no unpaid Orders",
    "Current snapshot or canonical as-of date",
  ])
    expect(html).toContain(text)
  buttons[0]?.()
  expect(opened).toEqual([{ kind: "customer", id: "exact-customer" }])
})
test("stock retains exact units configuration custody and compatible groups without any monetary inference", () => {
  const source = report("stock")
  source.currencyCode = null
  source.period = null
  source.totals = undefined
  source.summary = "2 complete balance sources; 2 compatible groups."
  source.rows = [
    {
      id: "stock-source",
      label: "Original flour · original bag",
      value: "999999999999999999.000001 kg available",
      detail:
        "On hand 10.000001; reserved 0.000001. unit kg; configuration v2; custody TRANSIT.",
      moneyMinor: "999999",
      moneyDetails: [{ label: "INJECTED_MONEY", amountMinor: "12345" }],
      target: { kind: "catalog_item", id: "exact-item" },
    },
  ]
  source.gaps = [
    "Compatible group item/v2/TRANSIT: available 0 canonical units. Informational only.",
  ]
  const html = render(source)
  for (const text of [
    source.summary,
    "999999999999999999.000001 kg available",
    "unit kg; configuration v2; custody TRANSIT",
    "Transit is not sellable",
    source.gaps[0] ?? "",
    "Original stock units; no currency total",
  ])
    expect(html).toContain(text)
  expect(html).not.toContain("₦")
  expect(html).not.toContain("INJECTED_MONEY")
  buttons[0]?.()
  expect(opened).toEqual([{ kind: "catalog_item", id: "exact-item" }])
})
test("supplier aging retains complete payable advance buckets and source count independently", () => {
  const source = report("supplier_aging")
  source.period = null
  source.totals = {
    kind: "supplier_aging",
    payableMinor: "100000",
    advanceMinor: "5000",
    sourcesRead: "900",
  }
  source.rows = [
    {
      id: "older",
      label: "Supplier · 90+",
      moneyMinor: "2400",
      value: "unsafe fallback",
      detail: "All Stores · canonical UTC aging snapshot 50",
    },
  ]
  const html = render(source)
  for (const text of [
    "Supplier aging",
    "Supplier payable",
    "₦1,000.00",
    "Supplier advance",
    "₦50.00",
    "Canonical sources read",
    "900",
    "Supplier · 90+",
    "₦24.00",
    "Detailed sources remain in the supplier statement",
  ])
    expect(html).toContain(text)
  expect(buttons).toHaveLength(0)
})
test("posted profit never equates complete posted entries to complete business activity", () => {
  const source = report("posted_profit")
  source.totals = {
    kind: "posted_profit",
    revenueMinor: "0",
    costOfSalesMinor: "0",
    expensesMinor: "500",
    netProfitMinor: "-500",
  }
  source.rows = []
  source.pagination = undefined
  source.sourceCoverage = {
    coverage: "POSTED_FINANCE_ENTRIES",
    completeness: "INCOMPLETE_SOURCE_COVERAGE",
    gaps: [
      "INVENTORY_COSTS",
      "COMMERCIAL_SALES_AND_CUSTOMER_PAYMENTS",
      "OPENING_BALANCE_RECONCILIATION",
    ],
  }
  const html = render(source)
  for (const text of [
    "Posted revenue",
    "Posted cost of sales",
    "Posted expenses",
    "Posted entries net profit",
    "₦0.00",
    "-₦5.00",
    "Actual business profit and cost completeness remain unknown",
    "A posted zero is never known zero actual",
    "POSTED_FINANCE_ENTRIES",
    "INCOMPLETE_SOURCE_COVERAGE",
    "INVENTORY_COSTS",
    "COMMERCIAL_SALES_AND_CUSTOMER_PAYMENTS",
    "OPENING_BALANCE_RECONCILIATION",
  ])
    expect(html).toContain(text)
})
test("incomplete report with unsafe injected partial totals rows summary cannot claim complete results or expose originals", () => {
  const source = report()
  source.complete = false
  source.summary = "PARTIAL_MONEY_SUMMARY"
  firstRow(source).label = "PARTIAL_ROW_LABEL"
  const html = render(source)
  for (const text of [
    "No partial total shown",
    "Totals and detail rows are withheld",
    source.scope,
    source.dateBasis,
    source.gaps[0] ?? "",
  ])
    expect(html).toContain(text)
  for (const text of [
    "Complete declared-source totals",
    "147 matching",
    "₦92,233,720,368,547,758.07",
    "PARTIAL_MONEY_SUMMARY",
    "PARTIAL_ROW_LABEL",
  ])
    expect(html).not.toContain(text)
  expect(buttons).toHaveLength(0)
})
test("malformed or unsafe nonstring monetary values are unavailable with no raw fallback or crash", () => {
  for (const bad of [
    null,
    "1.5",
    "bad",
    "Infinity",
    "",
    " 1200 ",
    9007199254740992,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    const source = report("payment_collections")
    source.totals = {
      kind: "payment_collections",
      receivedMinor: JSON.parse(JSON.stringify(bad)),
      refundedMinor: "0",
      netMoneyMinor: "0",
      netCustomerCreditMinor: "0",
    }
    source.rows = [
      {
        id: "row",
        label: "Recorded amount",
        moneyMinor: JSON.parse(JSON.stringify(bad)),
        moneyDetails: [
          {
            label: "Recorded extra",
            amountMinor: JSON.parse(JSON.stringify(bad)),
          },
        ],
        value: "DO_NOT_USE_UNSAFE_FALLBACK",
        detail: "Recorded source",
      },
    ]
    const html = render(source)
    expect(html).toContain("Amount unavailable")
    expect(html).not.toContain("DO_NOT_USE_UNSAFE_FALLBACK")
    expect(html).not.toContain("₦NaN")
    expect(html).not.toContain("₦∞")
  }
})
test("missing currency or mismatched totals cannot format or substitute totals from another family", () => {
  const source = report()
  source.currencyCode = null
  expect(render(source)).toContain("Amount unavailable")
  source.totals = {
    kind: "supplier_aging",
    payableMinor: "12345",
    advanceMinor: "100",
    sourcesRead: "900",
  }
  const html = render(source)
  expect(html).toContain("Canonical monetary totals unavailable")
  expect(html).not.toContain("Supplier payable")
})
test("empty later page preserves complete totals and never converts unknown source absence to zero", () => {
  const source = report()
  source.rows = []
  const html = render(source)
  expect(html).toContain("No details on this page")
  expect(html).toContain("0 details shown of 147")
  expect(html).toContain("₦92,233,720,368,547,758.07")
  source.pagination = { totalRows: "0", nextCursor: null }
  expect(render(source)).toContain(
    "Missing source coverage is unknown, never zero",
  )
})
test("only typed exact original identities pass to navigation; extra private fields and arbitrary hrefs never render or forward", () => {
  const source = report()
  const target = {
    kind: "catalog_item" as const,
    id: "saved-item",
    href: "https://private.invalid/SECRET_HREF",
    token: "PRIVATE_TOKEN",
  }
  const row = {
    ...firstRow(source),
    target,
    privateJson: { secret: "PRIVATE_JSON" },
  }
  source.rows = [row]
  const html = render(source)
  for (const text of [
    "SECRET_HREF",
    "PRIVATE_TOKEN",
    "PRIVATE_JSON",
    "PRIVATE_CURSOR_DO_NOT_RENDER",
  ])
    expect(html).not.toContain(text)
  buttons[0]?.()
  expect(opened).toEqual([{ kind: "catalog_item", id: "saved-item" }])
  for (const target of [
    JSON.parse('{"kind":"order","id":"wrong-kind"}'),
    { kind: "customer", id: " " },
    { kind: "customer", id: "x".repeat(161) },
  ]) {
    source.rows = [{ ...row, target }]
    render(source)
    expect(buttons).toHaveLength(0)
  }
})
test("an original the current profile cannot open keeps row facts but offers no press and says why", () => {
  const source = report("customer_debt")
  source.totals = {
    kind: "customer_debt",
    accountCount: "1",
    outstandingDebtMinor: "1000",
    availableCreditMinor: "0",
    netBalanceMinor: "1000",
  }
  source.rows = [
    {
      id: "account",
      label: "Saved customer label",
      value: "unsafe fallback",
      detail: "Posted account sequence 100",
      moneyMinor: "1000",
      moneyLabel: "debt",
      target: {
        kind: "customer",
        id: "exact-customer",
        token: "PRIVATE",
      } as RowTarget,
    },
  ]
  const html = render(source, () => false)
  expect(checked).toEqual([{ kind: "customer", id: "exact-customer" }])
  expect(buttons).toHaveLength(0)
  expect(html).not.toContain("Open original")
  for (const text of [
    "Saved customer label",
    "₦10.00 debt",
    "Posted account sequence 100",
    "Original unavailable in this app for current access.",
  ])
    expect(html).toContain(text)
  for (const canOpen of [
    () => {
      throw Error("profile unavailable")
    },
    () => "yes" as unknown as boolean,
  ]) {
    render(source, canOpen)
    expect(buttons).toHaveLength(0)
  }
  render(source, () => true)
  expect(buttons).toHaveLength(1)
  buttons[0]?.()
  expect(opened).toEqual([{ kind: "customer", id: "exact-customer" }])
})
test("rows without an allowlisted original never ask access and show no unavailable notice", () => {
  const source = report("supplier_aging")
  source.totals = {
    kind: "supplier_aging",
    payableMinor: "100",
    advanceMinor: "0",
    sourcesRead: "1",
  }
  source.rows = [
    {
      id: "bucket",
      label: "Supplier · 90+",
      moneyMinor: "100",
      value: "unsafe fallback",
      detail: "All Stores",
      target: JSON.parse('{"kind":"order","id":"wrong-kind"}'),
    },
  ]
  const html = render(source)
  expect(checked).toHaveLength(0)
  expect(buttons).toHaveLength(0)
  expect(html).not.toContain("Original unavailable")
})
