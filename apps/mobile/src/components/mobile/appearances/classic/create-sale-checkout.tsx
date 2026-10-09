import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import {
  PAYMENT_METHODS,
  deliveryDateLabel,
} from "@/components/mobile/create-sale/create-sale-model"
import type { SaleStepViewProps } from "@/components/mobile/create-sale/create-sale-presentation"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME, type GreenTillTint } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { formatMinorMoney, minorToMajorInput } from "@ewatrade/utils"
import DateTimePicker from "@react-native-community/datetimepicker"
import { useState } from "react"
import { Text as NativeText, Platform } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

const money = (minor: number, currency: string) =>
  formatMinorMoney(minor, currency).replace(/\.00(?=\D*$)/, "")

const PAYMENT_CHOICES: ReadonlyArray<
  readonly ["paid" | "part" | "pending", string, IconKeys, GreenTillTint]
> = [
  ["paid", "Paid in full", "Check", "mint"],
  ["part", "Part payment", "Wallet", "amber"],
  ["pending", "Payment pending", "Clock", "amber"],
]

const METHOD_ICON: Record<string, IconKeys> = {
  bank_transfer: "Building",
  cash: "Wallet",
  pos: "CreditCard",
}

/** Step 3 of the 02 Cart & Sheet pick: pay, order, delivery, confirm. */
export function ClassicSaleCheckout({
  model,
  actionsHeight,
  onActionsHeightChange: setActionsHeight,
}: SaleStepViewProps) {
  const largeText = useLargeTextLayout()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const {
    isOffline,
    error,
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
  const balance = paymentSummary.balanceDueMinor
  const itemCount = `${selectedRows.length} ${selectedRows.length === 1 ? "item" : "items"}`
  const methodLabel =
    PAYMENT_METHODS.find(([value]) => value === paymentMethod)?.[1] ?? "Cash"
  const initials = selectedCustomer?.name
    .split(/\s+/)
    .map((part) => Array.from(part)[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <View className="flex-1">
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={actionsHeight + 12}
        extraKeyboardSpace={0}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2 px-4 pb-[var(--sale-actions-bottom)]">
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
          <HeroCard
            label={balance > 0 ? "Balance due" : "Total · paid in full"}
            amount={money(balance > 0 ? balance : totalMinor, currencyCode)}
            pill={{
              label: isOffline ? "Will queue" : itemCount,
              tone: isOffline ? "offline" : "synced",
            }}
            sub={
              balance > 0
                ? `Total ${money(totalMinor, currencyCode)} · received ${money(paymentSummary.receivedMinor, currencyCode)}`
                : `${methodLabel} · nothing left to collect`
            }
          />

          <SectionLabel>HOW ARE THEY PAYING?</SectionLabel>
          <View className="gap-2.5">
            {PAYMENT_CHOICES.map(([choice, label, icon, tint]) => {
              const on = paymentChoice === choice
              return (
                <Pressable
                  key={choice}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{
                    selected: on,
                    disabled: model.actionsLocked,
                  }}
                  disabled={model.actionsLocked}
                  haptic
                  onPress={() => {
                    setEnteringPartPayment(choice === "part")
                    if (choice === "paid")
                      setAmountReceived(minorToMajorInput(totalMinor))
                    else if (choice === "pending" || paymentChoice === "paid")
                      setAmountReceived("")
                  }}
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.card,
                    borderColor: on ? colors.primary : "transparent",
                    borderRadius: 18,
                    borderWidth: 2,
                    flexDirection: "row",
                    gap: 12,
                    minHeight: 66,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                >
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: palette[tint],
                      borderRadius: 13,
                      height: 40,
                      justifyContent: "center",
                      width: 40,
                    }}
                  >
                    <Icon
                      className="size-[19px]"
                      color={palette[`${tint}Foreground`]}
                      name={icon}
                    />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-bold text-foreground">
                      {label}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {choice === "paid"
                        ? `Collect ${money(totalMinor, currencyCode)} now`
                        : choice === "part"
                          ? "Enter what they paid now"
                          : "Record now, collect later"}
                    </Text>
                  </View>
                  <View
                    style={{
                      alignItems: "center",
                      borderColor: on ? colors.primary : colors.border,
                      borderRadius: 999,
                      borderWidth: 2,
                      height: 22,
                      justifyContent: "center",
                      width: 22,
                    }}
                  >
                    {on ? (
                      <View
                        style={{
                          backgroundColor: colors.primary,
                          borderRadius: 999,
                          height: 10,
                          width: 10,
                        }}
                      />
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
          </View>
          {paymentChoice !== "pending" ? (
            <View
              className={cn(
                "mt-1.5 gap-2",
                largeText ? "flex-col" : "flex-row",
              )}
            >
              {PAYMENT_METHODS.map(([value, label]) => {
                const on = paymentMethod === value
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityLabel={label}
                    accessibilityState={{
                      selected: on,
                      disabled: model.actionsLocked,
                    }}
                    disabled={model.actionsLocked}
                    haptic
                    onPress={() => setPaymentMethod(value)}
                    style={{
                      alignItems: "center",
                      backgroundColor: on ? colors.primary : colors.card,
                      borderRadius: 14,
                      flex: largeText ? undefined : 1,
                      flexDirection: "row",
                      gap: 7,
                      height: 44,
                      justifyContent: "center",
                    }}
                  >
                    <Icon
                      className="size-[17px]"
                      color={on ? colors.primaryForeground : colors.foreground}
                      name={METHOD_ICON[value] ?? "Wallet"}
                    />
                    <NativeText
                      style={{
                        color: on
                          ? colors.primaryForeground
                          : colors.foreground,
                        fontSize: 14,
                        fontWeight: "800",
                      }}
                    >
                      {label}
                    </NativeText>
                  </Pressable>
                )
              })}
            </View>
          ) : null}
          {paymentChoice === "part" ? (
            <View className="mt-1.5">
              <MoneyField
                editable={!model.actionsLocked}
                actionLabel="All amount paid"
                currencyCode={currencyCode}
                error={paymentSummary.error ?? undefined}
                label="Amount received"
                onActionPress={() =>
                  setAmountReceived(minorToMajorInput(totalMinor))
                }
                onChangeValue={setAmountReceived}
                placeholder="0.00"
                value={amountReceived}
              />
            </View>
          ) : null}

          <SectionLabel
            action={{
              label: "Edit",
              accessibilityLabel: "Edit sale items",
              onPress: () => setStep("items"),
            }}
          >
            ORDER
          </SectionLabel>
          <View className="rounded-[20px] bg-card px-3.5 py-1 shadow-sm">
            <View className="min-h-[58px] flex-row items-center gap-3 border-b border-border py-2.5">
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: selectedCustomer
                    ? palette.lilac
                    : palette.sky,
                  borderRadius: 999,
                  height: 40,
                  justifyContent: "center",
                  width: 40,
                }}
              >
                {selectedCustomer ? (
                  <NativeText
                    maxFontSizeMultiplier={1.3}
                    style={{
                      color: palette.lilacForeground,
                      fontSize: 13,
                      fontWeight: "800",
                    }}
                  >
                    {initials}
                  </NativeText>
                ) : (
                  <Icon
                    className="size-[18px]"
                    color={palette.skyForeground}
                    name="Store"
                  />
                )}
              </View>
              <View className="min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  className="text-sm font-bold text-foreground"
                >
                  {selectedCustomer?.name ?? "Walk-in customer"}
                </Text>
                <Text
                  numberOfLines={1}
                  className="text-xs text-muted-foreground"
                >
                  {selectedCustomer
                    ? [selectedCustomer.phone, selectedCustomer.email]
                        .filter(Boolean)
                        .join(" · ") || "No contact details"
                    : "No customer attached to this sale"}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Change customer"
                accessibilityRole="button"
                className="min-h-11 justify-center px-1"
                haptic
                onPress={() => setStep("customer")}
              >
                <Text className="text-[13px] font-extrabold text-primary">
                  Change
                </Text>
              </Pressable>
            </View>
            {selectedRows.map(
              ({ id, offering, quantity, totalMinor: lineTotal }, index) => (
                <View
                  key={id}
                  className={cn(
                    "gap-2 py-2.5",
                    !largeText && "flex-row items-start justify-between",
                    index < selectedRows.length - 1 && "border-b border-border",
                  )}
                >
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-bold text-foreground">
                      {offering.displayName}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {`${quantity} × ${money(offering.fixedPriceMinor ?? 0, offering.currencyCode)}`}
                    </Text>
                  </View>
                  <Text className="text-sm font-extrabold tabular-nums text-foreground">
                    {money(lineTotal ?? 0, offering.currencyCode)}
                  </Text>
                </View>
              ),
            )}
          </View>

          <SectionLabel>DELIVERY</SectionLabel>
          <View className="rounded-[20px] bg-card px-3.5 py-1 shadow-sm">
            <View className="min-h-[58px] flex-row items-center gap-3 border-b border-border py-2.5">
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: palette.sky,
                  borderRadius: 12,
                  height: 38,
                  justifyContent: "center",
                  width: 38,
                }}
              >
                <Icon
                  className="size-[18px]"
                  color={palette.skyForeground}
                  name="Calendar"
                />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-foreground">
                  {deliveryDateLabel(deliveryDueAt)}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Delivery due
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Change delivery date"
                accessibilityRole="button"
                className="min-h-11 justify-center px-1"
                disabled={model.actionsLocked}
                haptic
                onPress={() => setDeliveryPickerMode("date")}
              >
                <Text className="text-[13px] font-extrabold text-primary">
                  Date
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Change delivery time"
                accessibilityRole="button"
                className="min-h-11 justify-center px-1"
                disabled={model.actionsLocked}
                haptic
                onPress={() => setDeliveryPickerMode("time")}
              >
                <Text className="text-[13px] font-extrabold text-primary">
                  Time
                </Text>
              </Pressable>
            </View>
            {deliveryPickerMode ? (
              <View className="items-center border-b border-border py-2">
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
                    className="min-h-11 justify-center px-4"
                    onPress={() => setDeliveryPickerMode(null)}
                  >
                    <Text className="font-bold text-primary">Done</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <View className="min-h-[58px] flex-row items-center gap-3 py-2.5">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-foreground">
                  Fulfil stock now
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {fulfillmentOption.reason ??
                    "Commit reserved stock when you confirm"}
                </Text>
              </View>
              <Switch
                accessibilityLabel="Fulfill Product stock when this order is confirmed"
                checked={fulfillmentOption.fulfillNow}
                disabled={
                  model.actionsLocked || !fulfillmentOption.canFulfillNow
                }
                onCheckedChange={setFulfillNowRequested}
              />
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>

      <BottomSearchFooter
        variant="action-bar"
        onHeightChange={setActionsHeight}
        accessibilityLabel="Checkout actions"
        onChangeText={() => undefined}
        placeholder=""
        searchVisible={false}
        totalCount={0}
        value=""
      >
        <ActionButton
          disabled={model.actionsLocked}
          icon={isOffline ? "Clock" : "Check"}
          isLoading={isSubmitting}
          loadingLabel="Confirming sale"
          onPress={() => void submit()}
          tone="gold"
        >
          {`${isOffline ? "Queue order" : "Confirm sale"} · ${money(totalMinor, currencyCode)}`}
        </ActionButton>
      </BottomSearchFooter>
    </View>
  )
}

function SectionLabel({
  action,
  children,
}: {
  action?: { accessibilityLabel: string; label: string; onPress: () => void }
  children: string
}) {
  return (
    <View className="mt-3 min-h-8 flex-row items-center justify-between">
      <Text className="text-xs font-extrabold tracking-[0.3px] text-muted-foreground">
        {children}
      </Text>
      {action ? (
        <Pressable
          accessibilityLabel={action.accessibilityLabel}
          accessibilityRole="button"
          className="min-h-11 justify-center px-1"
          haptic
          onPress={action.onPress}
        >
          <Text className="text-[13px] font-extrabold text-primary">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}
