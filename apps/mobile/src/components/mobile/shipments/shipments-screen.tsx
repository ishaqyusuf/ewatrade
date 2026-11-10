import { ActionButton } from "@/components/mobile/action-button"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import { SHIPMENT_STATUS_LABELS } from "@ewatrade/utils/shipments"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { ScrollView, View } from "react-native"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "../finance/finance-workspace-gate"
import { ListCard, RecordRow, StatusPill } from "../green-till/kit"
import { SHIPMENT_PILL_TONE, useCurrentStoreId } from "./shipment-data"

export function ShipmentsScreen() {
  return (
    <FinanceWorkspaceGate requireOnline>
      {(workspace) => <ShipmentList key={workspace.book.id} {...workspace} />}
    </FinanceWorkspaceGate>
  )
}

function ShipmentList({ book }: FinanceWorkspace) {
  const trpc = useTRPC()
  const router = useRouter()
  const storeId = useCurrentStoreId()
  const list = useQuery(
    trpc.finance.shipments.list.queryOptions(
      { bookId: book.id, limit: 50 },
      { retry: false },
    ),
  )
  const rows = (list.data?.items ?? []).filter(
    (row) => !storeId || row.storeId === storeId,
  )
  const open = (shipmentId: string) =>
    router.push({
      pathname: "/shipment/[shipmentId]",
      params: { shipmentId },
    } as Href)

  return (
    <View className="flex-1">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 120 }}
      >
        <View className="gap-4">
          <Text className="text-sm text-muted-foreground">
            Goods ordered from suppliers. Stock goes up only when you record
            what arrived.
          </Text>
          {list.isError ? (
            <StatusBanner
              message={list.error.message}
              tone="destructive"
              actionLabel="Try again"
              onActionPress={() => void list.refetch()}
            />
          ) : list.isPending ? (
            <ListSkeleton
              count={3}
              label="Loading shipments"
              variant="ledger"
            />
          ) : rows.length ? (
            <ListCard>
              {rows.map((row) => (
                <RecordRow
                  key={row.id}
                  avatar={{ icon: "Truck", tint: "mint" }}
                  title={row.name}
                  meta={[
                    row.supplierName,
                    row.outstandingLineCount
                      ? `${row.outstandingLineCount} of ${row.lineCount} items to come`
                      : `${row.lineCount} items all in`,
                  ]}
                  status={
                    <StatusPill
                      label={SHIPMENT_STATUS_LABELS[row.status]}
                      tone={SHIPMENT_PILL_TONE[row.status]}
                    />
                  }
                  onPress={() => open(row.id)}
                />
              ))}
            </ListCard>
          ) : (
            <Text className="rounded-[20px] bg-card p-4 text-sm leading-6 text-muted-foreground">
              No shipments yet. Add one when you order goods from a supplier.
            </Text>
          )}
        </View>
      </ScrollView>
      <View className="absolute inset-x-0 bottom-0 px-[18px] pb-8">
        <ActionButton icon="Plus" onPress={() => open("new")}>
          New shipment
        </ActionButton>
      </View>
    </View>
  )
}
