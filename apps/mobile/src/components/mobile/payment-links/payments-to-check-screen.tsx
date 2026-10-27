import { EmptyState } from "@/components/mobile/empty-state"
import {
  RecordRow,
  RowDivider,
  StatusPill,
} from "@/components/mobile/green-till/kit"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQueries } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { FlatList } from "react-native"
import { ageLabel, errorCode } from "./payment-link-model"
import { InfoNote } from "./payment-link-parts"
import { usePaymentScreenActive } from "./use-payment-screen-active"

const PAGE_SIZE = 20

/** Customer claims ("I have paid") waiting for the business to check its bank. */
export function PaymentsToCheckScreen() {
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const isScreenActive = usePaymentScreenActive()
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [firstGeneration, setFirstGeneration] = useState<string | null>(null)
  const pages = useQueries({
    queries: cursors.map((beforeId) =>
      trpc.businessBanking.pendingReports.queryOptions(
        { beforeId, limit: PAGE_SIZE },
        {
          enabled: isScreenActive && !offline,
          retry: false,
          staleTime: 0,
          gcTime: 0,
          refetchOnMount: "always",
          refetchInterval:
            beforeId === undefined && isScreenActive && !offline
              ? 30_000
              : false,
        },
      ),
    ),
  })
  const first = pages[0]
  // The head page's content, not its fetch time: an unchanged 30s poll keeps
  // the older pages the merchant has scrolled to.
  const firstSignature = first?.isSuccess
    ? [
        ...first.data.items.map((item) => `${item.id}:${item.revision}`),
        first.data.nextCursor ?? "",
      ].join(",")
    : null
  const firstPageChanged =
    firstSignature !== null && firstSignature !== firstGeneration
  // A changed head page invalidates every previous cursor snapshot (new or
  // reviewed claims shift the cursor). Exclude old rows immediately; the
  // effect then retires their query observers once.
  const currentPages = firstPageChanged ? pages.slice(0, 1) : pages
  useEffect(() => {
    if (firstSignature === null) return
    setFirstGeneration(firstSignature)
    setCursors((current) => (current.length > 1 ? [undefined] : current))
  }, [firstSignature])
  const last = currentPages.at(-1)
  const canShowRows =
    isScreenActive &&
    !offline &&
    first?.isSuccess &&
    !currentPages.some((page) => page.isError)
  const seen = new Set<string>()
  const rows = (canShowRows ? currentPages : [])
    .flatMap((page) => page.data?.items ?? [])
    .filter((item) => (seen.has(item.id) ? false : seen.add(item.id)))
  const nextCursor = last?.data?.nextCursor ?? null
  const failure = currentPages.find((page) => page.isError)?.error
  const refreshing = currentPages.some((page) => page.isRefetching)
  function refresh() {
    if (!isScreenActive || useOperationalModeStore.getState().isOfflineMode)
      return
    setCursors([undefined])
    void first?.refetch()
  }
  return (
    <FlatList
      className="flex-1"
      contentContainerClassName="px-[18px] pb-12"
      data={rows}
      keyExtractor={(item) => item.id}
      refreshing={refreshing}
      onRefresh={offline || !isScreenActive ? undefined : refresh}
      onEndReached={() => {
        if (
          canShowRows &&
          !firstPageChanged &&
          !useOperationalModeStore.getState().isOfflineMode &&
          nextCursor &&
          !last?.isFetching &&
          !cursors.includes(nextCursor)
        )
          setCursors((value) => [...value, nextCursor])
      }}
      onEndReachedThreshold={0.35}
      ListHeaderComponent={
        <View className="gap-4 pb-4">
          {offline ? (
            <StatusBanner
              icon="WifiOff"
              title="Offline"
              message="Reconnect to see payments customers say they made."
              tone="warning"
            />
          ) : null}
          {failure ? (
            <StatusBanner
              icon="AlertCircle"
              title={
                errorCode(failure) === "FORBIDDEN"
                  ? "Not permitted"
                  : "Payments to check unavailable"
              }
              message={
                errorCode(failure) === "FORBIDDEN"
                  ? "Only staff who can take payments on orders can check customer payments."
                  : failure.message
              }
              tone="destructive"
              actionLabel={
                errorCode(failure) === "FORBIDDEN" ? undefined : "Try again"
              }
              onActionPress={refresh}
            />
          ) : null}
          <InfoNote>
            Customers who tapped I have paid. Check your bank app first. Nothing
            is recorded until you confirm.
          </InfoNote>
        </View>
      }
      ListEmptyComponent={
        failure || offline ? null : first?.isPending ? (
          <ListSkeleton
            count={4}
            label="Loading payments to check"
            variant="ledger"
          />
        ) : (
          <EmptyState
            icon="CircleCheck"
            title="Nothing to check"
            message="When a customer taps I have paid on a payment link, it shows here."
          />
        )
      }
      ListFooterComponent={
        last?.isFetching && cursors.length > 1 ? (
          <Skeleton className="mt-3 h-20 rounded-[20px]" />
        ) : rows.length && !nextCursor ? (
          <Text className="mt-4 text-center text-xs text-muted-foreground">
            All payments to check shown
          </Text>
        ) : null
      }
      renderItem={({ item, index }) => {
        const lastRow = index === rows.length - 1
        return (
          <View
            className={cn(
              "overflow-hidden bg-card px-3.5",
              index === 0 && "rounded-t-[20px]",
              lastRow && "rounded-b-[20px]",
            )}
          >
            <RecordRow
              stackDetails
              title={item.payerName}
              meta={`${item.orderNumber} · ${ageLabel(item.submittedAt ?? new Date())}`}
              amount={formatMinorMoney(item.amountMinor, item.currencyCode)}
              avatar={{ icon: "Building2", tint: "amber" }}
              status={<StatusPill label="To check" tone="warn" />}
              onPress={() =>
                router.push({
                  pathname: "/payment-report/[reportId]",
                  params: { reportId: item.id },
                } as Href)
              }
            />
            {lastRow ? null : <RowDivider />}
          </View>
        )
      }}
    />
  )
}
