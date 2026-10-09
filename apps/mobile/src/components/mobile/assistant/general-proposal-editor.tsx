import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  type GeneralAction,
  type GeneralProposal,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
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
export function GeneralProposalEditor({
  proposal,
  disabled,
  onSave,
}: {
  proposal: GeneralProposal
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}) {
  const initial = proposal.payload
  const [payload, setPayload] = useState(initial)
  const [price, setPrice] = useState(
    "priceMinor" in initial
      ? minorToMajorInput(initial.priceMinor)
      : "amountMinor" in initial
        ? minorToMajorInput(initial.amountMinor)
        : "",
  )
  const [country, setCountry] = useState("NG")
  const [phone, setPhone] = useState(
    initial.action === "customer_create"
      ? toLocalPhone(getCountry("NG").dialCode, initial.phone)
      : "",
  )
  const [undo, setUndo] = useState<{
    payload: GeneralAction
    price: string
    phone: string
    country: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const patch = (value: Record<string, unknown>) =>
    setPayload((current) => ({ ...current, ...value }) as GeneralAction)
  const save = () => {
    if (disabled) return
    const amount = majorToMinor(price)
    if (
      (payload.action === "product_create" ||
        payload.action === "payment_record") &&
      amount === null
    ) {
      setError("Enter a valid amount.")
      return
    }
    const candidate = {
      ...payload,
      ...(payload.action === "product_create"
        ? { priceMinor: amount }
        : payload.action === "payment_record"
          ? { amountMinor: amount }
          : payload.action === "customer_create"
            ? {
                phone: phone.trim()
                  ? toInternationalPhone(getCountry(country).dialCode, phone)
                  : undefined,
              }
            : {}),
    }
    const parsed = generalActionSchema.safeParse(candidate)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the draft fields.")
      return
    }
    setError(null)
    onSave(parsed.data)
  }
  return (
    <BottomSheetInputProvider>
      <BottomSheetKeyboardAwareScrollView contentContainerClassName="gap-4 px-4 pb-8">
        <Text className="text-sm text-muted-foreground">
          Save changes, then review the updated card before confirming.
        </Text>
        <QaQuickFillButton
          formId="general-assistant-proposal"
          isDirty={
            JSON.stringify(payload) !== JSON.stringify(initial) ||
            phone !== ("phone" in initial ? initial.phone : "")
          }
          canUndo={!!undo}
          onFill={(_context, sequence) => {
            if (disabled) return
            setUndo({ payload, price, phone, country })
            if (payload.action === "customer_create") {
              patch({ name: `QA customer ${sequence}`, email: undefined })
              setPhone(`0801234${String(sequence).padStart(4, "0")}`)
            } else if (payload.action === "product_create") {
              patch({
                name: `QA product ${sequence}`,
                canonicalUnitName: "Piece",
              })
              setPrice("1500")
            } else if (payload.action === "payment_record") setPrice("100")
            else patch({ notes: `QA order note ${sequence}` })
          }}
          onUndo={() => {
            if (disabled || !undo) return
            setPayload(undo.payload)
            setPrice(undo.price)
            setPhone(undo.phone)
            setCountry(undo.country)
            setUndo(null)
          }}
        />
        {"name" in payload ? (
          <FormField
            label="Name"
            value={payload.name}
            editable={!disabled}
            onChangeText={(name) => patch({ name })}
          />
        ) : null}
        {payload.action === "customer_create" ? (
          <>
            <CountrySelect
              value={country}
              disabled={disabled}
              onChange={setCountry}
            />
            <FormField
              label="Phone"
              value={phone}
              editable={!disabled}
              keyboardType="phone-pad"
              onChangeText={setPhone}
            />
            <FormField
              label="Email"
              value={payload.email ?? ""}
              editable={!disabled}
              keyboardType="email-address"
              autoCapitalize="none"
              onChangeText={(email) =>
                patch({ email: email.trim() || undefined })
              }
            />
          </>
        ) : null}
        {payload.action === "customer_update" ? (
          <>
            <Text className="text-sm text-muted-foreground">
              Leave a field as it is to keep it. Clear phone or email to remove
              it.
            </Text>
            <FormField
              label="Phone"
              value={payload.phone ?? ""}
              editable={!disabled}
              keyboardType="phone-pad"
              onChangeText={(phone) => patch({ phone: phone.trim() || null })}
            />
            <FormField
              label="Email"
              value={payload.email ?? ""}
              editable={!disabled}
              keyboardType="email-address"
              autoCapitalize="none"
              onChangeText={(email) => patch({ email: email.trim() || null })}
            />
          </>
        ) : null}
        {payload.action === "product_create" ? (
          <FormField
            label="Unit"
            value={payload.canonicalUnitName}
            editable={!disabled}
            onChangeText={(canonicalUnitName) => patch({ canonicalUnitName })}
          />
        ) : null}
        {payload.action === "product_create" ||
        payload.action === "payment_record" ? (
          <FormField
            label={
              payload.action === "product_create"
                ? "Unit price"
                : "Payment amount"
            }
            value={price}
            editable={!disabled}
            keyboardType="decimal-pad"
            onChangeText={setPrice}
          />
        ) : null}
        {payload.action === "payment_record" ? (
          <>
            <Text className="text-sm font-bold text-foreground">
              Payment method
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {(["cash", "bank_transfer", "card", "pos", "other"] as const).map(
                (method) => (
                  <ActionButton
                    key={method}
                    disabled={disabled}
                    variant={payload.method === method ? "default" : "outline"}
                    onPress={() => patch({ method })}
                  >
                    {method.replaceAll("_", " ")}
                  </ActionButton>
                ),
              )}
            </View>
            <FormField
              label="Note"
              value={payload.note ?? ""}
              editable={!disabled}
              onChangeText={(note) => patch({ note: note.trim() || undefined })}
            />
          </>
        ) : null}
        {payload.action === "order_create" ? (
          <>
            <Text className="text-sm text-muted-foreground">
              Use the sale form to change products or customer. Here you can
              adjust quantities and notes.
            </Text>
            {payload.lines.map((line, index) => (
              <FormField
                key={`${line.offeringId}:${index}`}
                label={`Quantity · line ${index + 1}`}
                value={line.quantity}
                editable={!disabled}
                keyboardType="decimal-pad"
                onChangeText={(quantity) =>
                  patch({
                    lines: payload.lines.map((current, i) =>
                      i === index ? { ...current, quantity } : current,
                    ),
                  })
                }
              />
            ))}
            <FormField
              label="Notes"
              value={payload.notes ?? ""}
              editable={!disabled}
              multiline
              onChangeText={(notes) =>
                patch({ notes: notes.trim() || undefined })
              }
            />
          </>
        ) : null}
        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm text-destructive"
          >
            {error}
          </Text>
        ) : null}
        <ActionButton disabled={disabled} onPress={save}>
          Save draft
        </ActionButton>
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}
