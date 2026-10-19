import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { BusinessReport } from "@ewatrade/db/business-reporting"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { ReactNode } from "react"
import { ListCard, StatusPill } from "../green-till/kit"

type RowTarget = NonNullable<BusinessReport["rows"][number]["target"]>
const titles: Record<BusinessReport["report"], string> = {
  item_sales: "Item sales",
  payment_collections: "Payment collections",
  customer_debt: "Customer debt",
  stock: "Stock balances",
  supplier_aging: "Supplier aging",
  posted_profit: "Posted profit",
}
const definitions: Record<BusinessReport["report"], string> = {
  item_sales:
    "Booked original Order line value. Fulfilled sales, returns, collections and profit have separate definitions. Unlike quantities are never added.",
  payment_collections:
    "Recorded immutable Order payments and refunds, regardless of Order age. Customer-credit settlement remains separate from money received. Provider settlement and unallocated receipts are excluded.",
  customer_debt:
    "Current business-wide posted customer accounts in one currency. Debt and available credit remain separate. No Store attribution or historical debt is inferred; no account does not mean no unpaid Orders.",
  stock:
    "Current canonical inventory balance sources. Exact units, configurations and custody remain separate. Transit is not sellable; missing sources are unknown. No currency or stock valuation is inferred.",
  supplier_aging:
    "Canonical posted supplier aging across all Stores. Payable and advance remain separate. Detailed sources remain in the supplier statement and aging workspace.",
  posted_profit:
    "Posted finance entries only. Actual business profit and cost completeness remain unknown. A posted zero is never known zero actual sales, cost, collections or profit.",
}
function money(value: unknown, currency: string | null) {
  if (
    typeof value !== "string" ||
    !/^-?\d{1,80}$/.test(value) ||
    typeof currency !== "string" ||
    !/^[A-Z]{3}$/.test(currency)
  )
    return "Amount unavailable"
  try {
    return formatFinanceMoney(value, currency)
  } catch {
    return "Amount unavailable"
  }
}
const count = (value: unknown) =>
  typeof value === "string" && /^\d{1,80}$/.test(value) ? value : "Unavailable"
function originalTarget(value: RowTarget | undefined): RowTarget | null {
  return value &&
    (value.kind === "catalog_item" || value.kind === "customer") &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    value.id.length <= 160
    ? { kind: value.kind, id: value.id }
    : null
}

