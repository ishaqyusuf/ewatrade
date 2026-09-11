import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { ConversionSummary as ClassicSummary } from "@/components/mobile/appearances/classic/unit-conversion"
import { ConversionSummary as MarketSummary } from "@/components/mobile/appearances/market-day/unit-conversion"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import {
  BottomSheetFooter,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { useCallback, useState } from "react"
import { useWindowDimensions } from "react-native"
import { conversionCustody } from "./unit-conversion-model"
import type { UnitConversionModel } from "./use-unit-conversion"

export function UnitConversionReview({
  model,
  market,
}: { model: UnitConversionModel; market: boolean }) {
  const palette = useMarketDayPalette()
  const { height } = useWindowDimensions()
  const [footerHeight, setFooterHeight] = useState(140)
  const Summary = market ? MarketSummary : ClassicSummary
  const disabled =
    model.pending ||
    model.offline ||
    model.scopeChanged ||
    !model.canManage ||
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
            loadingLabel="Transforming stock"
            foregroundColor={market ? palette.onPalm : undefined}
            disabledForegroundColor={market ? palette.mutedInk : undefined}
            className={
              market
                ? disabled
                  ? "bg-market-line active:bg-market-line"
                  : "bg-market-palm active:bg-market-hero-pressed"
                : undefined
            }
            onPress={() => void model.confirm()}
          >
            {model.hasAttempt
              ? "Retry same transformation"
              : "Confirm transformation"}
          </ActionButton>
          <ActionButton
            disabled={model.pending}
            variant="outline"
            onPress={model.dismissReview}
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
      model.hasAttempt,
      model.confirm,
      model.dismissReview,
      palette.onPalm,
      palette.mutedInk,
      palette.ink,
    ],
  )
  const review = model.review
  const ink = market ? "text-market-ink" : "text-foreground"
  const muted = market ? "text-market-muted-ink" : "text-muted-foreground"
  return (
    <VariableContextProvider
      value={{ "--conversion-review-footer": footerHeight + 16 }}
    >
      <Modal
        ref={model.reviewModal.ref}
        title="Review transformation"
        snapPoints={[]}
        enableDynamicSizing
        maxDynamicContentSize={height * 0.44}
        footerComponent={footer}
        backdropComponent={backdrop}
        enablePanDownToClose={!model.pending}
        onDismiss={model.afterDismiss}
      >
        <BottomSheetScrollView keyboardShouldPersistTaps="handled">
          <View className="gap-3 px-5 pb-[var(--conversion-review-footer)]">
            {review ? (
              <>
                <Text className={cn("text-base font-extrabold", ink)}>
                  {review.source.productName} · {review.source.variantName}
                </Text>
                <Text className={cn("text-xs", muted)}>
                  {review.source.storeName} · Source revision{" "}
                  {review.source.revision} · Target revision{" "}
                  {review.target.revision}
                </Text>
                <Text className={cn("text-xs [-rn-line-height:18]", muted)}>
                  From {conversionCustody(review.source)} to{" "}
                  {conversionCustody(review.target)}
                </Text>
                <Summary
                  source={review.source}
                  target={review.target}
                  projection={review.projection}
                />
                <Text className={cn("text-sm [-rn-line-height:21]", ink)}>
                  Reason: {review.reason}
                </Text>
              </>
            ) : null}
            {model.error ? (
              <StatusBanner tone="destructive" message={model.error} />
            ) : null}
            {model.offline || model.scopeChanged || !model.canManage ? (
              <StatusBanner
                tone="warning"
                message="Return online to the original account, business and Store with inventory management permission."
              />
            ) : null}
            <Text className={cn("text-xs [-rn-line-height:18]", muted)}>
              {model.hasAttempt
                ? "The reviewed quantities and command ID are locked for retry. Closing does not undo a posted transformation. A revision conflict needs operational review before any new command."
                : "The server rechecks revisions, available stock and exact conservation, then posts both movements together. This review does not reserve stock."}
            </Text>
          </View>
        </BottomSheetScrollView>
      </Modal>
    </VariableContextProvider>
  )
}
