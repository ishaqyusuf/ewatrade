import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  type BottomSheetBackdropProps,
  BottomSheetFlatList,
  BottomSheetFooter,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { useCallback, useState } from "react"
import { useWindowDimensions } from "react-native"
import type { CloseoutLine } from "./closeout-model"
import type { CloseoutViewModel } from "./closeout-presentation"

export function CloseoutReviewSheet({ model }: { model: CloseoutViewModel }) {
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
          className="gap-2 border-t border-border bg-card px-5 pb-5 pt-3"
        >
          <ActionButton
            disabled={confirmDisabled}
            isLoading={model.pending}
            loadingLabel={
              model.phase === "creating"
                ? "Saving declaration"
                : "Finalizing closeout"
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
      confirmDisabled,
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
                className="text-xl font-extrabold text-foreground"
              >
                Confirm closeout
              </Text>
              <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
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
                <Text className="text-xs [-rn-line-height:22] text-muted-foreground">
                  These declarations are locked for retry with the same request
                  IDs. Closing this review does not undo a server-side closeout.
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <View className="mx-5 gap-1 border-b border-border py-3">
              <Text className="font-bold text-foreground">
                {item.balance.productName} · {item.balance.variantName}
              </Text>
              <Text className="text-sm text-muted-foreground">
                Expected {item.balance.onHandQuantity} → Declared{" "}
                {item.declaredQuantity} {item.balance.inventoryUnitName}
              </Text>
              <Text className="text-xs text-muted-foreground">
                Variance {item.variance} {item.balance.inventoryUnitName}
              </Text>
            </View>
          )}
          ListFooterComponent={
            <View className="px-5 pt-4">
              <Text className="text-xs [-rn-line-height:22] text-muted-foreground">
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
