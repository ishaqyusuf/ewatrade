import {
  ClassicOrderActionStack,
  ClassicOrderActionSummary,
  ClassicOrderActionWarning,
  ClassicOrderConfirmationDetail,
  ClassicOrderPaymentChoice,
} from "@/components/mobile/appearances/classic/order-action-presentation"
import {
  MarketDayOrderActionWarning,
  MarketDayOrderConfirmationDetail,
  MarketDayOrderPaymentChoice,
  OrderQuietActionStack,
  OrderQuietSummary,
} from "@/components/mobile/appearances/market-day/order-action-presentation"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import type { MobileDesign } from "@/lib/mobile-design/screens"
import {
  ORDER_PAYMENT_METHODS,
  type OrderFulfilmentConfirmation,
} from "@/lib/order-action-sheet-model"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { minorToMajorInput } from "@ewatrade/utils"
import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet"
import { type ReactNode, forwardRef } from "react"
import { useWindowDimensions } from "react-native"

const presentations = {
  classic: {
    Summary: ClassicOrderActionSummary,
    ActionStack: ClassicOrderActionStack,
    PaymentChoice: ClassicOrderPaymentChoice,
    ConfirmationDetail: ClassicOrderConfirmationDetail,
    Warning: ClassicOrderActionWarning,
  },
  "market-day": {
    Summary: OrderQuietSummary,
    ActionStack: OrderQuietActionStack,
    PaymentChoice: MarketDayOrderPaymentChoice,
    ConfirmationDetail: MarketDayOrderConfirmationDetail,
    Warning: MarketDayOrderActionWarning,
  },
}

export type OrderPaymentMethod =
  RouterInputs["orders"]["recordPayment"]["method"]

export const OrderPaymentSheet = forwardRef<
  BottomSheetModal,
  {
    appearance?: MobileDesign
    amountPaid: string
    balanceMinor?: number
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
    appearance = "market-day",
    amountPaid,
    balanceMinor,
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
  const { Summary, ActionStack, PaymentChoice } = presentations[appearance]

  return (
    <Modal
      ref={ref}
      snapPoints={[largeTextLayout ? "92%" : "72%"]}
      title="Record payment"
    >
      <View className="flex-1">
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={24}
          extraKeyboardSpace={24}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-5 px-5 pb-6">
            <Summary label="Balance due" value={balanceLabel} />
            {error ? (
              <StatusBanner
                icon="AlertCircle"
                message={error}
                title="Payment was not recorded"
                tone="destructive"
              />
            ) : null}
            {quickFill}
            {appearance === "classic" && balanceMinor !== undefined ? (
              <View className="flex-row flex-wrap gap-2">
                {[
                  ["Full", balanceMinor],
                  ["Half", Math.floor(balanceMinor / 2)],
                ].map(([label, amount]) => (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${label} balance`}
                    disabled={isLoading || isOffline || Number(amount) <= 0}
                    className="min-h-[44px] justify-center rounded-[14px] bg-tint-mint px-4"
                    onPress={() =>
                      onAmountPaidChange(minorToMajorInput(Number(amount)))
                    }
                  >
                    <Text className="text-sm font-bold text-tint-mint-foreground">
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <MoneyField
              editable={!isLoading && !isOffline}
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
                  <PaymentChoice
                    key={value}
                    label={label}
                    selected={paymentMethod === value}
                    onPress={() => onPaymentMethodChange(value)}
                  />
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
          <ActionStack
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
    appearance?: MobileDesign
    error: string | null
    isLoading: boolean
    onCancel: () => void
    onConfirm: () => void
    presentation: OrderFulfilmentConfirmation | null
  }
>(function OrderFulfilmentConfirmationSheet(
  {
    appearance = "market-day",
    error,
    isLoading,
    onCancel,
    onConfirm,
    presentation,
  },
  ref,
) {
  const { height } = useWindowDimensions()
  const { Summary, ActionStack, ConfirmationDetail, Warning } =
    presentations[appearance]
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
          <BottomSheetScrollView keyboardShouldPersistTaps="handled">
            <View className="gap-4 px-5 pb-5">
              <Summary
                label={presentation.summaryLabel}
                value={presentation.summaryValue}
              />

              <ConfirmationDetail presentation={presentation} />

              {error ? (
                <StatusBanner
                  icon="AlertCircle"
                  message={error}
                  title="Fulfilment was not recorded"
                  tone="destructive"
                />
              ) : (
                <Warning message={presentation.warning} />
              )}
            </View>
          </BottomSheetScrollView>
          <View className="border-t border-border px-5 pb-5 pt-3">
            <ActionStack
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
