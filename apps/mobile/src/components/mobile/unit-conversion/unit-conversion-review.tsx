import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { ActionButton } from "@/components/mobile/action-button"
import { ConversionSummary } from "@/components/mobile/appearances/classic/unit-conversion"
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
import { conversionCustody } from "./unit-conversion-model"
import type { UnitConversionModel } from "./use-unit-conversion"

export function UnitConversionReview({
  model,
}: { model: UnitConversionModel }) {
  const { height } = useWindowDimensions()
  const [footerHeight, setFooterHeight] = useState(140)
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
          className="gap-2 border-t border-border bg-card px-5 pb-5 pt-3"
        >
          <ActionButton
            disabled={disabled}
            isLoading={model.pending}
            loadingLabel="Transforming stock"
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
          >
            {model.hasAttempt ? "Close review" : "Back to draft"}
          </ActionButton>
        </View>
      </BottomSheetFooter>
    ),
    [
      disabled,
      model.pending,
      model.hasAttempt,
      model.confirm,
      model.dismissReview,
    ],
  )
  const review = model.review
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
                <Text className="text-base font-extrabold text-foreground">
                  {review.source.productName} · {review.source.variantName}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {review.source.storeName} · Source revision{" "}
                  {review.source.revision} · Target revision{" "}
                  {review.target.revision}
                </Text>
                <Text className="text-xs [-rn-line-height:18] text-muted-foreground">
                  From {conversionCustody(review.source)} to{" "}
                  {conversionCustody(review.target)}
                </Text>
                <ConversionSummary
                  source={review.source}
                  target={review.target}
                  projection={review.projection}
                />
                <Text className="text-sm [-rn-line-height:21] text-foreground">
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
            <Text className="text-xs [-rn-line-height:18] text-muted-foreground">
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
