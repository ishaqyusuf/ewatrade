import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useColors } from "@/hooks/use-color"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useMemo, useState } from "react"
import { RefreshControl, ScrollView } from "react-native"
import { ClassicOrdersFilterRow } from "./appearances/classic/orders-screen"
import { HeroCard } from "./green-till/hero-card"
import {
  type AttentionItem,
  AttentionRail,
  ListCard,
  RecordRow,
  SectionHeader,
} from "./green-till/kit"
import { paymentTint } from "./payment-display"
import type { PaymentMethodFilter } from "./payment-methods"
import {
  REPORT_PERIODS,
  REPORT_PERIOD_LABELS,
  type ReportPeriod,
  buildReportPeriodFigures,
  reportPeriodRange,
  reportPeriodWindow,
} from "./report-periods"
import { REPORTS_COPY, buildReportsPresentation } from "./reports-presentation"

const METHOD_ICONS = {
  bank_transfer: "ArrowLeftRight",
  card: "CreditCard",
  cash: "Wallet",
  other: "CreditCard",
  pos: "CreditCard",
} as const satisfies Record<PaymentMethodFilter, IconKeys>

const OPERATION_ICONS = {
  inventory: "Warehouse",
  pending: "Clock",
  service: "Wrench",
} as const satisfies Record<string, IconKeys>

