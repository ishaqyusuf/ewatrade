import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { Modal, useModal } from "@/components/ui/modal"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  BottomSheetFooter,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet"
import { formatMinorMoney } from "@ewatrade/utils"
import { VariableContextProvider } from "nativewind"
import { useCallback, useEffect, useRef, useState } from "react"
import { Keyboard, useWindowDimensions } from "react-native"
import { ServiceAction } from "./service-action"
import type { WorkJob } from "./service-jobs-model"
import {
  projectServicePayment,
  type ServicePaymentDraft,
  type ServicePaymentFields,
  type ServicePaymentKind,
} from "./service-payment-model"
import { useServiceAppearance } from "./use-service-appearance"

export function useServicePaymentEditor(
  onReview: (draft: ServicePaymentDraft) => boolean,
) {
  const modal = useModal()
  const current = useRef<ServicePaymentDraft | null>(null)
  const pending = useRef<ServicePaymentDraft | null>(null)
  const [draft, setDraft] = useState<ServicePaymentDraft | null>(null)
  const [presentation, setPresentation] = useState(0)
  const [reviewError, setReviewError] = useState(false)
  const hasDraft = draft !== null
  useEffect(() => {
    if (hasDraft) modal.present()
  }, [hasDraft, presentation, modal.present])
  function open(
    job: WorkJob,
    kind: ServicePaymentKind,
    fields?: ServicePaymentFields,
  ) {
    if (current.current) return
    const next: ServicePaymentDraft = {
      job,
      kind,
      amount: fields?.amount ?? "",
      method: fields?.method ?? "cash",
      reference: fields?.reference ?? "",
    }
    current.current = next
    setDraft(next)
    setReviewError(false)
    setPresentation((value) => value + 1)
    Keyboard.dismiss()
  }
  function edit(fields: Partial<ServicePaymentFields>) {
    if (!current.current || pending.current) return
    current.current = { ...current.current, ...fields }
    setDraft(current.current)
  }
  function review() {
    const value = current.current
    if (
      !value ||
      pending.current ||
      projectServicePayment(value.job, value.kind, value).error
    )
      return
    pending.current = { ...value }
    Keyboard.dismiss()
    modal.dismiss()
  }
  function afterDismiss() {
    const next = pending.current
    pending.current = null
    current.current = null
    setDraft(null)
    if (next && !onReview(next)) {
      current.current = next
      setDraft(next)
      setReviewError(true)
      setPresentation((value) => value + 1)
    }
  }
  return { modal, draft, open, edit, review, afterDismiss, reviewError }
}
type Editor = ReturnType<typeof useServicePaymentEditor>

export function ServicePaymentSheet({
  editor,
  allowed,
  scopeChanged,
}: { editor: Editor; allowed: boolean; scopeChanged: boolean }) {
  const { market, ServiceChoice: Choice } = useServiceAppearance()
  const { height } = useWindowDimensions()
  const [footerHeight, setFooterHeight] = useState(120)
  const draft = editor.draft
  const projection = draft
    ? projectServicePayment(draft.job, draft.kind, draft)
    : null
  const disabled = !allowed || !projection || Boolean(projection.error)
  const footer = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <View
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          className={
            market
              ? "gap-2 border-t border-market-line bg-market-field px-5 pb-5 pt-3"
              : "gap-2 border-t border-border bg-card px-5 pb-5 pt-3"
          }
        >
          <ServiceAction disabled={disabled} onPress={editor.review}>
            Review {draft?.kind === "handoff" ? "collection" : "payment"}
          </ServiceAction>
          <ServiceAction variant="outline" onPress={editor.modal.dismiss}>
            Cancel
          </ServiceAction>
        </View>
      </BottomSheetFooter>
    ),
    [disabled, draft?.kind, editor, market],
  )
  const ink = market ? "text-market-ink" : "text-foreground"
  return (
    <Modal
      ref={editor.modal.ref}
      title={
        draft?.kind === "handoff" ? "Collect and hand over" : "Record payment"
      }
      snapPoints={["48%"]}
      enableDynamicSizing
      maxDynamicContentSize={height * 0.72}
      keyboardBehavior="fillParent"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onDismiss={editor.afterDismiss}
      footerComponent={footer}
      backdropComponent={AppBottomSheetBackdrop}
    >
      <VariableContextProvider
        value={{ "--service-payment-footer": footerHeight + 16 }}
      >
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={footerHeight + 12}
          extraKeyboardSpace={0}
          disableScrollOnKeyboardHide
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4 px-5 pt-2 pb-[var(--service-payment-footer)]">
            {editor.reviewError ? (
              <Text
                accessibilityRole="alert"
                className="text-sm text-destructive"
              >
                Review could not open. Your draft is retained. Retry when the
                job is available, or close this sheet to read the error.
              </Text>
            ) : null}
            {scopeChanged ? (
              <Text className={ink}>
                Return to the original account and Store before continuing.
              </Text>
            ) : draft ? (
              <>
                <Text className={ink + " font-bold"}>
                  {draft.job.orderNumber}
                </Text>
                <Text className={ink + " text-sm"}>
                  {formatMinorMoney(
                    draft.job.balanceDueMinor,
                    draft.job.currencyCode,
                  )}{" "}
                  outstanding
                </Text>
                {draft.job.balanceDueMinor > 0 ? (
                  <>
                    <MoneyField
                      variant={market ? "market" : "filled"}
                      currencyCode={draft.job.currencyCode}
                      label="Amount received"
                      value={draft.amount}
                      onChangeValue={(amount) => editor.edit({ amount })}
                      editable={allowed}
                    />
                    <View className="gap-2">
                      {(
                        [
                          ["cash", "Cash"],
                          ["bank_transfer", "Transfer"],
                          ["pos", "POS"],
                          ["card", "Card"],
                          ["other", "Other"],
                        ] as const
                      ).map(([method, title]) => (
                        <Choice
                          key={method}
                          title={title}
                          selected={draft.method === method}
                          disabled={!allowed}
                          onPress={() => editor.edit({ method })}
                        />
                      ))}
                    </View>
                    <FormField
                      variant={market ? "market" : "filled"}
                      label="Payment reference (optional)"
                      maxLength={160}
                      value={draft.reference}
                      onChangeText={(reference) => editor.edit({ reference })}
                      editable={allowed}
                    />
                  </>
                ) : (
                  <Text className={ink + " text-sm"}>
                    No additional payment is due. Review collection before
                    marking the order collected.
                  </Text>
                )}
                {projection?.error && draft.amount.trim() ? (
                  <Text
                    accessibilityRole="alert"
                    className="text-sm text-destructive"
                  >
                    {projection.error}
                  </Text>
                ) : null}
                <Text
                  className={
                    market
                      ? "text-xs text-market-muted-ink"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {draft.kind === "handoff"
                    ? "Collection requires the exact remaining balance and all active work ready."
                    : "Record only money you have actually received. This does not charge the customer."}
                </Text>
              </>
            ) : null}
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </VariableContextProvider>
    </Modal>
  )
}
