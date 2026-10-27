import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { RowDivider, StatusPill } from "../green-till/kit"
import { NATIVE_BANK_REASON_MAX } from "./finance-bank-match-state"

/*
 * Workshop mobile/bank-matching 01 "Pick both sides": checkable bank and
 * posted rows, a footer with both totals, a reason sheet, and matched groups
 * with Undo match.
 */

/** A checkable row: a padded Pressable inside an unpadded clipped card. */
export function BankPickRow({
  title,
  meta,
  amount,
  checked,
  disabled,
  last,
  onToggle,
  onOpenSource,
  sourceLabel,
}: {
  title: string
  meta: string
  amount: string
  checked: boolean
  disabled: boolean
  last: boolean
  onToggle: () => void
  onOpenSource?: () => void
  sourceLabel?: string
}) {
  const colors = useColors()
  const largeText = useLargeTextLayout()
  return (
    <View className={cn("flex-row items-center", checked && "bg-primary/5")}>
      <Pressable
        accessibilityLabel={`${title}, ${amount}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        className={cn(
          "min-h-[62px] min-w-0 flex-1 flex-row items-center gap-3 py-3 pl-3.5",
          onOpenSource ? "pr-1" : "pr-3.5",
          disabled && "opacity-50",
        )}
        disabled={disabled}
        haptic="selection"
        onPress={onToggle}
      >
        <View
          className={cn(
            "size-[22px] items-center justify-center rounded-[7px] border-2",
            checked ? "border-primary bg-primary" : "border-border",
          )}
        >
          {checked ? (
            <Icon
              className="size-[14px]"
              color={colors.primaryForeground}
              name="Check"
            />
          ) : null}
        </View>
        <View className="min-w-0 flex-1">
          <Text
            className="text-sm font-bold [-rn-line-height:22] text-foreground"
            numberOfLines={largeText ? undefined : 1}
          >
            {title}
          </Text>
          <Text
            className="text-xs [-rn-line-height:22] text-muted-foreground"
            numberOfLines={largeText ? undefined : 1}
          >
            {meta}
          </Text>
        </View>
        <Text className="text-sm font-bold tabular-nums text-foreground">
          {amount}
        </Text>
      </Pressable>
      {onOpenSource ? (
        <Pressable
          accessibilityLabel={`Open original ${sourceLabel ?? "record"}`}
          accessibilityRole="button"
          className="mr-1.5 size-11 items-center justify-center rounded-full"
          haptic
          onPress={onOpenSource}
        >
          <Icon
            className="size-[18px]"
            color={colors.mutedForeground}
            name="FileText"
          />
        </Pressable>
      ) : null}
      {last ? null : <RowDivider />}
    </View>
  )
}

type GroupLine = {
  key: string
  side: "Bank" | "Posted"
  label: string
  amount: string
}

export function BankMatchedGroupCard({
  amount,
  lines,
  reason,
  footnote,
  canUndo,
  disabled,
  onUndo,
}: {
  amount: string
  lines: GroupLine[]
  reason: string | null
  footnote: string | null
  canUndo: boolean
  disabled: boolean
  onUndo: () => void
}) {
  return (
    <View className="mb-2.5 gap-1.5 rounded-[20px] bg-card px-3.5 py-3 shadow-sm">
      <View className="flex-row items-center justify-between gap-3">
        <StatusPill icon="Link" label="Matched" tone="ok" />
        <Text className="text-base font-extrabold tabular-nums text-foreground">
          {amount}
        </Text>
      </View>
      {lines.map((line) => (
        <View key={line.key} className="flex-row items-center gap-2">
          <View
            className={cn(
              "rounded-md px-1.5 py-0.5",
              line.side === "Bank" ? "bg-tint-sky" : "bg-muted",
            )}
          >
            <Text
              className={cn(
                "text-[11px] font-extrabold",
                line.side === "Bank"
                  ? "text-tint-sky-foreground"
                  : "text-muted-foreground",
              )}
            >
              {line.side}
            </Text>
          </View>
          <Text
            className="min-w-0 flex-1 text-[13px] text-foreground"
            numberOfLines={1}
          >
            {line.label}
          </Text>
          <Text className="text-[13px] font-bold tabular-nums text-foreground">
            {line.amount}
          </Text>
        </View>
      ))}
      {reason ? (
        <Text className="text-xs text-muted-foreground">“{reason}”</Text>
      ) : null}
      <View className="mt-1 flex-row items-center justify-between gap-3 border-t border-border pt-1.5">
        <Text className="min-w-0 flex-1 text-[11px] text-muted-foreground">
          {footnote ?? ""}
        </Text>
        {canUndo ? (
          <Pressable
            accessibilityRole="button"
            className={cn(
              "min-h-11 justify-center px-1",
              disabled && "opacity-50",
            )}
            disabled={disabled}
            haptic
            onPress={onUndo}
          >
            <Text className="text-[13px] font-extrabold text-primary">
              Undo match
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

export function BankMatchFooter({
  bankCount,
  postedCount,
  bankTotal,
  postedTotal,
  difference,
  equal,
  differ,
  disabled,
  offline,
  onMatch,
  onClear,
  onOpenSource,
}: {
  bankCount: number
  postedCount: number
  bankTotal: string
  postedTotal: string
  difference: string
  equal: boolean
  differ: boolean
  disabled: boolean
  offline: boolean
  onMatch: () => void
  onClear: () => void
  /** Totals differ with one posted record: open it to correct the source. */
  onOpenSource?: () => void
}) {
  const count = bankCount + postedCount
  const message = equal
    ? "Totals match"
    : differ
      ? `Differs by ${difference}. Correct the original record, then match.`
      : count
        ? "Pick both sides"
        : "Pick bank rows and posted records with equal totals"
  return (
    <View className="gap-2 border-t border-border bg-background px-[18px] pb-4 pt-2.5">
      {count ? (
        <View className="flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <Text className="text-[11px] font-bold text-muted-foreground">
              Bank · {bankCount}
            </Text>
            <Text className="text-[15px] font-extrabold tabular-nums text-foreground">
              {bankTotal}
            </Text>
          </View>
          <View
            accessibilityLabel={
              equal ? "Equal" : differ ? "Not equal" : undefined
            }
            className={cn(
              "size-[30px] items-center justify-center rounded-full",
              equal ? "bg-tint-mint" : differ ? "bg-tint-rose" : "bg-muted",
            )}
          >
            <Text
              className={cn(
                "text-base font-extrabold",
                equal
                  ? "text-tint-mint-foreground"
                  : differ
                    ? "text-tint-rose-foreground"
                    : "text-muted-foreground",
              )}
            >
              {differ ? "≠" : "="}
            </Text>
          </View>
          <View className="min-w-0 flex-1 items-end">
            <Text className="text-[11px] font-bold text-muted-foreground">
              Posted · {postedCount}
            </Text>
            <Text className="text-[15px] font-extrabold tabular-nums text-foreground">
              {postedTotal}
            </Text>
          </View>
        </View>
      ) : null}
      <View className="flex-row flex-wrap items-center justify-center gap-x-2">
        <Text
          accessibilityLiveRegion="polite"
          className={cn(
            "text-center text-xs font-bold",
            equal
              ? "text-tint-mint-foreground"
              : differ
                ? "text-tint-rose-foreground"
                : "text-muted-foreground",
          )}
        >
          {message}
        </Text>
        {differ && onOpenSource ? (
          <Pressable
            accessibilityRole="button"
            className="min-h-9 justify-center"
            haptic
            onPress={onOpenSource}
          >
            <Text className="text-xs font-extrabold text-primary">
              Open original record
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View className="flex-row gap-3">
        {count ? (
          <ActionButton
            className="flex-1"
            variant="outline"
            disabled={disabled && !offline}
            onPress={onClear}
          >
            Clear
          </ActionButton>
        ) : null}
        <ActionButton
          className={count ? "flex-[2]" : "flex-1"}
          icon="Link"
          disabled={disabled || offline || !equal}
          onPress={onMatch}
        >
          {offline
            ? "Reconnect to match"
            : count
              ? `Match ${count} records`
              : "Match"}
        </ActionButton>
      </View>
    </View>
  )
}

export type BankMatchSheetRecord = {
  key: string
  side: "Bank" | "Posted" | "Total" | "Matched because"
  label: string
}

/** Reason sheet for both Match and Undo match; the reason is never stored. */
export function BankMatchSheet({
  open,
  title,
  kind,
  records,
  total,
  retry,
  busy,
  offline,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean
  title: string
  kind: "MATCH" | "UNMATCH"
  records: BankMatchSheetRecord[]
  total: string
  retry: boolean
  busy: boolean
  offline: boolean
  error: string | null
  onSubmit: (reason: string) => void
  onClose: () => void
}) {
  const modal = useModal()
  const [reason, setReason] = useState("")
  useEffect(() => {
    if (open) {
      setReason("")
      modal.present()
    } else modal.dismiss()
  }, [open, modal.present, modal.dismiss])
  const trimmed = reason.trim()
  const match = kind === "MATCH"
  return (
    <Modal
      ref={modal.ref}
      onDismiss={onClose}
      enablePanDownToClose={!busy}
      snapPoints={["88%"]}
      title={title}
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={{
          gap: 12,
          paddingBottom: 32,
          paddingHorizontal: 18,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-sm text-muted-foreground">
          {match
            ? "Links them as one group. No money moves."
            : "The rows go back to Needs a match. No payment is undone."}
        </Text>
        {retry ? (
          <StatusBanner
            tone="warning"
            title="Finish what you started"
            message="Enter the same reason again. The records you picked are kept. If you change anything, check the saved result first."
          />
        ) : null}
        <View className="rounded-2xl bg-muted px-3">
          {[
            ...records,
            { key: "total", side: "Total" as const, label: total },
          ].map((record, index) => (
            <View
              key={record.key}
              className={cn(
                "flex-row justify-between gap-3 py-2.5",
                index > 0 && "border-t border-border",
              )}
            >
              <Text className="text-[13px] text-muted-foreground">
                {record.side}
              </Text>
              <Text className="min-w-0 flex-1 text-right text-[13px] font-bold text-foreground">
                {record.label}
              </Text>
            </View>
          ))}
        </View>
        <FormField
          accessibilityHint="Required. Up to 400 characters."
          editable={!busy && !offline}
          helper={`${reason.length}/${NATIVE_BANK_REASON_MAX}`}
          label={match ? "Why do they match?" : "Why are you undoing it?"}
          maxLength={NATIVE_BANK_REASON_MAX}
          multiline
          onChangeText={setReason}
          placeholder={
            match ? "Same amount and date" : "Matched to the wrong order"
          }
          value={reason}
        />
        {offline ? (
          <StatusBanner
            icon="WifiOff"
            tone="warning"
            message="Reconnect to match or undo a match."
          />
        ) : null}
        {error ? (
          <StatusBanner tone="destructive" title="Not sent" message={error} />
        ) : null}
        <ActionButton
          tone={match ? "gold" : undefined}
          variant={match ? undefined : "destructive"}
          disabled={!trimmed || busy || offline}
          isLoading={busy}
          onPress={() => onSubmit(reason)}
        >
          {match ? `Confirm match · ${total}` : "Undo match"}
        </ActionButton>
        <ActionButton variant="ghost" disabled={busy} onPress={onClose}>
          {match ? "Back to selection" : "Keep match"}
        </ActionButton>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  )
}
