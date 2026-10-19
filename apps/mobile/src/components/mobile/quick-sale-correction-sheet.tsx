import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { useQuickSaleCorrection } from "@/hooks/use-quick-sale-correction"
import {
  type CorrectionView,
  type QuickSaleCorrectionAttempt,
  blankQuickSaleLines,
  correctionDescriptionError,
} from "@/lib/quick-sale-correction"
import type { LocalOfflineCommand } from "@/store/offlineCommandStore"
import { formatMinorMoney } from "@ewatrade/utils"
import { useEffect, useMemo, useRef, useState } from "react"

type Correction = ReturnType<typeof useQuickSaleCorrection>

function lineFacts(line: unknown) {
  const entry =
    line && typeof line === "object" ? (line as Record<string, unknown>) : {}
  return {
    custom: entry.custom as string | undefined,
    description:
      typeof entry.description === "string" ? entry.description.trim() : "",
    amountMinor:
      typeof entry.amountMinor === "number" ? entry.amountMinor : null,
    quantity: typeof entry.quantity === "number" ? entry.quantity : null,
  }
}

/**
 * Workshop mobile/quick-sale-correction 01 (Sync sheet, v2). Adds only the
 * missing descriptions of an older queued Quick sale. The other lines and the
 * sale's money, payment, customer and time are read-only. The ladder keeps
 * the original, the local fix and the business record apart, and never claims
 * a sale is absent without a server answer.
 */
