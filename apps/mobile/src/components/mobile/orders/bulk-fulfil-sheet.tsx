import { ActionButton } from "@/components/mobile/action-button"
import type { CommercialOrder } from "@/components/mobile/commerce/commerce-model"
import { BulkReportList } from "@/components/mobile/list-selection/bulk-report"
import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { getOrderFulfilmentConfirmation } from "@/lib/order-action-sheet-model"
import { useTRPC } from "@/trpc/client"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useState } from "react"
import {
  type BulkFulfilOutcome,
  bulkFulfilDone,
  bulkFulfilFailed,
  bulkFulfilSummary,
  planBulkFulfil,
  plural,
} from "./bulk-fulfil-model"

type Plan = ReturnType<typeof planBulkFulfil<CommercialOrder>>

/** Ready lines the order overview's "Fulfil all" would commit. */
export function orderReadyLineCount(order: CommercialOrder) {
  const confirmation = getOrderFulfilmentConfirmation(order, { kind: "all" })
  return confirmation ? Number.parseInt(confirmation.summaryValue, 10) || 1 : 0
}

/**
 * Bulk Fulfil for the Orders list: confirm in a sheet, fulfil each ready
 * Order with its own call, then report every Order's result.
 */
export function useBulkFulfil({ onFinished }: { onFinished: () => void }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const modal = useModal()
  const mutation = useMutation(trpc.orders.fulfillProducts.mutationOptions())
  const [plan, setPlan] = useState<Plan | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [outcomes, setOutcomes] = useState<BulkFulfilOutcome[] | null>(null)

  const open = (orders: readonly CommercialOrder[]) => {
    if (running) return
    setPlan(planBulkFulfil(orders, orderReadyLineCount))
    setOutcomes(null)
    setProgress(0)
    modal.present()
  }

  const run = async () => {
    if (!plan || running || !plan.ready.length) return
    setRunning(true)
    const results: BulkFulfilOutcome[] = []
    for (const [index, entry] of plan.ready.entries()) {
      setProgress(index + 1)
      try {
        const result = await mutation.mutateAsync({
          clientOperationId: `fulfilment-all-${Crypto.randomUUID()}`,
          orderId: entry.order.id,
          schemaVersion: 1,
        })
        results.push(bulkFulfilDone(entry.order, result.fulfilledLineCount))
      } catch (error) {
        results.push(bulkFulfilFailed(entry.order, error))
      }
    }
    await Promise.all([
      queryClient.invalidateQueries(trpc.orders.get.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.timeline.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.listPage.pathFilter()),
      queryClient.invalidateQueries(trpc.orders.listTotals.pathFilter()),
      queryClient.invalidateQueries(trpc.catalog.listItems.queryFilter()),
      queryClient.invalidateQueries(trpc.catalog.listItemsPage.pathFilter()),
      queryClient.invalidateQueries(trpc.inventory.balanceReport.queryFilter()),
    ]).catch(() => undefined)
    setOutcomes([...results, ...plan.skipped])
    setRunning(false)
    onFinished()
  }

  return { modal, open, outcomes, plan, progress, run, running }
}

export type BulkFulfil = ReturnType<typeof useBulkFulfil>

export function BulkFulfilSheet({ fulfil }: { fulfil: BulkFulfil }) {
  const { modal, outcomes, plan, progress, running } = fulfil
  const ready = plan?.ready.length ?? 0
  const skipped = plan?.skipped.length ?? 0
  return (
    <Modal
      accessibilityLabel="Fulfil orders"
      enableDynamicSizing
      enablePanDownToClose={!running}
      hideHeader
      ref={modal.ref}
    >
      <BottomSheetScrollView showsVerticalScrollIndicator={false}>
        <View className="gap-4 px-5 pt-1 pb-6">
          {outcomes ? (
            <>
              <Text
                accessibilityRole="header"
                className="text-xl font-extrabold text-foreground"
              >
                {bulkFulfilSummary(outcomes)}
              </Text>
              <BulkReportList outcomes={outcomes} />
              <ActionButton onPress={modal.dismiss} testID="bulk-fulfil-done">
                Done
              </ActionButton>
            </>
          ) : (
            <>
              <View className="gap-1.5">
                <Text
                  accessibilityRole="header"
                  className="text-xl font-extrabold text-foreground"
                >
                  {`Fulfil ${plural(ready, "order", "orders")}?`}
                </Text>
                <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
                  {`Stock goes out for every ready line.${skipped ? ` ${plural(skipped, "selected order has", "selected orders have")} nothing ready and will be skipped.` : ""}`}
                </Text>
              </View>
              <View className="gap-2.5">
                <ActionButton
                  disabled={!ready}
                  icon="Package"
                  isLoading={running}
                  loadingLabel={`Fulfilling ${progress} of ${ready}…`}
                  onPress={() => void fulfil.run()}
                  testID="bulk-fulfil-confirm"
                >
                  {`Fulfil ${plural(ready, "order", "orders")}`}
                </ActionButton>
                <ActionButton
                  disabled={running}
                  onPress={modal.dismiss}
                  variant="outline"
                >
                  Not now
                </ActionButton>
              </View>
            </>
          )}
        </View>
      </BottomSheetScrollView>
    </Modal>
  )
}