export function ReportsContent(props: {
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}) {
  const { profile } = useAuthContext()
  if (
    profile?.staffAccessMode === "SCOPED" &&
    profile.role?.toUpperCase() === "MANAGER"
  )
    return (
      <StatusBanner
        title="Reports access required"
        message="Your Store role includes Payments received. Ask the owner about report access."
        tone="warning"
      />
    )
  return <OperationalReportsContent {...props} />
}
function OperationalReportsContent({
  onComplete,
  presentation = "sheet",
}: {
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}) {
  const router = useRouter()
  const { profile } = useAuthContext()
  // Financial reports are Owner/Admin only, like the More Finance tile.
  const canOpenFinance = ["OWNER", "ADMIN"].includes(
    profile?.role?.trim().toUpperCase() ?? "",
  )
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const colors = useColors()
  const trpc = useTRPC()
  const balances = useQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: true },
      { retry: false, enabled: !offline },
    ),
  )
  const reconciliation = useQuery(
    trpc.inventory.reconciliationReport.queryOptions(
      {},
      { retry: false, enabled: !offline },
    ),
  )
  const services = useQuery(
    trpc.serviceReporting.summary.queryOptions(
      {},
      { retry: false, enabled: !offline },
    ),
  )
  const orders = useQuery(
    trpc.orders.reportSummary.queryOptions(undefined, {
      retry: false,
      enabled: !offline,
    }),
  )
  // Period figures are exact server totals: Orders made in the period and
  // payments recorded in it.
  const [period, setPeriod] = useState<ReportPeriod>("week")
  const periodWindow = useMemo(() => reportPeriodWindow(period), [period])
  const periodOrders = useQuery(
    trpc.orders.listTotals.queryOptions(
      periodWindow
        ? {
            createdAfter: periodWindow.after,
            createdBefore: periodWindow.before,
          }
        : {},
      { retry: false, enabled: !offline },
    ),
  )
  const periodPayments = useQuery(
    trpc.orders.paymentTotals.queryOptions(
      periodWindow
        ? {
            recordedAfter: periodWindow.after,
            recordedBefore: periodWindow.before,
          }
        : {},
      { retry: false, enabled: !offline },
    ),
  )
  const reportQueries = [
    balances,
    reconciliation,
    services,
    orders,
    periodOrders,
    periodPayments,
  ] as const
  const failedQueries = reportQueries.filter((query) => query.isError)
  const isInitialLoading = reportQueries.some(
    (query) => query.isPending && query.data === undefined,
  )
  const isRefreshing = reportQueries.some((query) => query.isRefetching)
  const orderCount = orders.data?.orderCount ?? 0
  const orderValueMinor = orders.data?.orderValueMinor ?? 0
  const currency = orders.data?.currencyCode ?? "NGN"
  const figures = buildReportPeriodFigures({
    defaultCurrencyCode: currency,
    orderGroups: periodOrders.data?.groups ?? [],
    payments: periodPayments.data?.currencyTotals ?? [],
  })
  const periodWords =
    period === "all" ? "all time" : REPORT_PERIOD_LABELS[period].toLowerCase()
  const report = buildReportsPresentation({
    balanceSources: balances.data?.rows.length ?? 0,
    orderCount,
    orderValueMinor,
    provisionalCommands: reconciliation.data?.provisionalCommands ?? 0,
    service: {
      blocked: services.data?.work.blocked ?? 0,
      overdueJobs: services.data?.work.overdueJobs ?? 0,
      ready: services.data?.work.ready ?? 0,
      wip: services.data?.work.wip ?? 0,
    },
  })

  async function refreshReports() {
    if (offline) return
    await Promise.all(reportQueries.map((query) => query.refetch()))
  }

  async function retryFailedReports() {
    if (offline) return
    await Promise.all(failedQueries.map((query) => query.refetch()))
  }

  const attention: AttentionItem[] = []
  if (reconciliation.data?.provisionalCommands)
    attention.push({
      key: "sync",
      icon: "RefreshCw",
      tint: "amber",
      title: `${reconciliation.data.provisionalCommands} pending records`,
      sub: "Review sync activity",
      onPress: () => router.push("/sync-status-modal"),
    })
  if (services.data?.work.overdueJobs)
    attention.push({
      key: "service",
      icon: "Wrench",
      tint: "rose",
      title: `${services.data.work.overdueJobs} overdue jobs`,
      sub: "Open service work",
      onPress: () => router.push("/service-jobs-modal" as Href),
    })
  const operationSources = {
    inventory: balances,
    pending: reconciliation,
    service: services,
  }
  const operationRoutes = {
    inventory: "/stock-intake-modal",
    pending: "/sync-status-modal",
    service: "/service-jobs-modal",
  } as const
  const oldestUpdate = Math.min(
    ...reportQueries.filter((q) => q.data).map((q) => q.dataUpdatedAt),
  )
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        gap: 16,
        paddingHorizontal: 18,
        paddingBottom: 48,
      }}
      refreshControl={
        offline ? undefined : (
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void refreshReports()}
            refreshing={isRefreshing}
            tintColor={colors.primary}
          />
        )
      }
    >
      {offline ? (
        <StatusBanner
          tone="warning"
          title="Offline reports"
          message={
            Number.isFinite(oldestUpdate)
              ? `Saved figures · as of ${new Date(oldestUpdate).toLocaleString()}`
              : "Reconnect to load reports."
          }
        />
      ) : null}
      {failedQueries.length ? (
        <StatusBanner
          actionLabel={offline ? undefined : "Try again"}
          title="Reports incomplete"
          message="Available values remain visible. Unavailable sources show —."
          tone="destructive"
          onActionPress={() => void retryFailedReports()}
        />
      ) : null}
      <ClassicOrdersFilterRow
        active={period}
        labels={REPORT_PERIOD_LABELS}
        onChange={setPeriod}
        values={REPORT_PERIODS}
      />
      {periodOrders.isPending && !offline ? (
        <Skeleton className="h-48 rounded-[22px]" />
      ) : (
        <HeroCard
          label={`Sales · ${periodWords}`}
          amount={periodOrders.data ? figures.sales : "—"}
          pill={{
            label: reportPeriodRange(period) ?? "Store snapshot",
            tone: "synced",
          }}
          sub={
            periodOrders.data
              ? `${figures.orderCount} order${figures.orderCount === 1 ? "" : "s"}${figures.average ? ` · average ${figures.average}` : ""}`
              : "Sales unavailable"
          }
          stats={[
            {
              label: "Received",
              value: periodPayments.data ? figures.received : "—",
            },
            {
              accent: true,
              label: "Still owed",
              value: periodOrders.data ? figures.owed : "—",
            },
          ]}
        />
      )}
      <View>
        <SectionHeader
          title={`Received ${periodWords}`}
          trailing={
            periodPayments.data ? (
              <Text className="text-xs font-bold text-muted-foreground">
                {figures.receivedCount}
              </Text>
            ) : undefined
          }
        />
        {periodPayments.data ? (
          figures.receivedRows.length ? (
            <ListCard>
              {figures.receivedRows.map((row) => (
                <RecordRow
                  stackDetails
                  key={row.key}
                  title={row.title}
                  meta={row.meta}
                  amount={row.amount}
                  avatar={{
                    icon: METHOD_ICONS[row.method],
                    tint: paymentTint(row.method.toUpperCase()),
                  }}
                  status={
                    <Icon
                      className="size-[16px]"
                      color={colors.mutedForeground}
                      name="ChevronRight"
                    />
                  }
                  onPress={() =>
                    router.push(
                      `/payments-received-modal?method=${row.method}` as Href,
                    )
                  }
                />
              ))}
            </ListCard>
          ) : (
            <Text className="px-0.5 text-sm text-muted-foreground">
              No payments recorded{" "}
              {periodWords === "all time" ? "yet" : periodWords}.
            </Text>
          )
        ) : periodPayments.isPending && !offline ? (
          <Skeleton className="h-24 rounded-[20px]" />
        ) : (
          <Text className="px-0.5 text-sm text-muted-foreground">
            Received totals unavailable.
          </Text>
        )}
      </View>
      {attention.length ? (
        <View>
          <SectionHeader
            title="Needs attention"
            trailing={
              <Text className="text-xs font-bold text-muted-foreground">
                {attention.length}
              </Text>
            }
          />
          <AttentionRail items={attention} />
        </View>
      ) : null}
      <View>
        <SectionHeader title="Operations" />
        <ListCard>
          {report.operations.map((item) => (
            <RecordRow
              stackDetails
              key={item.id}
              title={item.label}
              meta={
                operationSources[item.id].data
                  ? item.detail
                  : operationSources[item.id].isFetching
                    ? "Loading…"
                    : "Source unavailable"
              }
              amount={operationSources[item.id].data ? item.value : "—"}
              avatar={{
                icon: OPERATION_ICONS[item.id],
                tint:
                  item.id === "pending"
                    ? "amber"
                    : item.id === "service"
                      ? "lilac"
                      : "mint",
              }}
              onPress={() => router.push(operationRoutes[item.id] as Href)}
            />
          ))}
        </ListCard>
      </View>
      {canOpenFinance ? (
        <ListCard>
          <RecordRow
            title="Financial reports"
            meta="Profit and loss, cash flow, balance sheet"
            avatar={{ icon: "FileText", tint: "lilac" }}
            status={
              <Icon
                className="size-[16px]"
                color={colors.mutedForeground}
                name="ChevronRight"
              />
            }
            onPress={() => router.push("/finance-reports-modal" as Href)}
          />
        </ListCard>
      ) : null}
      {report.isEmpty && reportQueries.every((q) => q.data !== undefined) ? (
        <EmptyState
          icon="analytics"
          title={REPORTS_COPY.emptyTitle}
          message={REPORTS_COPY.emptyMessage}
        />
      ) : null}
      {[REPORTS_COPY.periodMessage, REPORTS_COPY.boundaryMessage].map(
        (message) => (
          <View className="flex-row gap-2 px-0.5" key={message}>
            <Icon
              className="mt-0.5 size-[14px]"
              color={colors.mutedForeground}
              name="Info"
            />
            <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
              {message}
            </Text>
          </View>
        ),
      )}
      {presentation === "sheet" && onComplete ? (
        <ActionButton variant="outline" onPress={onComplete}>
          Done
        </ActionButton>
      ) : null}
    </ScrollView>
  )
}
