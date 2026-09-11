import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import type { MobileDesign } from "@/lib/mobile-design/screens"
import { cn } from "@/lib/utils"
import {
  BottomSheetFlatList,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { useCallback, useState } from "react"
import { useWindowDimensions } from "react-native"
import type { CloseoutViewModel } from "./closeout-presentation"
import type { CloseoutLine } from "./closeout-model"

export function CloseoutReviewSheet({
  model,
  appearance,
}: { model: CloseoutViewModel; appearance: MobileDesign }) {
  const market = appearance === "market-day"
  const palette = useMarketDayPalette()
  const { height } = useWindowDimensions()
  const [footerHeight, setFooterHeight] = useState(140)
  const confirmDisabled =
    model.offline ||
    !model.canManage ||
    model.scopeChanged ||
    model.pending ||
    model.phase === "complete"
  const renderBackdrop = useCallback(
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
            disabled={confirmDisabled}
            isLoading={model.pending}
            loadingLabel={
              model.phase === "creating"
                ? "Saving declaration"
                : "Finalizing closeout"
            }
            foregroundColor={market ? palette.onPalm : undefined}
            disabledForegroundColor={market ? palette.mutedInk : undefined}
            className={
              market
                ? confirmDisabled
                  ? "bg-market-line active:bg-market-line"
                  : "bg-market-palm active:bg-market-hero-pressed"
                : undefined
            }
            onPress={() => void model.confirm()}
          >
            {model.hasSavedDraft
              ? "Retry finalization"
              : model.hasAttempt
                ? "Retry closeout"
                : "Confirm closeout"}
          </ActionButton>
          <ActionButton
            disabled={model.pending}
            variant="outline"
            onPress={model.dismissReview}
          >
            {model.hasAttempt ? "Close review" : "Back to declarations"}
          </ActionButton>
        </View>
      </BottomSheetFooter>
    ),
    [
      market,
      confirmDisabled,
      palette.onPalm,
      palette.mutedInk,
      model.offline,
      model.canManage,
      model.scopeChanged,
      model.pending,
      model.phase,
      model.hasAttempt,
      model.hasSavedDraft,
      model.confirm,
      model.dismissReview,
    ],
  )
  const ink = market ? "text-market-ink" : "text-foreground"
  const muted = market ? "text-market-muted-ink" : "text-muted-foreground"
  return (
    <VariableContextProvider
      value={{ "--closeout-review-footer": footerHeight }}
    >
      <Modal
        ref={model.reviewModal.ref}
        hideHeader
        snapPoints={[]}
        enableDynamicSizing
        maxDynamicContentSize={height * 0.44}
        enablePanDownToClose={!model.pending}
        backdropComponent={renderBackdrop}
        onDismiss={model.afterDismiss}
        footerComponent={footer}
      >
        <BottomSheetFlatList<CloseoutLine>
          data={model.review?.lines ?? []}
          keyExtractor={(line) => line.balance.balanceSourceId}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View className="gap-3 px-5 pb-2 pt-5">
              <Text
                accessibilityRole="header"
                className={cn("text-xl font-extrabold", ink)}
              >
                Confirm closeout
              </Text>
              <Text className={cn("text-sm [-rn-line-height:20]", muted)}>
                Finalizing applies these inventory variances. This does not
                reconcile cash or return stock to a Store.
              </Text>
              {model.offline ? (
                <StatusBanner
                  tone="warning"
                  title="Connection required"
                  message="Reconnect before retrying this declaration."
                />
              ) : null}
              {model.error ? (
                <StatusBanner
                  tone="destructive"
                  title="Closeout not confirmed"
                  message={model.error}
                />
              ) : null}
              {model.hasAttempt ? (
                <Text className={cn("text-xs [-rn-line-height:18]", muted)}>
                  These declarations are locked for retry with the same request
                  IDs. Closing this review does not undo a server-side closeout.
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <View
              className={cn(
                "mx-5 gap-1 border-b py-3",
                market ? "border-market-line" : "border-border",
              )}
            >
              <Text className={cn("font-bold", ink)}>
                {item.balance.productName} · {item.balance.variantName}
              </Text>
              <Text className={cn("text-sm", muted)}>
                Expected {item.balance.onHandQuantity} → Declared{" "}
                {item.declaredQuantity} {item.balance.inventoryUnitName}
              </Text>
              <Text className={cn("text-xs", muted)}>
                Variance {item.variance} {item.balance.inventoryUnitName}
              </Text>
            </View>
          )}
          ListFooterComponent={
            <View className="px-5 pt-4">
              <Text className={cn("text-xs [-rn-line-height:18]", muted)}>
                Reason: {model.review?.reason || "End of shift closeout"}
              </Text>
              <View className="h-[var(--closeout-review-footer)]" />
            </View>
          }
        />
      </Modal>
    </VariableContextProvider>
  )
}
