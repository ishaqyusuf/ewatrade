import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { type ReactNode, useLayoutEffect, useRef, useState } from "react"
import { ActionButton } from "../action-button"
import { FormField } from "../form-field"
import type { NativeStockBalance, nativeStockScope } from "./native-stock-state"

export type StockScope = NonNullable<ReturnType<typeof nativeStockScope>>
export type StockEditorProps<A> = {
  initial: A
  scope: StockScope
  currencyCode: string
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}
export type StockRead = "checking" | "refused" | "ready"

export const stockReadOptions = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}

/**
 * An edited field whose latest value is also kept synchronously. Save reads
 * `live.current`, so a Save in the same turn as an edit (before React
 * re-renders) uses exactly what was typed: never an earlier render's value.
 */
export function useStockField<T>(initial: T | (() => T)) {
  const [value, setValue] = useState(initial)
  const live = useRef(value)
  const [set] = useState(() => (next: T | ((current: T) => T)) => {
    const resolved =
      typeof next === "function"
        ? (next as (current: T) => T)(live.current)
        : next
    live.current = resolved
    setValue(resolved)
  })
  return [value, set, live] as const
}

/**
 * Binds a Save handler to the render that drew it. A handler runs only while
 * its render is the latest committed one, the editor is still mounted and
 * that render allowed saving. Any later render (checking, refused, disabled,
 * new data, edits), an unmount or a scope remount invalidates older handlers,
 * so a retained callback can never send a stale draft.
 */
export function useStockSaveFence(allowed: boolean) {
  const live = useRef<{ render: object | null; mounted: boolean }>({
    render: null,
    mounted: false,
  })
  const render = {}
  useLayoutEffect(() => {
    live.current.render = render
  })
  useLayoutEffect(() => {
    const current = live.current
    current.mounted = true
    return () => {
      current.mounted = false
      current.render = null
    }
  }, [])
  return (run: () => void) => () => {
    const current = live.current
    if (!allowed || !current.mounted || current.render !== render) return
    run()
  }
}

/** Combined state of several reads: any refusal wins, then any check. */
export function stockReadState(states: readonly StockRead[]): StockRead {
  if (states.includes("refused")) return "refused"
  if (states.includes("checking")) return "checking"
  return "ready"
}

export const stockScaleText = (scale: number | undefined) =>
  scale === undefined
    ? "decimal places as the unit allows"
    : scale === 0
      ? "whole numbers"
      : `up to ${scale} decimal place${scale === 1 ? "" : "s"}`

/** Session custody has no label read: never invent a name for it. */
export function stockCustodyText(
  custodyType: NativeStockBalance["custodyType"],
) {
  switch (custodyType) {
    case "STORE":
      return "Store stock"
    case "STAFF":
      return "Staff custody"
    case "SESSION":
      return "Session custody · label unavailable"
    case "TRANSIT":
      return "In transit"
  }
}

export const stockCheckedAt = (updatedAt: number) =>
  Number.isFinite(updatedAt) && updatedAt > 0
    ? `${new Date(updatedAt).toISOString().slice(11, 16)} UTC`
    : "just now"

