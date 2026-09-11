import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import {
  BottomSheetFooter,
  BottomSheetScrollView,
  type BottomSheetFooterProps,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { useCallback, useState } from "react"
import { useWindowDimensions } from "react-native"
import { STOCK_MODES, stockCustodyLabel } from "./stock-intake-model"
import type { StockIntakeModel } from "./use-stock-intake"

export function StockIntakeReview({
  model,
  market,
}: { model: StockIntakeModel; market: boolean }) {
  const palette = useMarketDayPalette()
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
          className={cn(
            "gap-2 border-t px-5 pb-5 pt-3",
            market
              ? "border-market-line bg-market-field"
              : "border-border bg-card",
          )}
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
            foregroundColor={market ? palette.onPalm : undefined}
            disabledForegroundColor={market ? palette.mutedInk : undefined}
            className={
              market
                ? disabled
                  ? "bg-market-line active:bg-market-line"
                  : "bg-market-palm active:bg-market-hero-pressed"
                : undefined
            }
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
            foregroundColor={market ? palette.ink : undefined}
            className={
              market
                ? "border-market-line bg-market-field active:bg-market-line"
                : undefined
            }
          >
            {model.hasAttempt ? "Close review" : "Back to draft"}
          </ActionButton>
        </View>
      </BottomSheetFooter>
    ),
    [
      disabled,
      market,
      model.pending,
      model.phase,
      model.hasCountDraft,
      model.hasAttempt,
      model.confirm,
      model.dismissReview,
      palette.onPalm,
      palette.mutedInk,
      palette.ink,
    ],
  )
  const ink = market ? "text-market-ink" : "text-foreground"
  const muted = market ? "text-market-muted-ink" : "text-muted-foreground"
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
                <Text
                  className={cn(
                    "text-xs font-bold uppercase tracking-[1px]",
                    muted,
                  )}
                >
                  {
                    STOCK_MODES.find((mode) => mode.key === review.draft.mode)
                      ?.label
                  }{" "}
                  · {review.balance.storeName}
                </Text>
                <Text
                  accessibilityRole="header"
                  className={cn("text-xl font-extrabold", ink)}
                >
                  {review.balance.productName} · {review.balance.variantName}
                </Text>
                <Text className={cn("text-sm", muted)}>
                  {stockCustodyLabel(review.balance, model.people)} · Revision{" "}
                  {review.balance.revision}
                </Text>
                <View
                  className={cn(
                    "gap-2 rounded-2xl border p-4",
                    market
                      ? "border-market-line bg-market-canvas"
                      : "border-border bg-background",
                  )}
                >
                  <Text
                    className={cn(
                      "text-2xl font-bold",
                      market
                        ? "font-market-display text-market-accent-ink"
                        : "text-primary",
                    )}
                  >
                    {review.quantity} {review.balance.inventoryUnitName}
                  </Text>
                  <Text className={cn("text-sm [-rn-line-height:20]", muted)}>
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
                <Text className={cn("text-sm [-rn-line-height:21]", ink)}>
                  Reason: {review.draft.reason}
                </Text>
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
            <Text className={cn("text-xs [-rn-line-height:18]", muted)}>
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