export function QuickSaleCorrectionSheet({
  open,
  onClose,
  command,
  attempt,
  view,
  correction,
}: {
  open: boolean
  onClose: () => void
  command: LocalOfflineCommand
  attempt: QuickSaleCorrectionAttempt | null
  view: CorrectionView
  correction: Correction
}) {
  const modal = useModal()
  useEffect(() => {
    if (open) modal.present()
    else modal.dismiss()
  }, [open, modal.present, modal.dismiss])
  const blank = blankQuickSaleLines(command.payload)
  const [values, setValues] = useState<Record<number, string>>({})
  const [touched, setTouched] = useState(false)
  const [notSaved, setNotSaved] = useState(false)
  // This sheet's own lifetime: a new one for each sale shown or each
  // open/close, retired on cleanup. A press kept from an earlier render, a
  // closed or replaced sheet, or work still awaiting storage does nothing.
  const life = useMemo(
    () => ({ alive: false, commandId: command.clientCommandId, open }),
    [command.clientCommandId, open],
  )
  const current = useRef(life)
  current.current = life
  useEffect(() => {
    life.alive = true
    return () => {
      life.alive = false
    }
  }, [life])
  const latest = useRef({ open, view })
  latest.current = { open, view }
  const liveFor = (captured: typeof life) => () =>
    captured.alive &&
    captured.open &&
    current.current === captured &&
    captured.commandId === command.clientCommandId
  const currency = command.displayTotal?.currencyCode ?? "NGN"
  const money = (minor: number | null) =>
    minor === null ? "" : formatMinorMoney(minor, currency)
  const saved = new Map(
    (attempt?.descriptions ?? []).map((entry) => [
      entry.lineIndex,
      entry.description,
    ]),
  )
  const errorFor = (index: number) =>
    touched ? correctionDescriptionError(values[index] ?? "") : null
  const send = async () => {
    const live = liveFor(life)
    if (!live() || !latest.current.open || !latest.current.view.editable) return
    setTouched(true)
    if (blank.some((index) => correctionDescriptionError(values[index] ?? "")))
      return
    setNotSaved(false)
    const outcome = await correction.start(
      command.clientCommandId,
      values,
      live,
    )
    if (outcome === "not_saved" && live()) setNotSaved(true)
  }
  const checkAgain = async () => {
    const live = liveFor(life)
    if (!live() || !latest.current.open || !attempt) return
    setNotSaved(false)
    const outcome = await correction.checkAgain(attempt.key, live)
    if (outcome === "not_saved" && live()) setNotSaved(true)
  }
  const lines = Array.isArray(command.payload.lines)
    ? command.payload.lines
    : []
  return (
    <Modal
      ref={modal.ref}
      onDismiss={onClose}
      snapPoints={["90%"]}
      title={view.editable ? "Add what was sold" : "Quick sale fix"}
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
        <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
          Saved on this phone before descriptions were required.
          {view.editable
            ? " Add what was sold so it can sync. Nothing else about the sale changes."
            : ""}
        </Text>
        <View accessibilityLabel="Status" className="gap-1.5">
          {(
            [
              ["Original sale", view.original],
              ["Your fix", view.fix],
              ["Business record", view.business],
            ] as const
          ).map(([label, value]) => (
            <View className="flex-row gap-2" key={label}>
              <Text className="w-[120px] text-xs text-muted-foreground">
                {label}
              </Text>
              <Text className="min-w-0 flex-1 text-xs font-bold text-foreground">
                {value}
              </Text>
            </View>
          ))}
        </View>
        {view.banner ? (
          <StatusBanner
            message={view.banner.message}
            title={view.banner.title}
            tone={view.banner.tone}
          />
        ) : null}
        {notSaved ? (
          <StatusBanner
            message="The fix couldn't be saved on this phone, so nothing was sent. Try again."
            title="Not saved"
            tone="destructive"
          />
        ) : null}
        {view.kind === "owner" ? null : (
          <View className="gap-2">
            {lines.map((line, index) => {
              const facts = lineFacts(line)
              const isBlank = blank.includes(index)
              const key = `${command.clientCommandId}-${index}`
              if (isBlank && view.editable) {
                const error = errorFor(index)
                return (
                  <View
                    className="gap-1 rounded-[16px] bg-card px-3.5 py-3 shadow-sm"
                    key={key}
                  >
                    <Text className="text-xs font-bold text-muted-foreground">
                      Line {index + 1} · Quick sale · {money(facts.amountMinor)}
                    </Text>
                    <FormField
                      accessibilityHint="Required. Up to 200 characters."
                      error={error ?? undefined}
                      helper={`Required · ${(values[index] ?? "").trim().length}/200`}
                      label="What was sold?"
                      maxLength={240}
                      onBlur={() => setTouched(true)}
                      onChangeText={(value) =>
                        setValues((current) => ({ ...current, [index]: value }))
                      }
                      placeholder="e.g. 2 bags of rice"
                      value={values[index] ?? ""}
                    />
                  </View>
                )
              }
              return (
                <View
                  className="gap-0.5 rounded-[16px] bg-card px-3.5 py-3 shadow-sm"
                  key={key}
                >
                  <Text className="text-xs font-bold text-muted-foreground">
                    Line {index + 1} ·{" "}
                    {facts.custom === "quick_sale"
                      ? "Quick sale"
                      : facts.custom === "additional_cost"
                        ? "Additional cost"
                        : `Catalog item${facts.quantity ? ` × ${facts.quantity}` : ""}`}
                    {facts.amountMinor !== null
                      ? ` · ${money(facts.amountMinor)}`
                      : ""}
                  </Text>
                  <Text className="text-sm text-foreground">
                    {isBlank
                      ? saved.get(index) || "Description not added"
                      : facts.description || "Can't be changed here"}
                  </Text>
                </View>
              )
            })}
            <View
              accessibilityLabel="Unchanged sale details"
              className="gap-1 rounded-[16px] bg-card px-3.5 py-3 shadow-sm"
            >
              {command.displayTotal ? (
                <View className="flex-row justify-between">
                  <Text className="text-sm text-muted-foreground">Total</Text>
                  <Text className="text-sm font-bold text-foreground">
                    {money(command.displayTotal.amountMinor)}
                  </Text>
                </View>
              ) : null}
              <View className="flex-row justify-between">
                <Text className="text-sm text-muted-foreground">Payment</Text>
                <Text className="text-sm font-bold text-foreground">
                  {command.payload.initialPayment
                    ? "Recorded with the sale"
                    : "Pending"}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-muted-foreground">Customer</Text>
                <Text className="text-sm font-bold text-foreground">
                  {command.payload.customerName?.trim() || "Walk-in"}
                </Text>
              </View>
            </View>
          </View>
        )}
        <View className="gap-2">
          {view.primary === "send" ? (
            <ActionButton
              disabled={!correction.canSend}
              onPress={() => void send()}
            >
              Send fix
            </ActionButton>
          ) : view.primary === "check" ? (
            <ActionButton
              disabled={!correction.canSend}
              onPress={() => void checkAgain()}
            >
              {view.kind === "saved" ? "Send saved fix" : "Check again"}
            </ActionButton>
          ) : null}
          <ActionButton onPress={onClose} tone="soft">
            {view.primary === "send"
              ? "Not now"
              : view.primary === "check"
                ? "Close"
                : "Done"}
          </ActionButton>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  )
}