/** Presentation only. The owner supplies a fresh, protected canonical report. */
export function NativeBusinessReportContent({
  report,
  onOpen,
  canOpen,
}: {
  report: BusinessReport
  onOpen: (target: RowTarget) => void
  /** Whether the current profile may open this exact original in the app. */
  canOpen: (target: RowTarget) => boolean
}) {
  const stock = report.report === "stock"
  // A failing access check never offers the original.
  const openable = (target: RowTarget) => {
    try {
      return canOpen(target) === true
    } catch {
      return false
    }
  }
  const matchingTotals = report.totals?.kind === report.report
  return (
    <View className="gap-4">
      <ListCard>
        <View className="gap-3 py-4">
          <View className="items-start">
            <StatusPill
              icon={report.complete ? undefined : "TriangleAlert"}
              label={
                report.complete
                  ? "Declared-source report"
                  : "Report unavailable"
              }
              tone={report.complete ? "ok" : "warn"}
            />
          </View>
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-foreground"
          >
            {titles[report.report]}
          </Text>
          <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {report.complete
              ? "Complete declared-source totals"
              : "No partial total shown"}
          </Text>
          {!report.complete ? (
            <Text accessibilityRole="alert" className="text-sm text-foreground">
              This report could not cover its declared scope. Totals and detail
              rows are withheld. Refine the supported filters in the assistant
              and open a new report.
            </Text>
          ) : stock ? (
            <>
              <Text className="text-base font-bold text-foreground">
                {report.summary}
              </Text>
              <Text className="text-xs text-muted-foreground">
                Compatible canonical groups are listed under source coverage.
                Never combine unlike units or sum source pages.
              </Text>
            </>
          ) : matchingTotals ? (
            <Totals report={report} />
          ) : (
            <Text className="text-sm text-muted-foreground">
              Canonical monetary totals unavailable.
            </Text>
          )}
          <Text className="text-sm text-muted-foreground">
            {definitions[report.report]}
          </Text>
          {report.complete ? (
            <Text className="text-xs text-muted-foreground">
              Complete refers to this report’s declared sources. Read the source
              coverage and known gaps before interpreting these totals.
            </Text>
          ) : null}
        </View>
      </ListCard>
      <Section title="Report scope and time">
        <Fact label="Scope" value={report.scope} />
        <Fact label="Date basis" value={report.dateBasis} />
        <Fact label="Request as of" value={report.asOf} />
        <Fact
          label="Currency"
          value={
            stock
              ? "Original stock units; no currency total"
              : (report.currencyCode ?? "Unavailable")
          }
        />
        {report.period ? (
          <>
            <Fact label="From (inclusive)" value={report.period.from} />
            <Fact
              label={`To (${report.period.end})`}
              value={report.period.to}
            />
            <Fact label="Timezone" value={report.period.timezone} />
          </>
        ) : (
          <Text className="text-xs text-muted-foreground">
            Current snapshot or canonical as-of date; no historical period is
            implied.
          </Text>
        )}
      </Section>
      {report.complete ? (
        <Section title="Source details">
          <Text className="text-xs text-muted-foreground">
            {report.pagination
              ? `${report.rows.length} details shown of ${count(report.pagination.totalRows)} matching details. Each page is an independent snapshot; never add detail pages. Complete totals above cover all matching declared sources.`
              : `${report.rows.length} source details shown. These details are separate from the complete declared-source totals; no page is summed here.`}
          </Text>
          {report.rows.length === 0 ? (
            <Text className="text-sm text-foreground">
              {report.pagination && report.pagination.totalRows !== "0"
                ? "No details on this page. Return to the first page to view matching records; the complete totals remain separate."
                : "No matching records in this report’s declared sources. Missing source coverage is unknown, never zero."}
            </Text>
          ) : (
            report.rows.map((row, index) => {
              const allowlisted = originalTarget(row.target)
              const target =
                allowlisted && openable(allowlisted) ? allowlisted : null
              const body = (
                <>
                  <Text className="text-sm font-bold text-foreground">
                    {row.label}
                  </Text>
                  <Text className="text-base font-bold tabular-nums text-foreground">
                    {stock ||
                    (report.report === "item_sales" &&
                      row.moneyMinor === undefined)
                      ? row.value
                      : `${money(row.moneyMinor, report.currencyCode)}${row.moneyLabel ? ` ${row.moneyLabel}` : ""}`}
                  </Text>
                  {!stock
                    ? row.moneyDetails?.map((metric, metricIndex) => (
                        <Fact
                          key={`${metricIndex}:${metric.label}`}
                          label={metric.label}
                          value={money(metric.amountMinor, report.currencyCode)}
                        />
                      ))
                    : null}
                  <Text className="text-xs text-muted-foreground">
                    {row.detail}
                  </Text>
                </>
              )
              return (
                <View key={row.id}>
                  {index > 0 ? <View className="h-px bg-border" /> : null}
                  {target ? (
                    // The whole row opens the exact original; it bleeds to the
                    // card edges so press feedback spans the card.
                    <Pressable
                      accessibilityHint="Opens the exact original record"
                      accessibilityLabel={`Open original: ${row.label}`}
                      accessibilityRole="button"
                      className="-mx-3.5 gap-2 px-3.5 py-3"
                      haptic
                      onPress={() => onOpen(target)}
                    >
                      {body}
                      <View className="flex-row items-center gap-1">
                        <Text className="text-sm font-bold text-primary">
                          Open original
                        </Text>
                        <Icon
                          className="size-4 text-primary"
                          name="ChevronRight"
                        />
                      </View>
                    </Pressable>
                  ) : (
                    <View className="gap-2 py-3">
                      {body}
                      {allowlisted ? (
                        <Text className="text-xs text-muted-foreground">
                          Original unavailable in this app for current access.
                        </Text>
                      ) : null}
                    </View>
                  )}
                </View>
              )
            })
          )}
        </Section>
      ) : null}
      <Section
        title="Source coverage and known gaps"
        pill={<StatusPill label="Read before relying" tone="warn" />}
      >
        {report.sourceCoverage ? (
          <>
            <Fact label="Coverage" value={report.sourceCoverage.coverage} />
            <Fact
              label="Completeness"
              value={report.sourceCoverage.completeness}
            />
            {report.sourceCoverage.gaps.map((gap, index) => (
              <Text
                key={`source:${index}:${gap}`}
                className="text-xs text-muted-foreground"
              >
                {gap}
              </Text>
            ))}
          </>
        ) : (
          <Text className="text-xs text-muted-foreground">
            Coverage is defined by the declared source and gaps below; no
            broader coverage is certified.
          </Text>
        )}
        {report.gaps.map((gap, index) => (
          <Text
            key={`gap:${index}:${gap}`}
            className="text-xs text-muted-foreground"
          >
            {gap}
          </Text>
        ))}
        {report.gaps.length === 0 ? (
          <Text className="text-xs text-muted-foreground">
            No additional gap explanation was supplied. This does not certify
            complete business activity.
          </Text>
        ) : null}
      </Section>
    </View>
  )
}
function Totals({ report }: { report: BusinessReport }) {
  const t = report.totals
  const amount = (value: string) => money(value, report.currencyCode)
  if (!t || t.kind !== report.report) return null
  switch (t.kind) {
    case "item_sales":
      return (
        <>
          <Headline
            label="Booked line value"
            value={amount(t.bookedValueMinor)}
          />
          <Fact label="Original item groups" value={count(t.groupCount)} />
          <Fact label="Order lines" value={count(t.lineCount)} />
        </>
      )
    case "payment_collections":
      return (
        <>
          <Headline label="Net money" value={amount(t.netMoneyMinor)} />
          <Fact label="Money received" value={amount(t.receivedMinor)} />
          <Fact label="Money refunded" value={amount(t.refundedMinor)} />
          <Fact
            label="Net customer-credit settlement (separate)"
            value={amount(t.netCustomerCreditMinor)}
          />
        </>
      )
    case "customer_debt":
      return (
        <>
          <Headline
            label="Outstanding debt"
            value={amount(t.outstandingDebtMinor)}
          />
          <Fact
            label="Matching posted accounts"
            value={count(t.accountCount)}
          />
          <Fact
            label="Available credit"
            value={amount(t.availableCreditMinor)}
          />
          <Fact label="Net account balance" value={amount(t.netBalanceMinor)} />
        </>
      )
    case "supplier_aging":
      return (
        <>
          <Headline label="Supplier payable" value={amount(t.payableMinor)} />
          <Fact label="Supplier advance" value={amount(t.advanceMinor)} />
          <Fact label="Canonical sources read" value={count(t.sourcesRead)} />
        </>
      )
    case "posted_profit":
      return (
        <>
          <Headline
            label="Posted entries net profit"
            value={amount(t.netProfitMinor)}
          />
          <Fact label="Posted revenue" value={amount(t.revenueMinor)} />
          <Fact
            label="Posted cost of sales"
            value={amount(t.costOfSalesMinor)}
          />
          <Fact label="Posted expenses" value={amount(t.expensesMinor)} />
        </>
      )
  }
}
function Headline({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-1 pb-1">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-[26px] font-bold tabular-nums text-foreground">
        {value}
      </Text>
    </View>
  )
}
function Section({
  title,
  pill,
  children,
}: {
  title: string
  pill?: ReactNode
  children: ReactNode
}) {
  return (
    <ListCard>
      <View className="gap-3 py-4">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text
            accessibilityRole="header"
            className="shrink text-sm font-bold text-foreground"
          >
            {title}
          </Text>
          {pill}
        </View>
        {children}
      </View>
    </ListCard>
  )
}
/** Label left, value right; wraps to two lines at large text sizes. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <Text className="shrink text-xs text-muted-foreground">{label}</Text>
      <Text className="text-right text-sm font-bold tabular-nums text-foreground">
        {value}
      </Text>
    </View>
  )
}
