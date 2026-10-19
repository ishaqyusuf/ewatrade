import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { generalDayCloseInput } from "@ewatrade/assistant/general/contracts"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "../finance/finance-workspace-gate"
import { ListCard } from "../green-till/kit"

type Checklist = RouterOutputs["finance"]["periodCloseChecklist"]
type Day = RouterOutputs["finance"]["reports"]
const options = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}
const time = (value: Date | string | null | undefined) =>
  value ? new Date(value).getTime() : Number.NaN
const utc = (value: Date | string | null | undefined) =>
  Number.isFinite(time(value))
    ? new Date(time(value)).toISOString()
    : "Not recorded or unavailable"
const label = (value: string) => value.toLowerCase().replaceAll("_", " ")
function money(value: unknown, currency: string) {
  const exact =
    typeof value === "string" && /^-?\d{1,80}$/.test(value)
      ? value
      : typeof value === "number" && Number.isSafeInteger(value)
        ? String(value)
        : null
  if (exact === null) return "Amount unavailable"
  try {
    return formatFinanceMoney(exact, currency)
  } catch {
    return "Amount unavailable"
  }
}
/** Advisory posted facts. No financial close/reopen, correction or stock action. */
export function NativeDayReviewScreen({
  bookId,
  through,
}: { bookId: string; through: string }) {
  const { profile } = useAuthContext()
  const [refresh, setRefresh] = useState(0)
  const parsed = generalDayCloseInput.safeParse({ bookId, through })
  if (
    !parsed.success ||
    Date.parse(parsed.data.through) >= Date.now() ||
    !profile?.id ||
    !profile.businessId ||
    (profile.status !== undefined && profile.status !== "ACTIVE")
  )
    return (
      <Notice>
        Choose the original Finance Book and an exact completed UTC day cutoff.
      </Notice>
    )
  const scope = JSON.stringify([
    profile.id,
    profile.businessId,
    profile.storeId,
    profile.role,
    profile.staffAccessMode,
    profile.catalogEditor,
    profile.status,
    parsed.data,
    refresh,
  ])
  return (
    <FinanceWorkspaceGate
      key={scope}
      expectedBookId={parsed.data.bookId}
      requireOnline
    >
      {(workspace) =>
        workspace.actorUserId === profile.id &&
        workspace.tenantId === profile.businessId &&
        workspace.book.id === parsed.data.bookId ? (
          <DayRead
            key={scope}
            workspace={workspace}
            through={parsed.data.through}
            refresh={() => setRefresh((value) => value + 1)}
          />
        ) : (
          <Notice>
            The current actor, business or original Finance Book changed.
          </Notice>
        )
      }
    </FinanceWorkspaceGate>
  )
}
function DayRead({
  workspace,
  through,
  refresh,
}: { workspace: FinanceWorkspace; through: string; refresh: () => void }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const checklist = useQuery(
    mountOwnedRead(
      trpc.finance.periodCloseChecklist.queryOptions(
        { bookId: workspace.book.id, through: new Date(through) },
        options,
      ),
      mount,
    ),
  )
  const check = freshShownRead(checklist)
  const c = check.state === "ready" ? check.data : null
  const valid =
    c &&
    c.bookId === workspace.book.id &&
    c.currencyCode === workspace.book.currencyCode &&
    time(c.through) === Date.parse(through) &&
    Number.isFinite(time(c.from)) &&
    time(c.from) <= Date.parse(through) &&
    typeof c.snapshotSequence === "string" &&
    /^\d+$/.test(c.snapshotSequence)
  const midnight = Date.parse(`${through.slice(0, 10)}T00:00:00.000Z`)
  const from = new Date(valid ? Math.max(midnight, time(c.from)) : midnight)
  const report = useQuery(
    mountOwnedRead(
      trpc.finance.reports.queryOptions(
        {
          bookId: workspace.book.id,
          from,
          through: new Date(through),
          snapshotSequence: valid ? c.snapshotSequence : undefined,
        },
        { ...options, enabled: Boolean(valid) },
      ),
      mount,
    ),
  )
  const posted = freshShownRead(report)
  const d =
    valid &&
    posted.state === "ready" &&
    posted.data.bookId === c.bookId &&
    posted.data.currencyCode === c.currencyCode &&
    posted.data.snapshotSequence === c.snapshotSequence &&
    time(posted.data.from) === from.getTime() &&
    time(posted.data.through) === Date.parse(through)
      ? posted.data
      : null
  const refused =
    check.state === "refused" ||
    (check.state === "ready" && !valid) ||
    (valid && (posted.state === "refused" || (posted.state === "ready" && !d)))
  if (!valid || !d)
    return (
      <View className="gap-3 p-5">
        <Text accessibilityRole={refused ? "alert" : undefined}>
          {refused
            ? "The exact Book, currency, cutoff or snapshot review is unavailable. Refresh both reads before relying on these facts."
            : "Checking the exact closing checklist and its matching posted day summary…"}
        </Text>
        {refused ? (
          <ActionButton variant="outline" onPress={refresh}>
            Retry day review
          </ActionButton>
        ) : null}
      </View>
    )
  return (
    <ScrollView
      contentContainerStyle={{ gap: 14, padding: 18, paddingBottom: 36 }}
    >
      <ReviewContent checklist={c} day={d} />
      <ActionButton variant="outline" onPress={refresh}>
        Refresh day review
      </ActionButton>
    </ScrollView>
  )
}
function ReviewContent({
  checklist: c,
  day: d,
}: { checklist: Checklist; day: Day }) {
  const unresolved = c.checks.filter((check) => check.status !== "PASS").length
  return (
    <>
      <Section title="Day review">
        <Text className="text-sm text-muted-foreground">Unresolved checks</Text>
        <Text className="text-4xl font-bold tabular-nums text-foreground">
          {unresolved}
        </Text>
        <Text>
          Tenant Finance Book · {c.currencyCode} · snapshot {c.snapshotSequence}
        </Text>
        <Text>Through {utc(c.through)} UTC</Text>
        <Text>
          Assistant close and reopen are unavailable. Physical cash count, stock
          closeout, posting-date lock and fiscal close are distinct workflows.
        </Text>
      </Section>
      <Section title="Posted day summary">
        <Text>
          {utc(d.from)}–{utc(d.through)} UTC
        </Text>
        {(
          [
            ["Posted revenue", d.profitAndLoss.revenueMinor],
            ["Posted expenses", d.profitAndLoss.expensesMinor],
            ["Posted cost of sales", d.profitAndLoss.costOfSalesMinor],
            ["Posted gross result", d.profitAndLoss.grossProfitMinor],
            ["Posted net result", d.profitAndLoss.netProfitMinor],
            ["Cash and bank net change", d.cashFlow.netChangeMinor],
          ] as const
        ).map(([title, value]) => (
          <Fact
            key={title}
            title={title}
            value={money(value, d.currencyCode)}
          />
        ))}
        <Text>
          Cash flow covers cash and bank; unsettled clearing is excluded. These
          posted facts have incomplete source coverage. Posted zero does not
          prove no business activity.
        </Text>
        <Text>
          Report gaps:{" "}
          {d.coverageGaps.length
            ? d.coverageGaps.map(label).join(" · ")
            : "No additional gaps returned; complete business activity is not certified."}
        </Text>
      </Section>
      <Section title="Operational close checklist">
        <Text>
          Review interval {utc(c.from)}–{utc(c.through)} UTC.
        </Text>
        <Fact
          title="Date-lock eligible in this checklist"
          value={c.dateLockEligible ? "Yes; no lock is performed here" : "No"}
        />
        <Fact
          title="Operationally reconciled"
          value="No; this checklist does not certify complete reconciliation."
        />
        <Fact title="Source completeness" value={label(c.completeness)} />
        {c.checks.map((check) => (
          <View key={check.id} className="gap-2 border-t border-border pt-3">
            <Text className="font-bold text-foreground">
              {check.label} · {label(check.status)}
            </Text>
            <Text>
              {check.id === "POSTED_TRIAL_BALANCE"
                ? `Posted debits ${money(c.trialBalance.debitMinor, c.currencyCode)} · credits ${money(c.trialBalance.creditMinor, c.currencyCode)}.`
                : check.explanation}
            </Text>
          </View>
        ))}
      </Section>
      <Section title="Cash at the exact cutoff">
        {c.cash.length ? (
          c.cash.map((row) => (
            <View
              key={row.accountId}
              className="gap-2 border-t border-border pt-3"
            >
              <Text className="font-semibold text-foreground">{row.name}</Text>
              <Fact
                title="Posted cutoff balance"
                value={money(row.closingBalanceMinor, c.currencyCode)}
              />
              <Fact
                title="Physically counted at cutoff"
                value={
                  row.observedBalanceMinor === null
                    ? "No verified cutoff count; not zero"
                    : money(row.observedBalanceMinor, c.currencyCode)
                }
              />
              <Fact
                title="Original count basis"
                value={
                  row.originalExpectedBalanceMinor === null
                    ? "Unavailable"
                    : money(row.originalExpectedBalanceMinor, c.currencyCode)
                }
              />
              <Fact
                title="Original count snapshot"
                value={row.countSnapshotSequence ?? "Unavailable"}
              />
              <Text>
                {label(row.status)} · original basis{" "}
                {row.basisVerified ? "verified" : "not verified"}.
              </Text>
            </View>
          ))
        ) : (
          <Text>No posted cash accounts were returned for this Book.</Text>
        )}
        <Text>
          Cash-count coverage:{" "}
          {c.cashCountCoverageComplete
            ? "within the review bound"
            : "incomplete"}
          . Command coverage:{" "}
          {c.cashCommandCoverageComplete
            ? "within the review bound"
            : "incomplete"}
          . Review limit {c.cashCountReviewLimit}. A missing or incomplete count
          is not a physical zero or a completed reconciliation.
        </Text>
      </Section>
      <Section title="Posted balance checks">
        <Fact
          title="Trial balance difference"
          value={money(c.trialBalance.differenceMinor, c.currencyCode)}
        />
        <Fact
          title="Trial balance"
          value={
            c.trialBalance.balanced
              ? "Posted debits and credits match"
              : "Posted debits and credits do not match"
          }
        />
        {(
          [
            ["Posted assets", c.balanceSheet.assetsMinor],
            ["Posted liabilities", c.balanceSheet.liabilitiesMinor],
            ["Posted equity", c.balanceSheet.postedEquityMinor],
            ["Unclosed earnings", c.balanceSheet.unclosedEarningsMinor],
            [
              "Total equity including unclosed earnings",
              c.balanceSheet.totalEquityMinor,
            ],
            ["Posted position difference", c.balanceSheet.differenceMinor],
          ] as const
        ).map(([title, value]) => (
          <Fact
            key={title}
            title={title}
            value={money(value, c.currencyCode)}
          />
        ))}
        <Text>
          Date locking does not transfer earnings. Complete opening evidence and
          year-end retained earnings require separate workflows.
        </Text>
      </Section>
      <Section title="Cash and bank movement">
        <Fact
          title="Opening"
          value={money(d.cashFlow.openingMinor, d.currencyCode)}
        />
        <Fact
          title="Closing"
          value={money(d.cashFlow.closingMinor, d.currencyCode)}
        />
        <Fact
          title="Operating"
          value={money(d.cashFlow.operatingMinor, d.currencyCode)}
        />
        <Fact
          title="Financing"
          value={money(d.cashFlow.financingMinor, d.currencyCode)}
        />
        <Fact
          title="Transfers and clearing movement"
          value={money(d.cashFlow.transfersAndClearingMinor, d.currencyCode)}
        />
        <Fact
          title="Opening adjustments"
          value={money(d.cashFlow.openingAdjustmentsMinor, d.currencyCode)}
        />
        <Fact
          title="Unclassified movement"
          value={money(d.cashFlow.unclassifiedMinor, d.currencyCode)}
        />
        <Fact
          title="Cash-flow difference"
          value={money(d.cashFlow.differenceMinor, d.currencyCode)}
        />
        <Text>
          Movement classification:{" "}
          {d.cashFlow.classificationComplete
            ? "complete for these posted groups"
            : "contains unclassified posted groups"}
          . This does not certify underlying source reconciliation.
        </Text>
      </Section>
      <Section title="Known coverage limits">
        <Text>
          {c.coverageGaps.length
            ? c.coverageGaps.map(label).join(" · ")
            : "No additional gaps returned."}
        </Text>
        <Text>
          Unresolved reviews remain open even if a date lock would be eligible.
          This read does not adjust balances, reverse journals, close/reopen
          periods, change stock or certify a fully reconciled business.
        </Text>
      </Section>
    </>
  )
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ListCard>
      <View className="gap-3 py-3">
        <Text
          accessibilityRole="header"
          className="text-lg font-bold text-foreground"
        >
          {title}
        </Text>
        {children}
      </View>
    </ListCard>
  )
}
function Fact({ title, value }: { title: string; value: string }) {
  return (
    <View className="gap-1">
      <Text className="text-xs text-muted-foreground">{title}</Text>
      <Text className="text-sm font-medium text-foreground">{value}</Text>
    </View>
  )
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <View className="p-5">
      <Text accessibilityRole="alert">{children}</Text>
    </View>
  )
}
