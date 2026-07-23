import { ActionButton } from "@/components/mobile/action-button"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { ScrollView, View } from "react-native"

export function ReportsContent({ onComplete, presentation: _presentation }: { onComplete?: () => void; presentation?: "screen" | "sheet" }) {
  const trpc = useTRPC()
  const balances = useQuery(trpc.inventory.balanceReport.queryOptions({ includeCompatibleTotals: true }, { retry: false }))
  const reconciliation = useQuery(trpc.inventory.reconciliationReport.queryOptions({}, { retry: false }))
  const services = useQuery(trpc.serviceReporting.summary.queryOptions({}, { retry: false }))
  const orders = useQuery(trpc.orders.list.queryOptions({ limit: 100 }, { retry: false }))
  const error = balances.error ?? reconciliation.error ?? services.error ?? orders.error
  const rows = orders.data ?? []
  const revenue = rows.reduce((total, order) => total + order.totalMinor, 0)
  const currency = rows[0]?.currencyCode ?? "NGN"
  return <ScrollView className="flex-1" contentContainerClassName="gap-6 px-4 pb-12" refreshControl={<QueryRefreshControl />}>{error ? <StatusBanner icon="AlertCircle" message={error.message} title="Reports unavailable" tone="destructive" /> : null}<View className="flex-row flex-wrap gap-3"><Metric icon="Receipt" label="Orders" value={String(rows.length)} /><Metric icon="Wallet" label="Order value" value={formatMinorMoney(revenue, currency)} /><Metric icon="Warehouse" label="Balance sources" value={String(balances.data?.rows.length ?? 0)} /><Metric icon="Wind" label="Provisional" value={String(reconciliation.data?.provisionalCommands ?? 0)} /></View><View className="gap-3"><Text className="text-lg font-extrabold text-foreground">Service work</Text><View className="flex-row flex-wrap gap-3"><Metric icon="Wrench" label="WIP" value={String(services.data?.work.wip ?? 0)} /><Metric icon="CheckCircle2" label="Ready" value={String(services.data?.work.ready ?? 0)} /><Metric icon="TriangleAlert" label="Blocked" value={String(services.data?.work.blocked ?? 0)} /><Metric icon="Clock" label="Overdue" value={String(services.data?.work.overdueJobs ?? 0)} /></View></View><StatusBanner icon="Info" message="Compatible canonical totals are informational and never become automatic fulfillment availability. Exports use exact strings and posted snapshots." title="Reporting boundary" />{onComplete ? <ActionButton onPress={onComplete} variant="outline">Done</ActionButton> : null}</ScrollView>
}

function Metric({ icon, label, value }: { icon: IconKeys; label: string; value: string }) {
  return <View className="min-w-[46%] flex-1 gap-3 rounded-3xl bg-muted/60 p-4"><Icon className="size-sm text-primary" name={icon} /><View><Text className="text-xl font-extrabold text-foreground" numberOfLines={1}>{value}</Text><Text className="text-xs text-muted-foreground">{label}</Text></View></View>
}
