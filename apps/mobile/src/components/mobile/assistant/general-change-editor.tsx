import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { minorToMajorInput } from "@ewatrade/utils/currency"
import DateTimePicker from "@react-native-community/datetimepicker"
import { useState } from "react"
import { Platform } from "react-native"
import { ActionButton } from "../action-button"
import { FormField } from "../form-field"
import { MoneyField } from "../money-field"
import {
  type FieldChoice,
  type NativeChangeAction,
  fieldChoice,
  nativeChangeCandidate,
  textPatch,
} from "./native-change-values"

/** Native editor for reviewed catalog and order changes; mirrors the dashboard. */
export function GeneralChangeEditor({
  initial,
  currencyCode,
  disabled,
  onSave,
}: {
  initial: NativeChangeAction
  currencyCode: string
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}) {
  const [payload, setPayload] = useState(initial)
  const [price, setPrice] = useState(
    initial.action === "product_price_update"
      ? minorToMajorInput(initial.priceMinor)
      : "",
  )
  const [due, setDue] = useState<Date | null>(
    initial.action === "order_metadata_update" && initial.patch.deliveryDueAt
      ? new Date(initial.patch.deliveryDueAt)
      : null,
  )
  const [picker, setPicker] = useState<"date" | "time" | null>(null)
  // The drafted metadata values, offered back after "keep" or "clear".
  const drafted =
    initial.action === "order_metadata_update" ? initial.patch : {}
  const [error, setError] = useState<string | null>(null)
  const patch = (value: Record<string, unknown>) =>
    setPayload((current) => ({ ...current, ...value }) as NativeChangeAction)
  const setMeta = (
    key: "customerId" | "deliveryDueAt" | "notes",
    value: string | null | undefined,
  ) =>
    setPayload((current) =>
      current.action === "order_metadata_update"
        ? { ...current, patch: { ...current.patch, [key]: value } }
        : current,
    )
  const save = () => {
    if (disabled) return
    const result = nativeChangeCandidate(payload, {
      price,
      deliveryDueAt: due,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onSave(result.payload)
  }
  return (
    <BottomSheetInputProvider>
      <BottomSheetKeyboardAwareScrollView
        contentContainerStyle={{
          gap: 16,
          paddingHorizontal: 18,
          paddingBottom: 32,
        }}
      >
        <Text className="text-sm text-muted-foreground">
          Save changes, then review the updated card before confirming.
        </Text>
        {payload.action === "product_price_update" ? (
          <>
            <MoneyField
              label="Unit price"
              currencyCode={currencyCode}
              value={price}
              editable={!disabled}
              onChangeValue={setPrice}
            />
            <Text className="text-xs text-muted-foreground">
              Changes this selling unit in every Store that sells it. Other
              units, variants and past orders keep their prices.
            </Text>
          </>
        ) : null}
        {payload.action === "product_details_update" ? (
          <>
            <Text className="text-xs text-muted-foreground">
              Untouched fields keep their saved values. Emptying description or
              category removes it. Past orders stay unchanged.
            </Text>
            <FormField
              label="Name"
              value={payload.name ?? ""}
              placeholder={
                payload.name === undefined ? "Keep current name" : undefined
              }
              editable={!disabled}
              onChangeText={(name) => patch({ name: name || undefined })}
            />
            <FormField
              label="Description"
              value={payload.description ?? ""}
              placeholder={
                payload.description === undefined
                  ? "Keep current description"
                  : undefined
              }
              editable={!disabled}
              multiline
              onChangeText={(text) => patch({ description: textPatch(text) })}
            />
            <FormField
              label="Category"
              value={payload.category ?? ""}
              placeholder={
                payload.category === undefined
                  ? "Keep current category"
                  : undefined
              }
              editable={!disabled}
              onChangeText={(text) => patch({ category: textPatch(text) })}
            />
          </>
        ) : null}
        {payload.action === "product_identifiers_update" ? (
          <>
            <Text className="text-xs text-muted-foreground">
              Applies only to the reviewed selling unit. Emptying an identifier
              removes it.
            </Text>
            <FormField
              label="SKU"
              value={payload.sku ?? ""}
              placeholder={
                payload.sku === undefined ? "Keep current SKU" : undefined
              }
              editable={!disabled}
              autoCapitalize="characters"
              onChangeText={(text) => patch({ sku: textPatch(text) })}
            />
            <FormField
              label="Barcode"
              value={payload.barcode ?? ""}
              placeholder={
                payload.barcode === undefined
                  ? "Keep current barcode"
                  : undefined
              }
              editable={!disabled}
              keyboardType="number-pad"
              onChangeText={(text) => patch({ barcode: textPatch(text) })}
            />
          </>
        ) : null}
        {payload.action === "product_availability_update" ? (
          <>
            <Choices
              label="Selling availability"
              value={payload.isAvailable ? "available" : "unavailable"}
              disabled={disabled}
              options={[
                ["available", "Available"],
                ["unavailable", "Unavailable"],
              ]}
              onChange={(value) =>
                patch({ isAvailable: value === "available" })
              }
            />
            <Text className="text-xs text-muted-foreground">
              Applies only to this selling unit in the current Store. Stock and
              saved orders stay unchanged.
            </Text>
          </>
        ) : null}
        {payload.action === "order_metadata_update" ? (
          <>
            <Choices
              label="Customer"
              value={fieldChoice(payload.patch.customerId)}
              disabled={disabled}
              options={[
                ["keep", "Keep current"],
                ["clear", "Remove customer"],
                // Choosing another customer happens in chat or on the order.
                ...(typeof drafted.customerId === "string"
                  ? ([["set", "Drafted customer"]] as const)
                  : []),
              ]}
              onChange={(choice) =>
                setMeta(
                  "customerId",
                  choice === "set"
                    ? (drafted.customerId ?? undefined)
                    : choice === "clear"
                      ? null
                      : undefined,
                )
              }
            />
            <Choices
              label="Delivery date"
              value={fieldChoice(payload.patch.deliveryDueAt)}
              disabled={disabled}
              options={[
                ["keep", "Keep current"],
                ["clear", "Remove date"],
                ["set", "New date"],
              ]}
              onChange={(choice) => {
                setMeta(
                  "deliveryDueAt",
                  choice === "set" ? "" : choice === "clear" ? null : undefined,
                )
                if (choice === "set" && !due) setPicker("date")
              }}
            />
            {fieldChoice(payload.patch.deliveryDueAt) === "set" ? (
              <View className="flex-row flex-wrap gap-2">
                <ActionButton
                  variant="outline"
                  className="w-auto px-4"
                  disabled={disabled}
                  onPress={() => setPicker("date")}
                >
                  {due ? due.toLocaleDateString() : "Choose date"}
                </ActionButton>
                <ActionButton
                  variant="outline"
                  className="w-auto px-4"
                  disabled={disabled || !due}
                  onPress={() => setPicker("time")}
                >
                  {due
                    ? due.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Choose time"}
                </ActionButton>
              </View>
            ) : null}
            {picker ? (
              <DateTimePicker
                mode={picker}
                value={due ?? new Date()}
                onChange={(event, next) => {
                  if (Platform.OS !== "ios" || event.type === "dismissed")
                    setPicker(null)
                  if (event.type === "set" && next) setDue(next)
                }}
              />
            ) : null}
            <Choices
              label="Notes"
              value={fieldChoice(payload.patch.notes)}
              disabled={disabled}
              options={[
                ["keep", "Keep current"],
                ["clear", "Remove notes"],
                ["set", "New notes"],
              ]}
              onChange={(choice) =>
                setMeta(
                  "notes",
                  choice === "set"
                    ? typeof drafted.notes === "string"
                      ? drafted.notes
                      : ""
                    : choice === "clear"
                      ? null
                      : undefined,
                )
              }
            />
            {fieldChoice(payload.patch.notes) === "set" ? (
              <FormField
                label="New notes"
                value={payload.patch.notes ?? ""}
                editable={!disabled}
                multiline
                maxLength={2000}
                onChangeText={(notes) => setMeta("notes", notes)}
              />
            ) : null}
            <Text className="text-xs text-muted-foreground">
              Totals and stock stay unchanged.
            </Text>
          </>
        ) : null}
        {payload.action === "order_cancel" ? (
          <Text className="text-sm text-foreground">
            Cancelling releases remaining reserved stock. It does not record a
            refund.
          </Text>
        ) : null}
        {"reason" in payload ? (
          <FormField
            label="Reason"
            value={payload.reason}
            editable={!disabled}
            multiline
            maxLength={500}
            onChangeText={(reason) => patch({ reason })}
          />
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

function Choices<T extends FieldChoice | string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  disabled: boolean
  onChange: (value: T) => void
}) {
  return (
    <View className="gap-2" accessibilityRole="radiogroup">
      <Text className="text-sm font-bold text-foreground">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map(([key, text]) => (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === key, disabled }}
            disabled={disabled}
            haptic
            className={cn(
              // Constant border width: dropping it on select leaves the label
              // undrawn on Android.
              "min-h-11 justify-center rounded-full border px-4",
              value === key
                ? "border-foreground bg-foreground"
                : "border-border bg-card",
            )}
            onPress={() => onChange(key)}
          >
            <Text
              className={cn(
                "text-[13px] font-bold",
                value === key ? "text-background" : "text-foreground",
              )}
            >
              {text}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}
