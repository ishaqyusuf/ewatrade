import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { RefreshControl, ScrollView } from "react-native"
import { REPORTS_COPY, buildReportsPresentation } from "./reports-presentation"

const OPERATION_ICONS = {
  inventory: "Warehouse",
  pending: "RefreshCw",
  service: "Wrench",
} as const satisfies Record<string, IconKeys>

export function ReportsContent({
  onComplete,
  presentation = "sheet",
}: {
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}) {
  const colors = useColors()
  const trpc = useTRPC()
  const balances = useQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: true },
      { retry: false },
    ),
  )
  const reconciliation = useQuery(
    trpc.inventory.reconciliationReport.queryOptions({}, { retry: false }),
  )
  const services = useQuery(
    trpc.serviceReporting.summary.queryOptions({}, { retry: false }),
  )
  const orders = useQuery(
    trpc.orders.reportSummary.queryOptions(undefined, { retry: false }),
  )
  const reportQueries = [balances, reconciliation, services, orders] as const
  const failedQueries = reportQueries.filter((query) => query.isError)
  const isInitialLoading = reportQueries.some(
    (query) => query.isPending && query.data === undefined,
  )
  const isRefreshing = reportQueries.some((query) => query.isRefetching)
  const orderCount = orders.data?.orderCount ?? 0
  const orderValueMinor = orders.data?.orderValueMinor ?? 0
  const currency = orders.data?.currencyCode ?? "NGN"
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
    await Promise.all(reportQueries.map((query) => query.refetch()))
  }

  async function retryFailedReports() {
    await Promise.all(failedQueries.map((query) => query.refetch()))
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        gap: 20,
        paddingBottom: 48,
        paddingHorizontal: 20,
      }}
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          onRefresh={() => void refreshReports()}
          progressBackgroundColor={colors.card}
          refreshing={isRefreshing}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-sm leading-5 text-muted-foreground">
        {REPORTS_COPY.purpose}
      </Text>

      {isInitialLoading ? (
        <StatusBanner
          icon="RefreshCw"
          message="Reading current orders and operational records."
          title="Loading reports"
          tone="muted"
        />
      ) : (
        <>
          {failedQueries.length > 0 ? (
            <StatusBanner
              actionLabel="Try again"
              icon="AlertCircle"
              message="Some report sources could not be loaded. Available values remain visible below."
              onActionPress={() => void retryFailedReports()}
              title="Reports incomplete"
              tone="destructive"
            />
          ) : null}

          <View className="gap-2">
            <Text className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
              Store snapshot
            </Text>
            <View className="flex-row border-y border-border">
              <View className="min-w-0 flex-[1.5] py-4 pr-4">
                <Text className="text-xs text-muted-foreground">
                  Order value
                </Text>
                <Text
                  className="mt-1 text-3xl font-extrabold tracking-tight text-foreground"
                  numberOfLines={1}
                >
                  {formatMinorMoney(orderValueMinor, currency)}
                </Text>
              </View>
              <View className="min-w-0 flex-1 border-l border-border py-4 pl-4">
                <Text className="text-xs text-muted-foreground">Orders</Text>
                <Text className="mt-1 text-2xl font-extrabold text-foreground">
                  {orderCount}
                </Text>
              </View>
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-lg font-extrabold text-foreground">
              Operations
            </Text>
            <View>
              {report.operations.map((item) => (
                <View
                  className="min-h-16 flex-row items-center gap-3 border-t border-border py-3 last:border-b"
                  key={item.id}
                >
                  <View className="size-10 items-center justify-center rounded-full bg-muted">
                    <Icon
                      className="size-sm text-primary"
                      name={OPERATION_ICONS[item.id]}
                    />
                  </View>
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="font-extrabold text-foreground">
                      {item.label}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {item.detail}
                    </Text>
                  </View>
                  <Text className="text-sm font-extrabold text-foreground">
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {report.isEmpty && failedQueries.length === 0 ? (
            <EmptyState
              className="border-y border-border px-0 py-6"
              icon="analytics"
              message={REPORTS_COPY.emptyMessage}
              title={REPORTS_COPY.emptyTitle}
              variant="flat"
            />
          ) : null}

          <StatusBanner
            icon="Info"
            message={REPORTS_COPY.boundaryMessage}
            title={REPORTS_COPY.boundaryTitle}
            tone="muted"
          />
        </>
      )}

      {presentation === "sheet" && onComplete ? (
        <ActionButton onPress={onComplete} variant="outline">
          Done
        </ActionButton>
      ) : null}
    </ScrollView>
  )
}
