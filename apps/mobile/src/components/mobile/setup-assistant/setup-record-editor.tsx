import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  type SetupEntityPayload,
  normalizeQuantity,
  setupEntityPayloadSchema,
} from "@ewatrade/assistant/setup/contracts"
import {
  getCountry,
  toInternationalPhone,
  toLocalPhone,
} from "@ewatrade/utils/countries"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import { useState } from "react"
import { ActionButton } from "../action-button"
import { CountrySelect } from "../country-select"
import { FormField } from "../form-field"
import { QaQuickFillButton } from "../qa-quick-fill-button"
import { type SetupEntity, setupEntityPayload } from "./setup-model"
import { setupMoneyEdit } from "./setup-money-edit"
export function SetupRecordEditor({
  entity,
  disabled,
  countryCode = "NG",
  onSave,
}: {
  entity: SetupEntity
  disabled: boolean
  countryCode?: string
  onSave: (payload: SetupEntityPayload) => void
}) {
  const payload = setupEntityPayload(entity)
  const [name, setName] = useState(payload?.name ?? "")
  const [price, setPrice] = useState(
    payload?.kind === "product" || payload?.kind === "service"
      ? minorToMajorInput(payload.priceMinor)
      : "",
  )
  const [stock, setStock] = useState(
    payload?.kind === "product" ? (payload.openingStock ?? "") : "",
  )
  const [unit, setUnit] = useState(
    payload?.kind === "product" ? payload.unitName : "",
  )
  const [country, setCountry] = useState(countryCode)
  const [phone, setPhone] = useState(
    payload?.kind === "customer"
      ? toLocalPhone(getCountry(countryCode).dialCode, payload.phone)
      : "",
  )
  const [email, setEmail] = useState(
    payload?.kind === "customer" ? (payload.email ?? "") : "",
  )
  const [opening, setOpening] = useState(
    payload?.kind === "customer" && payload.opening
      ? minorToMajorInput(payload.opening.amountMinor)
      : "",
  )
  const [direction, setDirection] = useState<"owes_business" | "business_owes">(
    payload?.kind === "customer"
      ? (payload.opening?.direction ?? "owes_business")
      : "owes_business",
  )
  const [purpose, setPurpose] = useState<"CASH" | "BANK">(
    payload?.kind === "money_account" ? payload.purpose : "CASH",
  )
  const [bankName, setBankName] = useState(
    payload?.kind === "money_account" ? (payload.bankName ?? "") : "",
  )
  const [balance, setBalance] = useState(
    payload?.kind === "money_account"
      ? minorToMajorInput(payload.openingBalanceMinor)
      : "",
  )
  const [undo, setUndo] = useState<{
    name: string
    price: string
    stock: string
    unit: string
    country: string
    phone: string
    email: string
    purpose: "CASH" | "BANK"
    bankName: string
    balance: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  function save() {
    if (!payload || disabled) return
    if (payload.kind === "money_account") {
      const edited = setupMoneyEdit({ name, purpose, bankName, balance })
      if (!edited) {
        setError(
          "Check the name, bank and balance. Leave an unknown balance blank.",
        )
        return
      }
      onSave(edited)
      return
    }
    if (payload.kind !== "customer" && price && majorToMinor(price) === null) {
      setError("Enter a valid price.")
      return
    }
    if (
      payload.kind === "product" &&
      stock &&
      normalizeQuantity(stock) === null
    ) {
      setError("Enter a valid stock quantity.")
      return
    }
    if (
      payload.kind === "customer" &&
      opening &&
      (majorToMinor(opening) === null || (majorToMinor(opening) ?? 0) <= 0)
    ) {
      setError("Enter a positive opening balance, or leave it blank.")
      return
    }
    const candidate = {
      ...payload,
      name,
      ...(payload.kind === "customer"
        ? {
            phone: phone
              ? toInternationalPhone(getCountry(country).dialCode, phone)
              : undefined,
            email: email || undefined,
            opening: opening
              ? { direction, amountMinor: majorToMinor(opening) }
              : undefined,
          }
        : {
            priceMinor: price ? (majorToMinor(price) ?? undefined) : undefined,
          }),
      ...(payload.kind === "product"
        ? { unitName: unit, openingStock: stock || undefined }
        : {}),
    }
    const parsed = setupEntityPayloadSchema.safeParse(candidate)
    if (!parsed.success) {
      setError(
        "Check the name, price, units and contact details before saving.",
      )
      return
    }
    onSave(parsed.data)
  }
  return (
    <BottomSheetInputProvider>
      <BottomSheetKeyboardAwareScrollView
        contentContainerStyle={{
          gap: 16,
          paddingHorizontal: 18,
          paddingBottom: 32,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-xs text-muted-foreground">
          Save these details, then check and confirm the record in your setup
          list.
        </Text>
        {disabled ? (
          <Text className="text-sm text-muted-foreground">
            Reconnect to edit this record.
          </Text>
        ) : null}
        <QaQuickFillButton
          formId="setup-assistant-record"
          canUndo={!!undo}
          onFill={(_, seq) => {
            if (disabled) return
            setUndo({
              name,
              price,
              stock,
              unit,
              country,
              phone,
              email,
              purpose,
              bankName,
              balance,
            })
            setName(
              `${payload?.kind === "customer" ? "Aisha Bello" : payload?.kind === "money_account" ? "Shop cash" : "Crate of eggs"} ${seq}`,
            )
            setPrice("4500")
            setStock("20")
            setUnit("Crate")
            setCountry("NG")
            setPhone("8035550142")
            setPurpose("CASH")
            setBankName("")
            setBalance("12500")
          }}
          onUndo={() => {
            if (!undo || disabled) return
            setName(undo.name)
            setPrice(undo.price)
            setStock(undo.stock)
            setUnit(undo.unit)
            setCountry(undo.country)
            setPhone(undo.phone)
            setEmail(undo.email)
            setPurpose(undo.purpose)
            setBankName(undo.bankName)
            setBalance(undo.balance)
            setUndo(null)
          }}
        />
        <FormField
          label="Name"
          value={name}
          onChangeText={setName}
          editable={!disabled}
        />
        {payload?.kind === "customer" ? (
          <>
            <CountrySelect
              value={country}
              onChange={setCountry}
              disabled={disabled}
            />
            <FormField
              label="Phone number"
              leadingText={getCountry(country).dialCode}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={!disabled}
            />
            <FormField
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!disabled}
            />
            <FormField
              label="Opening balance"
              value={opening}
              onChangeText={setOpening}
              keyboardType="decimal-pad"
              editable={!disabled}
            />
            <View className="flex-row flex-wrap gap-2">
              <ActionButton
                variant={direction === "owes_business" ? undefined : "outline"}
                disabled={disabled}
                onPress={() => setDirection("owes_business")}
              >
                Owes my business
              </ActionButton>
              <ActionButton
                variant={direction === "business_owes" ? undefined : "outline"}
                disabled={disabled}
                onPress={() => setDirection("business_owes")}
              >
                My business owes
              </ActionButton>
            </View>
          </>
        ) : payload?.kind === "money_account" ? (
          <>
            <View className="flex-row gap-2">
              <ActionButton
                className="w-auto flex-1"
                variant={purpose === "CASH" ? undefined : "outline"}
                disabled={disabled}
                onPress={() => setPurpose("CASH")}
              >
                Cash
              </ActionButton>
              <ActionButton
                className="w-auto flex-1"
                variant={purpose === "BANK" ? undefined : "outline"}
                disabled={disabled}
                onPress={() => setPurpose("BANK")}
              >
                Bank
              </ActionButton>
            </View>
            {purpose === "BANK" ? (
              <FormField
                label="Bank name"
                value={bankName}
                onChangeText={setBankName}
                editable={!disabled}
              />
            ) : null}
            <FormField
              label="Current balance"
              value={balance}
              onChangeText={setBalance}
              keyboardType="decimal-pad"
              editable={!disabled}
            />
            <Text className="text-xs text-muted-foreground">
              Leave the balance blank if you do not know it. Enter 0 only when
              the account is empty.
            </Text>
          </>
        ) : (
          <>
            {payload?.kind === "product" &&
            (payload.options?.length || payload.variants?.length) ? (
              <Text className="text-xs text-muted-foreground">
                Individual variant prices and stock stay as shown in your setup
                list. Change individual variants in the chat.
              </Text>
            ) : null}
            <FormField
              label={
                payload?.kind === "product" &&
                (payload.options?.length || payload.variants?.length)
                  ? "Shared price"
                  : "Price"
              }
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              editable={!disabled}
            />
            {payload?.kind === "product" ? (
              <>
                <FormField
                  label="Selling unit"
                  value={unit}
                  onChangeText={setUnit}
                  editable={!disabled}
                />
                <FormField
                  label={
                    payload.options?.length || payload.variants?.length
                      ? "Shared stock"
                      : "Current stock"
                  }
                  value={stock}
                  onChangeText={setStock}
                  keyboardType="decimal-pad"
                  editable={!disabled}
                />
              </>
            ) : null}
          </>
        )}
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
        <ActionButton disabled={disabled || !payload} onPress={save}>
          Save details
        </ActionButton>
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}
