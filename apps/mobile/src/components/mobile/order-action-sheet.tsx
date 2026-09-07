import {
  ActionButton,
  MarketDayActionButton,
} from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { COMPACT_CONTROL_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import {
  ORDER_PAYMENT_METHODS,
  type OrderFulfilmentConfirmation,
} from "@/lib/order-action-sheet-model"
import { cn } from "@/lib/utils"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet"
import { type ReactNode, forwardRef } from "react"
import { StyleSheet, useWindowDimensions } from "react-native"

export function OrderQuietSummary({
  label,
  value,
}: {
  label: string
  value: string
}) {
  const marketDay = useMarketDayPalette()
  const largeTextLayout = useLargeTextLayout()

  return (
    <View
      style={[
        styles.summary,
        largeTextLayout ? styles.summaryLargeText : null,
        {
          backgroundColor: marketDay.field,
          borderColor: marketDay.line,
        },
      ]}
    >
      <Text
        maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
        style={[styles.summaryLabel, { color: marketDay.mutedInk }]}
      >
        {label}
      </Text>
      <Text
        maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
        selectable
        style={[styles.summaryValue, { color: marketDay.ink }]}
      >
        {value}
      </Text>
    </View>
  )
}

export function OrderQuietActionStack({
  actionLabel,
  cancelLabel = "Cancel",
  disabled,
  isLoading,
  loadingLabel,
  onCancel,
  onConfirm,
}: {
  actionLabel: string
  cancelLabel?: string
  disabled?: boolean
  isLoading?: boolean
  loadingLabel?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <View className="gap-1">
      <MarketDayActionButton
        disabled={disabled}
        isLoading={isLoading}
        loadingLabel={loadingLabel}
        onPress={onConfirm}
        tone="palm"
      >
        {actionLabel}
      </MarketDayActionButton>
      <ActionButton onPress={onCancel} variant="ghost">
        {cancelLabel}
      </ActionButton>
    </View>
  )
}

export type OrderPaymentMethod =
  RouterInputs["orders"]["recordPayment"]["method"]

export const OrderPaymentSheet = forwardRef<
  BottomSheetModal,
  {
    amountPaid: string
    balanceLabel: string
    currencyCode: string
    error: string | null
    isLoading: boolean
    isOffline: boolean
    onAmountPaidChange: (value: string) => void
    onCancel: () => void
    onConfirm: () => void
    onPaymentMethodChange: (value: OrderPaymentMethod) => void
    onReferenceChange: (value: string) => void
    paymentMethod: OrderPaymentMethod
    quickFill?: ReactNode
    reference: string
  }
>(function OrderPaymentSheet(
  {
    amountPaid,
    balanceLabel,
    currencyCode,
    error,
    isLoading,
    isOffline,
    onAmountPaidChange,
    onCancel,
    onConfirm,
    onPaymentMethodChange,
    onReferenceChange,
    paymentMethod,
    quickFill,
    reference,
  },
  ref,
) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <Modal
      ref={ref}
      snapPoints={[largeTextLayout ? "92%" : "72%"]}
      title="Record payment"
    >
      <View className="flex-1">
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={24}
          contentContainerStyle={{ paddingBottom: 24 }}
          extraKeyboardSpace={24}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-5 px-5">
            <OrderQuietSummary label="Balance due" value={balanceLabel} />
            {error ? (
              <StatusBanner
                icon="AlertCircle"
                message={error}
                title="Payment was not recorded"
                tone="destructive"
              />
            ) : null}
            {quickFill}
            <MoneyField
              currencyCode={currencyCode}
              label="Amount received"
              onChangeValue={onAmountPaidChange}
              value={amountPaid}
            />
            <View className="gap-2">
              <Text className="text-sm font-bold text-foreground">
                Payment method
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {ORDER_PAYMENT_METHODS.map(([value, label]) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: paymentMethod === value }}
                    className={cn(
                      largeTextLayout
                        ? "min-h-14 min-w-[46%] flex-1 px-4"
                        : "min-h-11 px-3",
                      "items-center justify-center rounded-xl",
                      paymentMethod === value
                        ? "bg-primary"
                        : "border border-border bg-card",
                    )}
                    haptic
                    key={value}
                    onPress={() => onPaymentMethodChange(value)}
                  >
                    <Text
                      maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
                      numberOfLines={1}
                      style={{
                        color:
                          paymentMethod === value
                            ? marketDay.onPalm
                            : marketDay.ink,
                        fontSize: 14,
                        fontWeight: "700",
                        lineHeight: largeTextLayout ? 24 : 20,
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <FormField
              label="Reference"
              onChangeText={onReferenceChange}
              placeholder="Optional"
              value={reference}
            />
          </View>
        </BottomSheetKeyboardAwareScrollView>
        <View className="border-t border-border px-5 pb-5 pt-3">
          <OrderQuietActionStack
            actionLabel="Save payment"
            disabled={isOffline}
            isLoading={isLoading}
            loadingLabel="Saving…"
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        </View>
      </View>
    </Modal>
  )
})

OrderPaymentSheet.displayName = "OrderPaymentSheet"

export const OrderFulfilmentConfirmationSheet = forwardRef<
  BottomSheetModal,
  {
    error: string | null
    isLoading: boolean
    onCancel: () => void
    onConfirm: () => void
    presentation: OrderFulfilmentConfirmation | null
  }
>(function OrderFulfilmentConfirmationSheet(
  { error, isLoading, onCancel, onConfirm, presentation },
  ref,
) {
  const { height } = useWindowDimensions()
  const marketDay = useMarketDayPalette()
  const largeTextLayout = useLargeTextLayout()

  return (
    <Modal
      maxDynamicContentSize={Math.round(
        height * (largeTextLayout ? 0.92 : 0.64),
      )}
      ref={ref}
      snapPoints={[largeTextLayout ? "92%" : "64%"]}
      title={presentation?.title ?? "Fulfilment"}
    >
      {presentation ? (
        <View className="flex-1">
          <BottomSheetScrollView
            contentContainerStyle={styles.confirmationContent}
            keyboardShouldPersistTaps="handled"
          >
            <OrderQuietSummary
              label={presentation.summaryLabel}
              value={presentation.summaryValue}
            />

            <View
              style={[
                styles.detailRow,
                largeTextLayout ? styles.detailRowLargeText : null,
                { borderBottomColor: marketDay.line },
              ]}
            >
              <View className="min-w-0 flex-1 gap-1">
                <Text
                  maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
                  selectable
                  style={[styles.detailTitle, { color: marketDay.ink }]}
                >
                  {presentation.detailTitle}
                </Text>
                <Text
                  maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
                  selectable
                  style={[styles.detail, { color: marketDay.mutedInk }]}
                >
                  {presentation.detail}
                </Text>
              </View>
              <Text
                maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
                numberOfLines={1}
                style={{
                  color: marketDay.palm,
                  fontSize: 14,
                  fontWeight: "800",
                  lineHeight: 22,
                }}
              >
                Ready
              </Text>
            </View>

            {error ? (
              <StatusBanner
                icon="AlertCircle"
                message={error}
                title="Fulfilment was not recorded"
                tone="destructive"
              />
            ) : (
              <View
                style={[
                  styles.warning,
                  {
                    backgroundColor: marketDay.field,
                    borderColor: marketDay.line,
                    borderLeftColor: marketDay.paprika,
                  },
                ]}
              >
                <Text
                  maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
                  selectable
                  style={[styles.warningText, { color: marketDay.ink }]}
                >
                  {presentation.warning}
                </Text>
              </View>
            )}
          </BottomSheetScrollView>
          <View className="border-t border-border px-5 pb-5 pt-3">
            <OrderQuietActionStack
              actionLabel={presentation.actionLabel}
              isLoading={isLoading}
              loadingLabel="Recording…"
              onCancel={onCancel}
              onConfirm={onConfirm}
            />
          </View>
        </View>
      ) : null}
    </Modal>
  )
})

OrderFulfilmentConfirmationSheet.displayName =
  "OrderFulfilmentConfirmationSheet"

const styles = StyleSheet.create({
  confirmationContent: {
    gap: 16,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  detail: {
    fontSize: 14,
    lineHeight: 22,
  },
  detailRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 16,
    paddingBottom: 14,
  },
  detailRowLargeText: {
    alignItems: "flex-start",
    flexDirection: "column",
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 24,
  },
  summary: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.3,
    lineHeight: 18,
    minWidth: 0,
  },
  summaryLargeText: {
    alignItems: "flex-start",
    flexDirection: "column",
  },
  summaryValue: {
    fontSize: 20,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    lineHeight: 30,
  },
  warning: {
    borderLeftWidth: 3,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  warningText: {
    fontSize: 14,
    lineHeight: 22,
  },
})
