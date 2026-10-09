import { ActionButton } from "@/components/mobile/action-button"
import { NudgeCard } from "@/components/mobile/nudge-card"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useOrderVisibility } from "@/hooks/use-order-visibility"
import { BottomSheetView } from "@gorhom/bottom-sheet"

export function OrderVisibilityCard({ review = false }: { review?: boolean }) {
  const vm = useOrderVisibility()
  const modal = useModal()
  if (!vm.canManage || !vm.storeId) return null
  if (
    review &&
    (!vm.query.data || vm.query.data.salesRepOrderVisibilityReviewedAt)
  )
    return null
  const choices = [
    { value: "OWN_SALES", label: "Only their own sales" },
    { value: "ALL_STORE_ORDERS", label: "All orders in this store" },
  ] as const
  const label = choices.find(
    (choice) => choice.value === vm.query.data?.salesRepOrderVisibility,
  )?.label
  const keep = () => vm.update.mutate({ storeId: vm.storeId })
  return (
    <>
      <NudgeCard
        title={review ? "Choose what your sales reps can see" : "Staff rules"}
      >
        <Text className="text-sm text-muted-foreground">
          {vm.query.data?.name} · What sales reps can see
        </Text>
        {vm.query.isError ? (
          <ActionButton
            variant="outline"
            onPress={() => void vm.query.refetch()}
          >
            Try loading Staff rules again
          </ActionButton>
        ) : (
          <ActionButton
            variant="outline"
            onPress={() => modal.present()}
            disabled={vm.query.isPending || vm.isOffline}
          >
            {review ? "Review Staff rules" : (label ?? "Loading Staff rules…")}
          </ActionButton>
        )}
        {review ? (
          <ActionButton
            variant="ghost"
            onPress={keep}
            disabled={vm.update.isPending || vm.isOffline}
          >
            Keep as it is
          </ActionButton>
        ) : null}
        {vm.isOffline ? (
          <Text className="text-sm text-muted-foreground">
            Reconnect to update Staff rules.
          </Text>
        ) : null}
        {vm.update.isError ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {vm.update.error.message}
          </Text>
        ) : null}
      </NudgeCard>
      <Modal
        ref={modal.ref}
        title="What sales reps can see"
        enableDynamicSizing
        maxDynamicContentSize={360}
      >
        <BottomSheetView className="gap-2 px-5 pb-6">
          {choices.map((choice) => (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{
                checked:
                  choice.value === vm.query.data?.salesRepOrderVisibility,
                disabled: vm.update.isPending,
              }}
              disabled={vm.update.isPending || vm.isOffline}
              className="min-h-14 justify-center rounded-xl border border-border px-4 active:bg-accent"
              onPress={() =>
                vm.update.mutate(
                  { storeId: vm.storeId, visibility: choice.value },
                  { onSuccess: modal.dismiss },
                )
              }
            >
              <Text className="text-base text-foreground">
                {choice.value === vm.query.data?.salesRepOrderVisibility
                  ? "✓ "
                  : ""}
                {choice.label}
              </Text>
            </Pressable>
          ))}
          {vm.update.isError ? (
            <Text
              accessibilityRole="alert"
              className="text-sm text-destructive"
            >
              {vm.update.error.message}
            </Text>
          ) : null}
        </BottomSheetView>
      </Modal>
    </>
  )
}
