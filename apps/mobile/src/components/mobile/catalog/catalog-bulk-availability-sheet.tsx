import { ActionButton } from "@/components/mobile/action-button"
import {
  type BulkOutcome,
  BulkReportList,
} from "@/components/mobile/list-selection/bulk-report"
import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useTRPC } from "@/trpc/client"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  type AvailabilityItem,
  bulkAvailabilityDone,
  bulkAvailabilityFailed,
  bulkAvailabilityHides,
  bulkAvailabilitySummary,
  planBulkAvailability,
} from "./catalog-bulk-availability-model"

const plural = (count: number) => `${count} ${count === 1 ? "item" : "items"}`

/**
 * Hide from sale / Show for sale for the Catalog list: confirm in a sheet,
 * switch each item's offerings in this store, then report every item.
 */
export function useBulkAvailability({
  onFinished,
  storeId,
}: {
  onFinished: () => void
  storeId?: string | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const modal = useModal()
  const mutation = useMutation(
    trpc.catalog.setOfferingAvailability.mutationOptions(),
  )
  const [plan, setPlan] = useState<ReturnType<
    typeof planBulkAvailability<AvailabilityItem>
  > | null>(null)
  const [hide, setHide] = useState(true)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [outcomes, setOutcomes] = useState<BulkOutcome[] | null>(null)

  const open = (items: readonly AvailabilityItem[]) => {
    if (running || !storeId) return
    const hides = bulkAvailabilityHides(items, storeId)
    setHide(hides)
    setPlan(planBulkAvailability(items, storeId, hides))
    setOutcomes(null)
    setProgress(0)
    modal.present()
  }

  const run = async () => {
    if (!plan || !storeId || running || !plan.targets.length) return
    setRunning(true)
    const results: BulkOutcome[] = []
    for (const [index, target] of plan.targets.entries()) {
      setProgress(index + 1)
      try {
        for (const offeringId of target.offeringIds)
          await mutation.mutateAsync({
            isAvailable: !hide,
            offeringId,
            storeId,
          })
        results.push(bulkAvailabilityDone(target.item, hide))
      } catch (error) {
        results.push(bulkAvailabilityFailed(target.item, error))
      }
    }
    await Promise.all([
      queryClient.invalidateQueries(trpc.catalog.listItems.queryFilter()),
      queryClient.invalidateQueries(trpc.catalog.listItemsPage.pathFilter()),
      queryClient.invalidateQueries(trpc.catalog.getItem.pathFilter()),
      queryClient.invalidateQueries(trpc.catalog.attentionSummary.pathFilter()),
    ]).catch(() => undefined)
    setOutcomes([...results, ...plan.skipped])
    setRunning(false)
    onFinished()
  }

  return { hide, modal, open, outcomes, plan, progress, run, running }
}

export type BulkAvailability = ReturnType<typeof useBulkAvailability>

export function BulkAvailabilitySheet({
  availability,
}: {
  availability: BulkAvailability
}) {
  const { hide, modal, outcomes, plan, progress, running } = availability
  const count = plan?.targets.length ?? 0
  const skipped = plan?.skipped.length ?? 0
  const verb = hide ? "Hide" : "Show"
  return (
    <Modal
      accessibilityLabel={hide ? "Hide items from sale" : "Show items for sale"}
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
                {bulkAvailabilitySummary(outcomes, hide)}
              </Text>
              <BulkReportList outcomes={outcomes} />
              <ActionButton
                onPress={modal.dismiss}
                testID="bulk-availability-done"
              >
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
                  {`${verb} ${plural(count)} ${hide ? "from sale" : "for sale"}?`}
                </Text>
                <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
                  {`${hide ? "They stay in your Catalog and stock, but new sales and your store can’t pick them." : "New sales and your store can pick them again."}${skipped ? ` ${skipped === 1 ? "1 selected item is" : `${skipped} selected items are`} skipped.` : ""}`}
                </Text>
              </View>
              <View className="gap-2.5">
                <ActionButton
                  disabled={!count}
                  icon={hide ? "EyeOff" : "Eye"}
                  isLoading={running}
                  loadingLabel={`Updating ${progress} of ${count}…`}
                  onPress={() => void availability.run()}
                  testID="bulk-availability-confirm"
                >
                  {`${verb} ${plural(count)}`}
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
