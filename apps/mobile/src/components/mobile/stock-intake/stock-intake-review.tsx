import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import {
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet"
import { useCallback, useState } from "react"
import { useWindowDimensions } from "react-native"
import {
  STOCK_MODES,
  stockCustodyLabel,
  stockKindLabel,
  stockQuantityLine,
  stockReviewLedger,
} from "./stock-intake-model"
import type { StockIntakeModel } from "./use-stock-intake"

function Chip({ icon, label }: { icon?: IconKeys; label: string }) {
  return (
    <View className="min-h-7 flex-row items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
      {icon ? (
        <Icon className="size-[13px] text-foreground" name={icon} />
      ) : null}
      <Text className="text-xs font-bold text-foreground">{label}</Text>
    </View>
  )
}

function LedgerRow({
  label,
  from,
  to,
  delta,
  main,
}: {
  label: string
  from: string
  to: string | null
  delta?: string
  main?: boolean
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${from} to ${to ?? "unknown"}${delta ? `, ${delta}` : ""}`}
      className="border-t border-border py-2.5 first:border-t-0"
    >
      <View className="flex-row items-baseline gap-2.5">
        <Text className="flex-1 text-sm text-muted-foreground">{label}</Text>
        <Text className="text-sm tabular-nums text-muted-foreground">
          {from}
        </Text>
        <Icon className="size-[14px] text-gold" name="ArrowRight" />
        <Text
          className={cn(
            "min-w-11 text-right font-extrabold tabular-nums text-foreground",
            main ? "text-[22px] tracking-[-0.6px]" : "text-sm",
          )}
        >
          {to ?? "—"}
        </Text>
      </View>
      {delta ? (
        <Text className="mt-0.5 text-right text-xs text-muted-foreground">
          {delta}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * Ledger sheet (Workshop mobile/stock-review-outcomes 01): what changes, by how
 * much, in which exact balance; on hand, reserved and available stay apart.
 */
export function StockIntakeReview({ model }: { model: StockIntakeModel }) {
  const { height } = useWindowDimensions()
  const [footerHeight, setFooterHeight] = useState(144)
  const review = model.review
  const quantityLine = review
    ? stockQuantityLine(
        review.draft,
        review.quantity,
        review.balance.inventoryUnitName,
      )
    : ""
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
          {model.reviewStale ? (
            <ActionButton
              disabled={model.pending}
              icon="RefreshCw"
              onPress={model.refreshReview}
            >
              Refresh review
            </ActionButton>
          ) : (
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
                  : `Confirm · ${quantityLine.toLowerCase()}`}
            </ActionButton>
          )}
          <ActionButton
            disabled={model.pending}
            icon="Pencil"
            onPress={model.dismissReview}
            tone="soft"
          >
            {model.hasAttempt ? "Close review" : "Edit draft"}
          </ActionButton>
        </View>
      </BottomSheetFooter>
    ),
    [
      disabled,
      quantityLine,
      model.pending,
      model.phase,
      model.hasCountDraft,
      model.hasAttempt,
      model.reviewStale,
      model.confirm,
      model.refreshReview,
      model.dismissReview,
    ],
  )
  const ledger = review ? stockReviewLedger(review) : null
  const reasons = review
    ? review.draft.mode === "receipt" || review.draft.mode === "adjustment"
      ? review.draft.categories.map((category) => category.name)
      : [review.draft.reason]
    : []
  return (
    <Modal
      ref={model.reviewModal.ref}
      title="Review stock"
      snapPoints={[]}
      enableDynamicSizing
      maxDynamicContentSize={height * 0.82}
      enablePanDownToClose={!model.pending}
      backdropComponent={backdrop}
      footerComponent={footer}
      onDismiss={model.afterDismiss}
    >
      {/* Gorhom renders this at a separate portal host, so the measured
            footer reserve is passed directly, not through a context var. */}
      <BottomSheetScrollView
        contentContainerStyle={{ paddingBottom: footerHeight + 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3 px-5">
          {review && ledger ? (
            <>
              <View className="gap-0.5">
                <Text className="text-xs font-extrabold uppercase tracking-[1px] text-muted-foreground">
                  {
                    STOCK_MODES.find((mode) => mode.key === review.draft.mode)
                      ?.label
                  }{" "}
                  · {review.balance.storeName}
                </Text>
                <Text
                  accessibilityRole="header"
                  className="text-[21px] font-extrabold tracking-[-0.4px] text-foreground"
                >
                  {quantityLine}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {review.balance.productName} · {review.balance.variantName}
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                <Chip
                  icon="Warehouse"
                  label={stockCustodyLabel(review.balance, model.people)}
                />
                {review.draft.mode === "custody" ? (
                  <Chip icon="ArrowRight" label={review.recipientName} />
                ) : null}
                <Chip icon="Package" label={stockKindLabel(review.balance)} />
                {reasons.filter(Boolean).map((label) => (
                  <Chip key={label} label={label} />
                ))}
              </View>
              <View className="rounded-[20px] bg-background px-3.5 py-1">
                <LedgerRow
                  delta={
                    ledger.difference
                      ? `${ledger.difference} ${review.balance.inventoryUnitName}${review.draft.mode === "count" ? " difference from the count" : ""}`
                      : undefined
                  }
                  from={ledger.onHand[0]}
                  label={
                    review.draft.mode === "custody"
                      ? `${stockCustodyLabel(review.balance, model.people)} on hand`
                      : "On hand"
                  }
                  main
                  to={ledger.onHand[1]}
                />
                <LedgerRow
                  from={ledger.reserved[0]}
                  label="Reserved"
                  to={ledger.reserved[1]}
                />
                <LedgerRow
                  from={ledger.available[0]}
                  label="Available"
                  to={ledger.available[1]}
                />
              </View>
            </>
          ) : null}
          {model.reviewStale ? (
            <StatusBanner
              icon="TriangleAlert"
              tone="warning"
              title="This balance just changed"
              message="Stock on this balance changed or is no longer available for this operation. Nothing was recorded. Refresh, then review again."
            />
          ) : (
            <Text className="text-xs [-rn-line-height:22] text-muted-foreground">
              {model.hasAttempt
                ? "This request is kept as is. Retrying uses the same request, so it can't be recorded twice."
                : "Estimate until the server confirms. If this balance changes first, you'll be asked to review again."}
            </Text>
          )}
          {model.offline || model.scopeChanged || !model.canManage ? (
            <StatusBanner
              tone="warning"
              message="Return online to the original account, business and Store with inventory management permission."
            />
          ) : null}
          {model.error ? (
            <StatusBanner tone="destructive" message={model.error} />
          ) : null}
        </View>
      </BottomSheetScrollView>
    </Modal>
  )
}
