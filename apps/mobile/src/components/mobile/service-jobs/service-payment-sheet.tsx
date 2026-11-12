import { ServiceChoice as Choice } from "@/components/mobile/appearances/classic/service-jobs"
import { CheckoutMoneyAccountField } from "@/components/mobile/create-sale/checkout-money-account"
import { FormField } from "@/components/mobile/form-field"
import { FullScreenModal } from "@/components/mobile/full-screen-form"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useOrderPaymentAccount } from "@/hooks/use-order-payment-account"
import { formatMinorMoney, getCurrencySymbol } from "@ewatrade/utils"
import { useCallback, useEffect, useRef, useState } from "react"
import { Keyboard } from "react-native"
import { ServiceAction } from "./service-action"
import type { WorkJob } from "./service-jobs-model"
import {
  type ServicePaymentDraft,
  type ServicePaymentFields,
  type ServicePaymentKind,
  projectServicePayment,
  serviceHandoffOwedMinor,
} from "./service-payment-model"

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
    if (hasDraft && presentation > 0) modal.present()
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
      handoverMethod: fields?.handoverMethod,
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

const METHOD_LABELS = {
  cash: "Cash",
  bank_transfer: "Transfer",
  pos: "POS",
  card: "Card",
  other: "Other",
} as const

export function ServicePaymentSheet({
  editor,
  allowed,
  scopeChanged,
}: { editor: Editor; allowed: boolean; scopeChanged: boolean }) {
  const draft = editor.draft
  const projection = draft
    ? projectServicePayment(draft.job, draft.kind, draft)
    : null
  const account = useOrderPaymentAccount({
    enabled: Boolean(draft && draft.job.balanceDueMinor > 0),
    owner: draft?.job.id ?? "",
    currencyCode: draft?.job.currencyCode ?? "",
    method: draft?.method ?? "cash",
    receivedMinor: projection?.amountMinor ?? 0,
  })
  const disabled =
    !allowed || !projection || Boolean(projection.error) || !account.ready
  const handoff = draft?.kind === "handoff"
  const delivered = draft?.handoverMethod === "delivered"
  const collectMinor = projection?.amountMinor ?? null
  const owedMinor =
    draft && handoff && collectMinor !== null
      ? serviceHandoffOwedMinor(draft.job, collectMinor)
      : 0
  const chosen = account.chosen
  const review = useCallback(() => {
    // The sole eligible account is preselected without a tap; send what shows.
    editor.edit({ moneyAccountId: chosen?.id, moneyAccountName: chosen?.name })
    editor.review()
  }, [chosen?.id, chosen?.name, editor])
  const footer = (
    <View className="gap-2">
      <ServiceAction disabled={disabled} onPress={review}>
        Review {handoff ? "hand-over" : "payment"}
      </ServiceAction>
      <ServiceAction variant="outline" onPress={editor.modal.dismiss}>
        Cancel
      </ServiceAction>
    </View>
  )
  const ink = "text-foreground"
  return (
    <FullScreenModal
      ref={editor.modal.ref}
      title={
        handoff
          ? delivered
            ? "Mark delivered"
            : "Mark collected"
          : "Record payment"
      }
      onDismiss={editor.afterDismiss}
      footer={footer}
    >
      <BottomSheetKeyboardAwareScrollView
        extraKeyboardSpace={0}
        disableScrollOnKeyboardHide
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4 px-5 pt-2 pb-6">
          {editor.reviewError ? (
            <Text
              accessibilityRole="alert"
              className="text-sm text-destructive"
            >
              Review could not open. Your draft is retained. Retry when the job
              is available, or close this sheet to read the error.
            </Text>
          ) : null}
          {scopeChanged ? (
            <Text className={ink}>
              Return to the original account and Store before continuing.
            </Text>
          ) : draft ? (
            <>
              <Text className={`${ink} font-bold`}>
                {draft.job.orderNumber}
              </Text>
              {handoff ? (
                <View className="gap-2">
                  {(
                    [
                      ["collected", "Customer collected"],
                      ["delivered", "Delivered"],
                    ] as const
                  ).map(([value, title]) => (
                    <Choice
                      key={value}
                      title={title}
                      selected={(draft.handoverMethod ?? "collected") === value}
                      disabled={!allowed}
                      onPress={() => editor.edit({ handoverMethod: value })}
                    />
                  ))}
                </View>
              ) : null}
              <Text className={`${ink} text-sm`}>
                {formatMinorMoney(
                  draft.job.balanceDueMinor,
                  draft.job.currencyCode,
                )}{" "}
                outstanding
              </Text>
              {draft.job.balanceDueMinor > 0 ? (
                <>
                  <FormField
                    variant="filled"
                    label={
                      handoff
                        ? `Collect now (${draft.job.currencyCode}, optional)`
                        : `Amount received (${draft.job.currencyCode})`
                    }
                    leadingText={getCurrencySymbol(draft.job.currencyCode)}
                    keyboardType="decimal-pad"
                    value={draft.amount}
                    onChangeText={(amount) => editor.edit({ amount })}
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
                  <CheckoutMoneyAccountField
                    accounts={account.list}
                    disabled={!allowed}
                    method={draft.method}
                    methodLabel={METHOD_LABELS[draft.method]}
                    onChoose={account.choose}
                    onRetry={account.retry}
                    receivedLabel={formatMinorMoney(
                      projection?.amountMinor ?? 0,
                      draft.job.currencyCode,
                    )}
                    state={account.state}
                  />
                  <FormField
                    variant="filled"
                    label="Payment reference (optional)"
                    maxLength={160}
                    value={draft.reference}
                    onChangeText={(reference) => editor.edit({ reference })}
                    editable={allowed}
                  />
                </>
              ) : (
                <Text className={`${ink} text-sm`}>
                  Fully paid. Review the hand-over before marking it done.
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
              {owedMinor > 0 ? (
                <Text
                  accessibilityRole="alert"
                  className="text-sm font-bold text-destructive"
                >
                  {formatMinorMoney(owedMinor, draft.job.currencyCode)} still
                  owed. It stays on the order as owed after the hand-over.
                </Text>
              ) : null}
              <Text className="text-xs text-muted-foreground">
                {handoff
                  ? "All active work must be ready. Record only money you have actually received."
                  : "Record only money you have actually received. This does not charge the customer."}
              </Text>
            </>
          ) : null}
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </FullScreenModal>
  )
}
