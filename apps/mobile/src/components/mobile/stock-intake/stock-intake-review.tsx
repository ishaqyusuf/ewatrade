import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { useCallback, useState } from "react"
import { useWindowDimensions } from "react-native"
import { STOCK_MODES, stockCustodyLabel } from "./stock-intake-model"
import type { StockIntakeModel } from "./use-stock-intake"

export function StockIntakeReview({ model }: { model: StockIntakeModel }) {
  const { height } = useWindowDimensions()
  const [footerHeight, setFooterHeight] = useState(144)
  const disabled =
    model.pending ||
    model.offline ||
    !model.canManage ||
    model.scopeChanged ||
    model.phase === "complete"
  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <AppBottomSheetBackdrop {...props} dismissible={!model.pending} />
    ),
    [model.pending],
  )
  const footer = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <View
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          className="gap-2 border-t border-border bg-card px-5 pb-5 pt-3"
        >
          <ActionButton
            disabled={disabled}
            isLoading={model.pending}
            loadingLabel={
              model.phase === "finalizing"
                ? "Finalizing count"
                : "Recording stock"
            }
            onPress={() => void model.confirm()}
          >
            {model.hasCountDraft
              ? "Retry count finalization"
              : model.hasAttempt
                ? "Retry same operation"
                : "Confirm stock operation"}
          </ActionButton>
          <ActionButton
            disabled={model.pending}
            onPress={model.dismissReview}
            variant="outline"
          >
            {model.hasAttempt ? "Close review" : "Back to draft"}
          </ActionButton>
        </View>
      </BottomSheetFooter>
    ),
    [
      disabled,
      model.pending,
      model.phase,
      model.hasCountDraft,
      model.hasAttempt,
      model.confirm,
      model.dismissReview,
    ],
  )
  const review = model.review
  return (
    <VariableContextProvider
      value={{ "--stock-review-footer": footerHeight + 16 }}
    >
      <Modal
        ref={model.reviewModal.ref}
        title="Review stock operation"
        snapPoints={[]}
        enableDynamicSizing
        maxDynamicContentSize={height * 0.44}
        enablePanDownToClose={!model.pending}
        backdropComponent={backdrop}
        footerComponent={footer}
        onDismiss={model.afterDismiss}
      >
        <BottomSheetScrollView keyboardShouldPersistTaps="handled">
          <View className="gap-3 px-5 pb-[var(--stock-review-footer)]">
            {review ? (
              <>
                <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
                  {
                    STOCK_MODES.find((mode) => mode.key === review.draft.mode)
                      ?.label
                  }{" "}
                  · {review.balance.storeName}
                </Text>
                <Text
                  accessibilityRole="header"
                  className="text-xl font-extrabold text-foreground"
                >
                  {review.balance.productName} · {review.balance.variantName}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {stockCustodyLabel(review.balance, model.people)} · Revision{" "}
                  {review.balance.revision}
                </Text>
                <View className="gap-2 rounded-2xl border border-border bg-background p-4">
                  <Text className="text-2xl font-bold text-primary">
                    {review.quantity} {review.balance.inventoryUnitName}
                  </Text>
                  <Text className="text-sm [-rn-line-height:20] text-muted-foreground">
                    {review.draft.mode === "count"
                      ? "Observed quantity; finalization applies the variance."
                      : review.draft.mode === "custody"
                        ? `Move to ${review.recipientName}; remains in this Store.`
                        : review.draft.mode === "receipt" ||
                            review.draft.direction === "increase"
                          ? "Increase this balance."
                          : "Decrease this balance."}
                  </Text>
                </View>
                {review.draft.mode === "receipt" ||
                review.draft.mode === "adjustment" ? (
                  <View className="flex-row flex-wrap gap-2">
                    {review.draft.categories.map((category) => (
                      <View
                        key={category.name}
                        className="rounded-full border border-border bg-muted px-3 py-2"
                      >
                        <Text className="text-sm text-foreground">
                          {category.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text className="text-sm [-rn-line-height:21] text-foreground">
                    Reason: {review.draft.reason}
                  </Text>
                )}
              </>
            ) : null}
            {model.offline || model.scopeChanged || !model.canManage ? (
              <StatusBanner
                tone="warning"
                message="Return online to the original account, business and Store with inventory management permission."
              />
            ) : null}
            {model.error ? (
              <StatusBanner tone="destructive" message={model.error} />
            ) : null}
            <Text className="text-xs [-rn-line-height:18] text-muted-foreground">
              {model.hasAttempt
                ? "This reviewed payload is locked. Retrying uses the same request IDs; closing does not undo a saved operation or Count draft. A revision conflict needs operational review, not a new blind command."
                : "Confirmation writes an auditable stock operation. Revisions and availability are checked by the server; this review does not reserve stock."}
            </Text>
          </View>
        </BottomSheetScrollView>
      </Modal>
    </VariableContextProvider>
  )
}
