import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { View } from "react-native"
import type { LedgerAccount } from "./types"

export function AllocationHistory({
  account,
  allocationId,
}: { account: LedgerAccount; allocationId: string }) {
  const trpc = useTRPC()
  const [expanded, setExpanded] = useState(false)
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const query = useQuery(
    trpc.customerLedger.allocationHistory.queryOptions(
      {
        accountId: account.id,
        allocationId,
        expectedRevision: account.revision,
        afterSequence: cursors.at(-1),
        limit: 20,
      },
      { enabled: expanded, retry: false },
    ),
  )
  return (
    <View className="gap-3">
      <ActionButton variant="outline" onPress={() => setExpanded((v) => !v)}>
        {expanded ? "Hide" : "View"} allocation history
      </ActionButton>
      {expanded ? (
        <View className="gap-3 border-l border-border pl-4">
          {query.isPending ? (
            <Text>Loading correction history…</Text>
          ) : query.isError ? (
            <StatusBanner
              message={query.error.message}
              tone="destructive"
              actionLabel="Try again"
              onActionPress={() => void query.refetch()}
            />
          ) : (
            <>
              <Text>
                Applied by {query.data.allocation.actorUserId} ·{" "}
                {new Date(query.data.allocation.createdAt).toISOString()}
              </Text>
              {query.data.reconciliationRequired ? (
                <StatusBanner
                  message="Release totals require reconciliation."
                  tone="destructive"
                />
              ) : null}
              {query.data.releases.map((release) => (
                <View key={release.id} className="gap-1">
                  <Text>
                    Release #{release.sequence} ·{" "}
                    {formatFinanceMoney(
                      release.amountMinor,
                      account.currencyCode,
                    )}
                  </Text>
                  <Text>{release.reason}</Text>
                  <Text className="text-sm text-muted-foreground">
                    Recorded by {release.actorUserId} ·{" "}
                    {new Date(release.createdAt).toISOString()}
                  </Text>
                  {release.orderSettlementReversal ? (
                    <Text>
                      Order settlement correction:{" "}
                      {release.orderSettlementReversal.orderId}
                    </Text>
                  ) : null}
                </View>
              ))}
              {!query.data.releases.length ? (
                <Text>No releases on this page.</Text>
              ) : null}
              <ActionButton
                variant="outline"
                disabled={cursors.length === 1 || query.isFetching}
                onPress={() => setCursors((v) => v.slice(0, -1))}
              >
                Previous releases
              </ActionButton>
              <ActionButton
                variant="outline"
                disabled={!query.data.nextCursor || query.isFetching}
                onPress={() =>
                  setCursors((v) => [...v, query.data?.nextCursor ?? undefined])
                }
              >
                More releases
              </ActionButton>
            </>
          )}
        </View>
      ) : null}
    </View>
  )
}