/** The editor body: intro, content, local error and Save and review. */
export function StockSheet({
  intro,
  fixedNote,
  error,
  saveDisabled,
  onSave,
  children,
}: {
  intro: string
  fixedNote?: string
  error: string | null
  saveDisabled: boolean
  onSave: () => void
  children: ReactNode
}) {
  return (
    <BottomSheetInputProvider>
      <BottomSheetKeyboardAwareScrollView
        contentContainerStyle={{
          gap: 16,
          paddingHorizontal: 18,
          paddingBottom: 32,
        }}
      >
        <Text className="text-sm text-muted-foreground">{intro}</Text>
        {children}
        {fixedNote ? (
          <Text className="text-sm text-muted-foreground">{fixedNote}</Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
        <ActionButton disabled={saveDisabled} onPress={onSave}>
          Save and review
        </ActionButton>
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}

/** Checking or refused fresh reads. Nothing editable renders meanwhile. */
export function StockReadNotice({
  state,
  checking,
  refused,
  retryLabel,
  disabled,
  onRetry,
}: {
  state: "checking" | "refused"
  checking: string
  refused: string
  retryLabel: string
  disabled: boolean
  onRetry: () => void
}) {
  return (
    <View className="gap-3">
      <Text accessibilityRole={state === "refused" ? "alert" : undefined}>
        {state === "checking" ? checking : refused}
      </Text>
      {state === "refused" ? (
        <ActionButton variant="outline" disabled={disabled} onPress={onRetry}>
          {retryLabel}
        </ActionButton>
      ) : null}
    </View>
  )
}

/** A fresh read that loaded but does not fit this draft. */
export function StockBlocked({ children }: { children: string }) {
  return (
    <Text accessibilityRole="alert" className="text-foreground">
      {children}
    </Text>
  )
}

export function StockCard({ children }: { children: ReactNode }) {
  return (
    <View className="gap-2 rounded-lg border border-border bg-card p-3">
      {children}
    </View>
  )
}

export function StockFact({ title, value }: { title: string; value: string }) {
  return (
    <View className="gap-0.5">
      <Text className="text-xs text-muted-foreground">{title}</Text>
      <Text className="text-sm font-medium text-foreground">{value}</Text>
    </View>
  )
}

/** The fixed stock source with its fresh on hand, reserved and available. */
export function StockSourceCard({
  label,
  balance,
  unit,
  checkedAt,
  children,
}: {
  label: string
  balance: NativeStockBalance
  unit: { name: string; scale: number | undefined }
  checkedAt: number
  children?: ReactNode
}) {
  return (
    <StockCard>
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-lg font-bold text-foreground">
        {balance.productName}
        {balance.variantName ? ` · ${balance.variantName}` : ""}
      </Text>
      <Text className="text-sm text-muted-foreground">
        {balance.kind === "PACKAGED_STOCK" ? "Packaged stock" : "Shared pool"} ·{" "}
        {stockCustodyText(balance.custodyType)}
      </Text>
      <Text className="text-sm text-foreground">
        Unit: {unit.name} · {stockScaleText(unit.scale)}
      </Text>
      {children}
      <View className="flex-row flex-wrap gap-x-6 gap-y-2 border-t border-border pt-2">
        <StockFact title="On hand" value={balance.onHandQuantity} />
        <StockFact title="Reserved" value={balance.reservedQuantity} />
        <StockFact
          title="Available"
          value={String(balance.availableQuantity)}
        />
      </View>
      <Text className="text-xs text-muted-foreground">
        In {balance.inventoryUnitName}. Fresh read · checked{" "}
        {stockCheckedAt(checkedAt)}.
      </Text>
    </StockCard>
  )
}

export function StockQuantityField({
  label,
  value,
  scale,
  editable,
  helper,
  onChange,
}: {
  label: string
  value: string
  scale: number | undefined
  editable: boolean
  helper?: string
  onChange: (value: string) => void
}) {
  return (
    <FormField
      label={label}
      value={value}
      editable={editable}
      keyboardType={scale === 0 ? "number-pad" : "decimal-pad"}
      maxLength={19}
      inputClassName="text-2xl font-bold"
      helper={helper ?? `Exact quantity, ${stockScaleText(scale)}.`}
      onChangeText={onChange}
    />
  )
}

export function StockReasonField({
  value,
  editable,
  onChange,
}: {
  value: string
  editable: boolean
  onChange: (value: string) => void
}) {
  return (
    <FormField
      label="Reason"
      value={value}
      editable={editable}
      multiline
      maxLength={500}
      onChangeText={onChange}
    />
  )
}

export function StockChoice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string
  selected: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-11 justify-center rounded-lg border px-3 py-3 ${selected ? "border-primary bg-secondary" : "border-border bg-background"}`}
    >
      <Text className="text-sm text-foreground">{label}</Text>
    </Pressable>
  )
}
