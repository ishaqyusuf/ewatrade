import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { ActionButton } from "@/components/mobile/action-button"
import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import {
  type BottomSheetBackdropProps,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet"
import { useCallback, useEffect, useRef } from "react"
import { StatusPill } from "../green-till/kit"

export type ExpenseReviewSummary = {
  amount: string
  category: string
  date: string
  description: string
  payee: string
}

/**
 * Review before recording (Workshop 12, 01 Green Till record view): a sheet
 * over the expense form with the amount, category, date and the status the
 * expense will have. Nothing is recorded until Confirm.
 */
export function FinanceExpenseReviewSheet({
  canConfirm,
  onBack,
  onConfirm,
  pending,
  review,
}: {
  canConfirm: boolean
  onBack: () => void
  onConfirm: () => void
  pending: boolean
  review: ExpenseReviewSummary | null
}) {
  const modal = useModal()
  const largeText = useLargeTextLayout()
  const open = Boolean(review)
  const latest = useRef({ open, pending, onBack })
  latest.current = { open, pending, onBack }
  // Keep the last summary while the sheet animates closed.
  const shown = useRef(review)
  if (review) shown.current = review
  useEffect(() => {
    if (open) modal.present()
    else modal.dismiss()
  }, [open, modal.present, modal.dismiss])
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <AppBottomSheetBackdrop {...props} dismissible={!pending} />
    ),
    [pending],
  )
  const summary = shown.current
  return (
    <Modal
      ref={modal.ref}
      hideHeader
      // Content height only: with the default 60% snap point as well, index
      // 0 was the 60% stop and large text cut off Back to details.
      snapPoints={[]}
      enableDynamicSizing
      enablePanDownToClose={!pending}
      backdropComponent={renderBackdrop}
      onDismiss={() => {
        // Still open here means the person swiped it away.
        if (latest.current.open && !latest.current.pending)
          latest.current.onBack()
      }}
    >
      {/* Gorhom views take no className; the padding lives on a View. It
          scrolls when the content is taller than the screen allows. */}
      <BottomSheetScrollView>
        <View className="px-5 pb-6 pt-5">
          {summary ? (
            <>
              <Text
                accessibilityRole="header"
                className="text-lg font-extrabold tracking-[-0.4px] text-foreground"
              >
                Review before recording
              </Text>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {summary.payee} · {summary.description}
              </Text>
              <Text className="mb-0.5 mt-2.5 text-[34px] font-extrabold tracking-[-1.2px] tabular-nums text-foreground">
                {summary.amount}
              </Text>
              {[
                { label: "Category", value: summary.category },
                { label: "Date", value: summary.date },
              ].map((row) => (
                <View
                  key={row.label}
                  className="flex-row justify-between gap-3 border-t border-border py-2.5"
                >
                  <Text className="text-sm text-muted-foreground">
                    {row.label}
                  </Text>
                  <Text className="min-w-0 flex-1 text-right text-sm font-bold text-foreground">
                    {row.value}
                  </Text>
                </View>
              ))}
              {/* Large text: the pill goes under its label, not off the edge. */}
              <View
                className={
                  largeText
                    ? "items-start gap-1.5 border-t border-border py-2.5"
                    : "flex-row items-center justify-between gap-3 border-t border-border py-2.5"
                }
              >
                <Text className="text-sm text-muted-foreground">
                  Status after recording
                </Text>
                <StatusPill
                  label={`Unpaid · ${summary.amount} owed`}
                  tone="warn"
                />
              </View>
              <View className="mt-3.5 gap-1">
                <ActionButton
                  disabled={!canConfirm}
                  isLoading={pending}
                  onPress={onConfirm}
                >
                  Confirm and record
                </ActionButton>
                <ActionButton
                  disabled={pending}
                  variant="ghost"
                  onPress={onBack}
                >
                  Back to details
                </ActionButton>
              </View>
            </>
          ) : null}
        </View>
      </BottomSheetScrollView>
    </Modal>
  )
}
