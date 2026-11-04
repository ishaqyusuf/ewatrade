import { ServiceChoice as Choice } from "@/components/mobile/appearances/classic/service-jobs"
import { FormField } from "@/components/mobile/form-field"
import { FullScreenModal } from "@/components/mobile/full-screen-form"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { createMessageFixture } from "@/internal-tooling/fixture-recipes"
import type { QaFixtureContext } from "@ewatrade/utils/qa-fixtures"
import { useEffect, useRef, useState } from "react"
import { Keyboard } from "react-native"
import { ServiceAction } from "./service-action"
import type { WorkJob } from "./service-jobs-model"

export type ServiceTextFields = {
  body: string
  channel: "" | "sms" | "whatsapp"
}
type TextDraft = ServiceTextFields & { job: WorkJob; kind: "note" | "message" }

export function useServiceTextEditor(
  onReview: (draft: TextDraft) => boolean,
  canEdit: (manager: boolean) => boolean,
) {
  const modal = useModal()
  const current = useRef<TextDraft | null>(null)
  const pending = useRef<TextDraft | null>(null)
  const undo = useRef<string | null>(null)
  const [draft, setDraft] = useState<TextDraft | null>(null)
  const [presentation, setPresentation] = useState(0)
  const [reviewError, setReviewError] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const hasDraft = draft !== null
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new presentation re-presents the same draft after a close.
  useEffect(() => {
    if (hasDraft) modal.present()
  }, [hasDraft, presentation, modal.present])
  function open(
    job: WorkJob,
    kind: TextDraft["kind"],
    fields: ServiceTextFields,
  ) {
    if (current.current || !canEdit(kind === "message")) return
    const next = { job, kind, ...fields }
    current.current = next
    undo.current = null
    setCanUndo(false)
    setDraft(next)
    setReviewError(false)
    setPresentation((value) => value + 1)
    Keyboard.dismiss()
  }
  function edit(fields: Partial<ServiceTextFields>) {
    if (
      !current.current ||
      pending.current ||
      !canEdit(current.current.kind === "message")
    )
      return
    current.current = { ...current.current, ...fields }
    setDraft(current.current)
  }
  function review() {
    const value = current.current
    if (!value || pending.current || !canEdit(value.kind === "message")) return
    if (
      !value.body.trim() ||
      value.body.trim().length > 4000 ||
      (value.kind === "message" && !value.channel)
    )
      return
    pending.current = { ...value, body: value.body.trim() }
    Keyboard.dismiss()
    modal.dismiss()
  }
  function afterDismiss() {
    const next = pending.current
    pending.current = null
    current.current = null
    undo.current = null
    setCanUndo(false)
    setDraft(null)
    if (next && !onReview(next)) {
      current.current = next
      setDraft(next)
      setReviewError(true)
      setPresentation((value) => value + 1)
    }
  }
  function fill(context: QaFixtureContext) {
    if (
      !current.current ||
      current.current.kind !== "message" ||
      pending.current ||
      !canEdit(true)
    )
      return
    undo.current = current.current.body
    edit({ body: createMessageFixture(context).message })
    setCanUndo(true)
  }
  function undoFill() {
    if (
      undo.current === null ||
      !current.current ||
      pending.current ||
      !canEdit(true)
    )
      return
    edit({ body: undo.current })
    undo.current = null
    setCanUndo(false)
  }
  return {
    reviewError,
    modal,
    draft,
    open,
    edit,
    review,
    afterDismiss,
    fill,
    undoFill,
    canUndo,
  }
}

export function ServiceTextSheet({
  editor,
  allowed,
  scopeChanged,
}: {
  editor: ReturnType<typeof useServiceTextEditor>
  allowed: boolean
  scopeChanged: boolean
}) {
  const message = editor.draft?.kind === "message"
  const disabled =
    !allowed || !editor.draft?.body.trim() || (message && !editor.draft.channel)
  const footer = (
    <View className="gap-2">
      <ServiceAction disabled={disabled} onPress={editor.review}>
        Review {message ? "update" : "note"}
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
      title={message ? "Customer update" : "Internal note"}
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
          {scopeChanged || !allowed ? (
            <Text className={ink}>
              Reconnect with the original account, Store and required permission
              to edit this action.
            </Text>
          ) : (
            <>
              <Text className={`${ink} font-bold`}>
                {editor.draft?.job.orderNumber}
              </Text>
              {message ? (
                <View className="gap-2">
                  {(
                    [
                      ["whatsapp", "WhatsApp"],
                      ["sms", "SMS"],
                    ] as const
                  ).map(([channel, title]) => (
                    <Choice
                      key={channel}
                      title={title}
                      selected={editor.draft?.channel === channel}
                      onPress={() => editor.edit({ channel })}
                    />
                  ))}
                </View>
              ) : null}
              <FormField
                variant="filled"
                label={message ? "Message" : "Internal note"}
                multiline
                maxLength={4000}
                value={editor.draft?.body ?? ""}
                onChangeText={(body) => editor.edit({ body })}
                editable={allowed}
              />
              {message ? (
                <QaQuickFillButton
                  formId="mobile.customer.message"
                  canUndo={editor.canUndo}
                  isDirty={Boolean(editor.draft?.body)}
                  onFill={editor.fill}
                  onUndo={editor.undoFill}
                />
              ) : null}
              <Text className="text-xs text-muted-foreground">
                {message
                  ? "Review the channel and message before queuing delivery. Queued does not mean delivered."
                  : "This note stays in the private work record. It is not sent to the customer."}
              </Text>
            </>
          )}
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </FullScreenModal>
  )
}
