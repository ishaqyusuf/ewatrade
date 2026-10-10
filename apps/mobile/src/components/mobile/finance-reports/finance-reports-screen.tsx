import { ActionButton } from "@/components/mobile/action-button"
import { DetailSkeleton } from "@/components/mobile/loading-skeletons"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { prepareFinanceStatementRange } from "@/lib/finance-money-input"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { ScrollView, View } from "react-native"
import { FinanceBankDateField } from "../finance/finance-bank-date-field"
import { financeDisplayDate } from "../finance/finance-display"
import { FinanceFormBody } from "../finance/finance-form-body"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "../finance/finance-workspace-gate"
import { HeroCard } from "../green-till/hero-card"
import { type FinanceReport, buildFinanceReportCsv } from "./report-csv"
import { ReportExportActions } from "./report-export-actions"
import { ReportAmount, ReportSection } from "./report-section"

type ReportWindow = { from: Date; through: Date; revision: number }
export function FinanceReportsScreen() {
  return (
    <FinanceWorkspaceGate requireOnline>
      {(workspace) => (
        <ReportsWorkspace
          key={`${workspace.actorUserId}:${workspace.tenantId}:${workspace.book.id}`}
          {...workspace}
        />
      )}
    </FinanceWorkspaceGate>
  )
}
function ReportsWorkspace({ book }: FinanceWorkspace) {
  const [window, setWindow] = useState<ReportWindow>(() => ({
    ...prepareFinanceStatementRange(
      book.startsAt.toISOString().slice(0, 10),
      new Date().toISOString().slice(0, 10),
      book.startsAt,
    ),
    revision: 0,
  }))
  return (
    <ReportWindowView
      key={`${window.from.toISOString()}:${window.through.toISOString()}:${window.revision}`}
      book={book}
      window={window}
      onWindow={setWindow}
    />
  )
}
function ReportWindowView({
  book,
  window,
  onWindow,
}: {
  book: FinanceWorkspace["book"]
  window: ReportWindow
  onWindow: (value: ReportWindow) => void
}) {
  const trpc = useTRPC()
  const [editing, setEditing] = useState(false)
  const [showCoverage, setShowCoverage] = useState(false)
  const [from, setFrom] = useState(window.from.toISOString().slice(0, 10))
  const [through, setThrough] = useState(
    window.through.toISOString().slice(0, 10),
  )
  const [error, setError] = useState<string>()
  const [report, setReport] = useState<FinanceReport>()
  const query = useQuery(
    trpc.finance.reports.queryOptions(
      { bookId: book.id, from: window.from, through: window.through },
      {
        retry: false,
        staleTime: 0,
        refetchOnMount: "always",
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    ),
  )
  // Freeze only the completed mount read. Explicit refresh/date changes remount this view.
  useEffect(() => {
    if (!report && query.data && !query.isFetching && !query.isError)
      setReport(query.data)
  }, [report, query.data, query.isFetching, query.isError])
  if (editing)
    return (
      <FinanceFormBody>
        <Text className="text-xl font-bold">Report dates</Text>
        <Text className="text-sm text-muted-foreground">
          UTC dates on or after bookkeeping began. Applying dates starts a new
          snapshot.
        </Text>
        <FinanceBankDateField
          label="From"
          value={from}
          onChange={setFrom}
          minimum={new Date(book.startsAt).toISOString().slice(0, 10)}
          maximum={new Date().toISOString().slice(0, 10)}
        />
        <FinanceBankDateField
          label="Through"
          value={through}
          onChange={setThrough}
          minimum={new Date(book.startsAt).toISOString().slice(0, 10)}
          maximum={new Date().toISOString().slice(0, 10)}
        />
        {error ? <StatusBanner message={error} tone="destructive" /> : null}
        <ActionButton
          onPress={() => {
            try {
              onWindow({
                ...prepareFinanceStatementRange(from, through, book.startsAt),
                revision: window.revision + 1,
              })
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Check report dates.",
              )
            }
          }}
        >
          Apply dates
        </ActionButton>
        <ActionButton variant="outline" onPress={() => setEditing(false)}>
          Back to reports
        </ActionButton>
      </FinanceFormBody>
    )
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        paddingHorizontal: 18,
        paddingBottom: 48,
        gap: 16,
      }}
    >
      <Text className="text-sm text-muted-foreground">
        {financeDisplayDate(window.from)} – {financeDisplayDate(window.through)}{" "}
        · UTC
      </Text>
      {report ? (
        <HeroCard
          label="Net, recorded entries"
          amount={formatFinanceMoney(
            report.profitAndLoss.netProfitMinor,
            report.currencyCode,
          )}
          sub="Not your complete business profit"
          pill={{ label: "Partial records", tone: "draft" }}
          stats={[
            {
              label: "Revenue",
              value: formatFinanceMoney(
                report.profitAndLoss.revenueMinor,
                report.currencyCode,
              ),
            },
            {
              label: "Expenses",
              value: formatFinanceMoney(
                report.profitAndLoss.expensesMinor,
                report.currencyCode,
              ),
            },
            {
              label: "Closing cash",
              value: formatFinanceMoney(
                report.cashFlow.closingMinor,
                report.currencyCode,
              ),
            },
          ]}
        />
      ) : !query.isError ? (
        <Skeleton className="h-44 rounded-[26px]" />
      ) : null}
      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-[140px] flex-1">
          <ActionButton
            icon="Calendar"
            variant="outline"
            onPress={() => setEditing(true)}
          >
            Change dates
          </ActionButton>
        </View>
        <View className="min-w-[140px] flex-1">
          <ActionButton
            icon="RefreshCw"
            variant="outline"
            disabled={query.isFetching}
            onPress={() =>
              onWindow({ ...window, revision: window.revision + 1 })
            }
          >
            Refresh report
          </ActionButton>
        </View>
      </View>
      <StatusBanner
        title="Partial financial records"
        message="Sales, payments, stock costs and opening balances are incomplete. These totals aren’t your full profit or financial position."
        tone="warning"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showCoverage }}
        className="min-h-11 flex-row items-center justify-between gap-3"
        onPress={() => setShowCoverage(!showCoverage)}
      >
        <Text className="text-sm font-semibold text-primary">
          What’s included in this report
        </Text>
        <Icon
          name={showCoverage ? "ChevronUp" : "ChevronDown"}
          className="size-[16px] text-primary"
        />
      </Pressable>
      {showCoverage ? (
        <View className="gap-2 rounded-2xl bg-card p-4">
          <Text className="text-sm leading-5 text-muted-foreground">
            Posted finance entries only. Automatic Commerce posting is off.
            Refresh to include newer entries; changing dates starts a new
            snapshot.
          </Text>
          {report ? (
            <Text className="text-xs leading-5 text-muted-foreground">
              {report.currencyCode} · Snapshot {report.snapshotSequence}
              {"\n"}Coverage:{" "}
              {report.coverage.replaceAll("_", " ").toLowerCase()}
              {"\n"}Missing coverage:{" "}
              {report.coverageGaps
                .map((gap) => gap.replaceAll("_", " ").toLowerCase())
                .join(", ")}
            </Text>
          ) : null}
        </View>
      ) : null}
      {!report && query.isError ? (
        <StatusBanner
          title="Reports unavailable"
          message={query.error.message}
          tone="destructive"
          actionLabel="Try again"
          onActionPress={() => void query.refetch()}
        />
      ) : null}
      {report ? (
        <ReportContents report={report} />
      ) : query.isError ? (
        <Text>Reports could not be loaded.</Text>
      ) : (
        <DetailSkeleton label="Loading report snapshot" rows={4} />
      )}
    </ScrollView>
  )
}
function ReportContents({ report }: { report: FinanceReport }) {
  const router = useRouter()
  const amount = (label: string, value: string) => (
    <ReportAmount
      key={label}
      label={label}
      amount={value}
      currency={report.currencyCode}
    />
  )
  const account = (
    id: string,
    label: string,
    value: string,
    cumulative = false,
  ) => (
    <ReportAmount
      key={id}
      label={`${label} ›`}
      amount={value}
      currency={report.currencyCode}
      onPress={() =>
        router.push({
          pathname: "/finance-report-account/[accountId]",
          params: {
            accountId: id,
            from: (cumulative
              ? report.bookkeepingStartsAt
              : report.from
            ).toISOString(),
            through: report.through.toISOString(),
            snapshot: report.snapshotSequence,
          },
        } as Href)
      }
    />
  )
  const p = report.profitAndLoss
  const c = report.cashFlow
  const b = report.balanceSheet
  const t = report.trialBalance
  return (
    <View className="gap-6">
      <ReportExportActions
        filename={`finance-report-${report.through.toISOString().slice(0, 10)}-snapshot-${report.snapshotSequence}.csv`}
        build={async () => buildFinanceReportCsv(report)}
      />
      <ReportSection title="Profit and loss — recorded entries">
        {[
          ["Revenue", p.revenueMinor],
          ["Cost of sales", p.costOfSalesMinor],
          ["Gross profit", p.grossProfitMinor],
          ["Other expenses", p.expensesMinor],
          ["Net profit / loss", p.netProfitMinor],
        ].map(([label, value]) => amount(label ?? "", value ?? "0"))}
        {p.accounts.map((a) =>
          account(a.accountId, `${a.code} · ${a.name}`, a.periodBalanceMinor),
        )}
      </ReportSection>
      <ReportSection title="Cash flow — cash and bank">
        <Text className="text-sm text-muted-foreground">
          Clearing excluded. Internal transfers cancel. Owner-paid bills do not
          move business cash.
        </Text>
        {[
          ["Opening cash and bank", c.openingMinor],
          ["Operating movement", c.operatingMinor],
          ["Owner financing", c.financingMinor],
          ["Transfers and clearing", c.transfersAndClearingMinor],
          ["Opening imports", c.openingAdjustmentsMinor],
          ["Unclassified movement", c.unclassifiedMinor],
          ["Net change", c.netChangeMinor],
          ["Closing cash and bank", c.closingMinor],
          ["Reconciliation difference", c.differenceMinor],
        ].map(([label, value]) => amount(label ?? "", value ?? "0"))}
        {!c.classificationComplete ? (
          <StatusBanner
            message="Some cash entries need classification before relying on category totals."
            tone="warning"
          />
        ) : null}
        {!c.reconciled ? (
          <StatusBanner
            message="Cash flow does not reconcile. Review the difference."
            tone="destructive"
          />
        ) : null}
        {c.groups.map((g) =>
          amount(`${g.sourceKind} · ${g.category}`, g.netMinor),
        )}
      </ReportSection>
      <ReportSection title="Balance sheet — recorded entries">
        <Text className="text-sm text-muted-foreground">
          Cumulative through-date balances. Unclosed earnings are independent of
          the P&L start date.
        </Text>
        {[
          { title: "Assets", values: b.assets, total: b.assetsMinor },
          {
            title: "Liabilities",
            values: b.liabilities,
            total: b.liabilitiesMinor,
          },
          {
            title: "Posted equity",
            values: b.equity,
            total: b.postedEquityMinor,
          },
        ].map((g) => (
          <View key={g.title} className="gap-2">
            {amount(g.title, g.total)}
            {g.values.map((a) =>
              account(
                a.accountId,
                `${a.code} · ${a.name}`,
                a.closingBalanceMinor,
                true,
              ),
            )}
          </View>
        ))}
        {amount("Unclosed earnings", b.unclosedEarningsMinor)}
        {amount("Total equity", b.totalEquityMinor)}
        {amount("Liabilities and equity", b.liabilitiesAndEquityMinor)}
        {amount("Equation difference", b.differenceMinor)}
        {!b.balanced ? (
          <StatusBanner
            message="Balance sheet does not balance. Review the journal difference."
            tone="destructive"
          />
        ) : null}
      </ReportSection>
      <ReportSection title="Trial balance">
        <Text className="text-sm text-muted-foreground">
          Equal debits and credits confirm journal balance; they do not prove
          complete records.
        </Text>
        {t.accounts.map((a) => (
          <View key={a.accountId}>
            {account(
              a.accountId,
              `${a.code} · ${a.name}`,
              a.closingBalanceMinor,
              true,
            )}
            {amount("Debit", a.closingDebitMinor)}
            {amount("Credit", a.closingCreditMinor)}
          </View>
        ))}
        {amount("Total debits", t.debitMinor)}
        {amount("Total credits", t.creditMinor)}
        {amount("Journal difference", t.differenceMinor)}
        {!t.balanced ? (
          <StatusBanner
            message="Trial balance does not balance. Resolve the journal difference."
            tone="destructive"
          />
        ) : null}
      </ReportSection>
    </View>
  )
}
