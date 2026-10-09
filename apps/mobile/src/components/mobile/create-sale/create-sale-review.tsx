import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import { MoneyField } from "@/components/mobile/money-field"
import { getSaleOfferingStockLabel } from "@/components/mobile/sale-item-picker-model"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"
import { minorToMajorInput } from "@ewatrade/utils"
import DateTimePicker from "@react-native-community/datetimepicker"
import { useState } from "react"
import { View } from "react-native"
import { Platform } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { PAYMENT_METHODS } from "./create-sale-model"
import { deliveryDateLabel } from "./create-sale-model"
import type { SaleStepViewProps } from "./create-sale-presentation"
import { saleUnitCount } from "./sale-unit-count"
import { useSalePresentation } from "./use-sale-presentation"

export function CreateSaleReview({
  model,
  appearance,
  actionsHeight,
  onActionsHeightChange: setActionsHeight,
}: SaleStepViewProps) {
  const {
    market,
    palette,
    tone,
    largeText,
    SaleStageHeader,
    SegmentOption,
    TotalSummary,
  } = useSalePresentation(appearance)
  const {
    isOffline,
    error,
    setError,
    amountReceived,
    setAmountReceived,
    paymentMethod,
    setPaymentMethod,
    deliveryDueAt,
    deliveryPickerMode,
    setDeliveryPickerMode,
    setFulfillNowRequested,
    changeDeliveryDueAt,
    selectedRows,
    selectedCustomer,
    setStep,
    totalMinor,
    currencyCode,
    paymentSummary,
    fulfillmentOption,
    submit,
    isSubmitting,
  } = model

  const [enteringPartPayment, setEnteringPartPayment] = useState(false)
  const paymentChoice =
    paymentSummary.receivedMinor === totalMinor && totalMinor > 0
      ? "paid"
      : paymentSummary.receivedMinor > 0 || enteringPartPayment
        ? "part"
        : "pending"

  return (
    <View className={tone("flex-1")}>
      <KeyboardAwareScrollView
        className={tone("flex-1")}
        bottomOffset={actionsHeight + 12}
        extraKeyboardSpace={0}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View className={tone("gap-5 px-4 pb-[var(--sale-actions-bottom)]")}>
          <SaleStageHeader
            current={3}
            onBack={() => {
              setError(null)
              setStep("customer")
            }}
            title="Checkout"
          />
          {error ? (
            <StatusBanner
              icon="AlertCircle"
              message={error}
              title="Could not confirm order"
              tone="destructive"
            />
          ) : null}
          {isOffline ? (
            <StatusBanner
              icon="Wind"
              message="The Order, amount received, payment method, and customer details will sync together when you reconnect."
              title="Offline checkout"
              tone="warning"
            />
          ) : null}

          {market ? (
            <TotalSummary
              helper={`${selectedRows.length} item${selectedRows.length === 1 ? "" : "s"}`}
              label="Total to collect"
              value={formatMinorMoney(totalMinor, currencyCode)}
            />
          ) : (
            <HeroCard
              label={
                paymentSummary.balanceDueMinor > 0
                  ? "Balance due"
                  : "Total · paid in full"
              }
              amount={formatMinorMoney(
                paymentSummary.balanceDueMinor > 0
                  ? paymentSummary.balanceDueMinor
                  : totalMinor,
                currencyCode,
              )}
              pill={{
                label: isOffline
                  ? "Will queue"
                  : `${saleUnitCount(selectedRows.map((row) => row.quantity))} units`,
                tone: isOffline ? "offline" : "draft",
              }}
              sub={`Total ${formatMinorMoney(totalMinor, currencyCode)} · received ${formatMinorMoney(paymentSummary.receivedMinor, currencyCode)}`}
            />
          )}

          <View className={tone("gap-4 border-t border-border pt-5")}>
            <View className={tone("gap-1")}>
              <Text
                className={tone(
                  "text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground",
                )}
              >
                Payment
              </Text>
              <Text className={tone("text-sm text-muted-foreground")}>
                Choose the method and enter what the customer paid.
              </Text>
            </View>
            {!market ? (
              <View className="gap-3">
                {(
                  [
                    [
                      "paid",
                      "Paid in full",
                      `Collect ${formatMinorMoney(totalMinor, currencyCode)} now`,
                      "CheckCircle2",
                    ],
                    [
                      "part",
                      "Part payment",
                      "Enter what they paid now",
                      "Wallet",
                    ],
                    [
                      "pending",
                      "Payment pending",
                      "Record now, collect later",
                      "Clock",
                    ],
                  ] as const
                ).map(([choice, label, helper, icon]) => (
                  <Pressable
                    key={choice}
                    accessibilityRole="radio"
                    accessibilityLabel={label}
                    accessibilityState={{
                      selected: paymentChoice === choice,
                      disabled: model.actionsLocked,
                    }}
                    disabled={model.actionsLocked}
                    className={cn(
                      "min-h-[62px] flex-row items-center gap-3 rounded-[20px] border bg-card p-3.5",
                      paymentChoice === choice
                        ? "border-primary"
                        : "border-border",
                    )}
                    onPress={() => {
                      setEnteringPartPayment(choice === "part")
                      if (choice === "paid")
                        setAmountReceived(minorToMajorInput(totalMinor))
                      else if (choice === "pending" || paymentChoice === "paid")
                        setAmountReceived("")
                    }}
                  >
                    <View
                      className={cn(
                        "size-[40px] items-center justify-center rounded-[14px]",
                        choice === "paid" ? "bg-tint-mint" : "bg-tint-amber",
                      )}
                    >
                      <Icon
                        name={icon}
                        className={cn(
                          "size-[20px]",
                          choice === "paid"
                            ? "text-tint-mint-foreground"
                            : "text-tint-amber-foreground",
                        )}
                      />
                    </View>
                    <View className="min-w-0 flex-1 gap-1">
                      <Text className="text-sm font-bold text-foreground">
                        {label}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {helper}
                      </Text>
                    </View>
                    {paymentChoice === choice ? (
                      <Icon
                        name="CheckCircle2"
                        className="size-[20px] text-primary"
                      />
                    ) : (
                      <View className="size-[20px] rounded-full border border-border" />
                    )}
                  </Pressable>
                ))}
              </View>
            ) : null}
            {market || paymentChoice !== "pending" ? (
              <View
                className={cn("gap-2", largeText ? "flex-col" : "flex-row")}
              >
                {PAYMENT_METHODS.map(([value, label]) => (
                  <SegmentOption
                    className={largeText ? "w-full flex-none" : undefined}
                    disabled={model.actionsLocked}
                    icon={
                      value === "cash"
                        ? "Wallet"
                        : value === "bank_transfer"
                          ? "Building"
                          : "CreditCard"
                    }
                    key={value}
                    label={label}
                    onPress={() => setPaymentMethod(value)}
                    selected={paymentMethod === value}
                  />
                ))}
              </View>
            ) : null}

            {market || paymentChoice === "part" ? (
              <MoneyField
                inputClassName={
                  market ? "bg-market-field text-market-ink" : undefined
                }
                editable={!model.actionsLocked}
                actionLabel="All amount paid"
                currencyCode={currencyCode}
                error={paymentSummary.error ?? undefined}
                helper="Leave empty for an unpaid sale, or enter a part payment."
                label="Amount received"
                onActionPress={() =>
                  setAmountReceived(minorToMajorInput(totalMinor))
                }
                onChangeValue={setAmountReceived}
                placeholder="0.00"
                value={amountReceived}
              />
            ) : null}

            <View className={tone("gap-3 rounded-2xl bg-muted/60 p-4")}>
              <View
                className={cn(
                  tone("justify-between gap-3"),
                  largeText ? "flex-col" : "flex-row items-center",
                )}
              >
                <Text className={tone("text-sm text-muted-foreground")}>
                  Amount received
                </Text>
                <Text className={tone("font-bold text-foreground")}>
                  {formatMinorMoney(paymentSummary.receivedMinor, currencyCode)}
                </Text>
              </View>
              <View className={tone("h-px bg-border")} />
              <View
                className={cn(
                  tone("justify-between gap-3"),
                  largeText ? "flex-col" : "flex-row items-end",
                )}
              >
                <View className={tone("min-w-0 shrink gap-1")}>
                  <Text
                    className={tone(
                      "text-xs font-bold uppercase tracking-[1px] text-muted-foreground",
                    )}
                  >
                    Balance due
                  </Text>
                  <Text
                    className={tone(
                      paymentSummary.paymentState === "paid"
                        ? "text-xs font-semibold text-primary"
                        : "text-xs font-semibold text-tint-amber-foreground",
                    )}
                  >
                    {paymentSummary.paymentState === "paid"
                      ? "Paid in full"
                      : paymentSummary.paymentState === "partially_paid"
                        ? "Part payment"
                        : "Payment pending"}
                  </Text>
                </View>
                <Text
                  className={tone(
                    "shrink text-2xl font-extrabold text-foreground",
                  )}
                >
                  {formatMinorMoney(
                    paymentSummary.balanceDueMinor,
                    currencyCode,
                  )}
                </Text>
              </View>
            </View>
          </View>

          <View>
            <View
              className={tone(
                "min-h-11 flex-row items-center justify-between gap-3",
              )}
            >
              <Text
                className={tone(
                  "text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground",
                )}
              >
                Sale details
              </Text>
              <Pressable
                accessibilityLabel="Edit sale items"
                className={tone("min-h-11 justify-center px-1")}
                haptic
                onPress={() => setStep("items")}
              >
                <Text className={tone("text-xs font-bold text-primary")}>
                  Edit items
                </Text>
              </Pressable>
            </View>
            {selectedRows.map(
              ({ id, offering, quantity, totalMinor: lineTotal }) => (
                <View
                  className={cn(
                    tone(
                      "items-start justify-between gap-3 border-b border-border py-3",
                    ),
                    largeText ? "flex-col" : "flex-row",
                  )}
                  key={id}
                >
                  <View className={tone("min-w-0 flex-1 gap-1")}>
                    <Text className={tone("font-bold text-foreground")}>
                      {offering.displayName}
                    </Text>
                    <Text className={tone("text-xs text-muted-foreground")}>
                      {offering.offeringName} · {quantity} ×{" "}
                      {formatMinorMoney(
                        offering.fixedPriceMinor ?? 0,
                        offering.currencyCode,
                      )}
                    </Text>
                    {getSaleOfferingStockLabel({
                      availableQuantity: offering.availableQuantity,
                      kind: offering.kind,
                      unitName: offering.unitName ?? offering.offeringName,
                    }) ? (
                      <Text
                        className={tone("text-xs font-semibold text-primary")}
                      >
                        {getSaleOfferingStockLabel({
                          availableQuantity: offering.availableQuantity,
                          kind: offering.kind,
                          unitName: offering.unitName ?? offering.offeringName,
                        })}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    className={tone("shrink font-extrabold text-foreground")}
                  >
                    {formatMinorMoney(lineTotal ?? 0, offering.currencyCode)}
                  </Text>
                </View>
              ),
            )}
            <View className={tone("flex-row items-center gap-3 py-4")}>
              <View
                className={tone(
                  "h-10 w-10 items-center justify-center rounded-full bg-muted",
                )}
              >
                <Icon
                  className={tone("size-[20px] text-muted-foreground")}
                  name={selectedCustomer ? "User" : "UserX"}
                />
              </View>
              <View className={tone("min-w-0 flex-1 gap-1")}>
                <Text className={tone("font-extrabold text-foreground")}>
                  {selectedCustomer?.name ?? "Guest customer"}
                </Text>
                <Text className={tone("text-xs text-muted-foreground")}>
                  {selectedCustomer
                    ? [selectedCustomer.phone, selectedCustomer.email]
                        .filter(Boolean)
                        .join(" · ") || "No contact details"
                    : "No customer attached to this sale"}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Change customer"
                className={tone("min-h-11 justify-center px-1")}
                haptic
                onPress={() => setStep("customer")}
              >
                <Text className={tone("text-xs font-bold text-primary")}>
                  Change
                </Text>
              </Pressable>
            </View>
          </View>

          <View className={tone("gap-4 border-t border-border pt-5")}>
            <View className={tone("gap-1")}>
              <Text
                className={tone(
                  "text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground",
                )}
              >
                Delivery and fulfillment
              </Text>
              <Text className={tone("text-sm text-muted-foreground")}>
                Delivery defaults to now. Schedule a future time when this order
                should be ready for fulfillment.
              </Text>
            </View>

            <View className={tone("gap-3 rounded-2xl bg-muted/60 p-4")}>
              <View className={tone("flex-row items-center gap-3")}>
                <View
                  className={tone(
                    "h-10 w-10 items-center justify-center rounded-full bg-background",
                  )}
                >
                  <Icon
                    className={tone("size-[20px] text-primary")}
                    name="Calendar"
                  />
                </View>
                <View className={tone("min-w-0 flex-1 gap-1")}>
                  <Text
                    className={tone(
                      "text-xs font-bold uppercase tracking-[1px] text-muted-foreground",
                    )}
                  >
                    Delivery due
                  </Text>
                  <Text className={tone("font-extrabold text-foreground")}>
                    {deliveryDateLabel(deliveryDueAt)}
                  </Text>
                </View>
              </View>
              <View
                className={cn("gap-2", largeText ? "flex-col" : "flex-row")}
              >
                <ActionButton
                  disabled={model.actionsLocked}
                  foregroundColor={market ? palette.ink : undefined}
                  className={largeText ? "w-full" : "w-auto flex-1"}
                  onPress={() => setDeliveryPickerMode("date")}
                  variant="outline"
                  disabledForegroundColor={
                    market ? palette.mutedInk : undefined
                  }
                >
                  Change date
                </ActionButton>
                <ActionButton
                  disabled={model.actionsLocked}
                  foregroundColor={market ? palette.ink : undefined}
                  className={largeText ? "w-full" : "w-auto flex-1"}
                  onPress={() => setDeliveryPickerMode("time")}
                  variant="outline"
                  disabledForegroundColor={
                    market ? palette.mutedInk : undefined
                  }
                >
                  Change time
                </ActionButton>
              </View>
              {deliveryPickerMode ? (
                <View className={tone("items-center")}>
                  <DateTimePicker
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    minimumDate={new Date()}
                    mode={deliveryPickerMode}
                    onChange={changeDeliveryDueAt}
                    value={deliveryDueAt}
                  />
                  {Platform.OS === "ios" ? (
                    <Pressable
                      accessibilityLabel="Close delivery picker"
                      className={tone("min-h-11 justify-center px-4")}
                      onPress={() => setDeliveryPickerMode(null)}
                    >
                      <Text className={tone("font-bold text-primary")}>
                        Done
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View
              className={tone(
                "flex-row items-start gap-3 rounded-2xl border border-border p-4",
              )}
            >
              <Switch
                accessibilityLabel="Fulfill Product stock when this order is confirmed"
                checked={fulfillmentOption.fulfillNow}
                disabled={
                  model.actionsLocked || !fulfillmentOption.canFulfillNow
                }
                onCheckedChange={setFulfillNowRequested}
              />
              <View className={tone("min-w-0 flex-1 gap-1")}>
                <Text className={tone("font-extrabold text-foreground")}>
                  Fulfill Product stock now
                </Text>
                <Text
                  className={tone(
                    "text-xs [-rn-line-height:20] text-muted-foreground",
                  )}
                >
                  {fulfillmentOption.reason ??
                    "Commit reserved Product stock as fulfilled when you confirm this sale."}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>

      <BottomSearchFooter
        variant={market ? "market-day" : "default"}
        onHeightChange={setActionsHeight}
        accessibilityLabel="Checkout actions"
        onChangeText={() => undefined}
        placeholder=""
        searchVisible={false}
        totalCount={0}
        value=""
      >
        <View
          className={cn(
            "gap-3",
            largeText ? "flex-col" : "flex-row items-center",
          )}
        >
          <View className={tone("min-w-[104px] gap-0.5")}>
            <Text
              className={tone(
                "text-[10px] font-bold uppercase tracking-[1px] text-muted-foreground",
              )}
            >
              {paymentSummary.paymentState === "paid"
                ? "Paid in full"
                : "Balance due"}
            </Text>
            <Text className={tone("text-xl font-extrabold text-foreground")}>
              {formatMinorMoney(paymentSummary.balanceDueMinor, currencyCode)}
            </Text>
          </View>
          <ActionButton
            disabled={model.actionsLocked}
            foregroundColor={market ? palette.onPalm : undefined}
            className={cn(
              largeText ? "w-full" : "w-auto flex-1",
              market && "bg-market-palm active:bg-market-hero-pressed",
            )}
            isLoading={isSubmitting}
            tone={market ? undefined : "gold"}
            loadingLabel="Confirming sale"
            onPress={() => void submit()}
            trailingIcon="ArrowRight"
          >
            {isOffline ? "Queue order" : "Confirm sale"}
          </ActionButton>
        </View>
      </BottomSearchFooter>
    </View>
  )
}
