import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { FormField } from "@/components/mobile/form-field"
import { Modal, useModal } from "@/components/ui/modal"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  BottomSheetFooter,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { useCallback, useEffect, useRef, useState } from "react"
import { Keyboard, useWindowDimensions } from "react-native"
import { ServiceAction } from "./service-action"
import { actionLabel, type WorkJob, type actions } from "./service-jobs-model"
import { useServiceAppearance } from "./use-service-appearance"

type StatusDraft = {
  jobId: string
  jobLabel: string
  line: WorkJob["lines"][number]
  action: ReturnType<typeof actions>[number]
  reason: string
}
export function useServiceStatusEditor(
  onCommit: (draft: StatusDraft) => boolean,
) {
  const modal = useModal()
  const [draft, setDraft] = useState<StatusDraft | null>(null)
  const [presentation, setPresentation] = useState(0)
  const [reviewError, setReviewError] = useState(false)
  const draftRef = useRef<StatusDraft | null>(null)
  const pending = useRef<StatusDraft | null>(null)
  const hasDraft = draft !== null
  useEffect(() => {
    if (hasDraft) modal.present()
  }, [hasDraft, presentation, modal.present])
  function open(
    job: WorkJob,
    line: StatusDraft["line"],
    action: StatusDraft["action"],
    reason = "",
  ) {
    if (draftRef.current) return
    const next = {
      jobId: job.id,
      jobLabel: job.orderNumber,
      line: { ...line },
      action,
      reason,
    }
    draftRef.current = next
    setDraft(next)
    setReviewError(false)
    setPresentation((value) => value + 1)
    Keyboard.dismiss()
  }
  function edit(reason: string) {
    if (!draftRef.current || pending.current) return
    draftRef.current = { ...draftRef.current, reason }
    setDraft(draftRef.current)
  }
  function review() {
    const current = draftRef.current
    if (!current || pending.current) return
    if (
      (current.action === "blocked" || current.action === "cancelled") &&
      !current.reason.trim()
    )
      return
    pending.current = { ...current, reason: current.reason.trim() }
    Keyboard.dismiss()
    modal.dismiss()
  }
  function afterDismiss() {
    const next = pending.current
    pending.current = null
    draftRef.current = null
    setDraft(null)
    if (next && !onCommit(next)) {
      draftRef.current = next
      setDraft(next)
      setReviewError(true)
      setPresentation((value) => value + 1)
    }
  }
  return { modal, draft, open, edit, review, afterDismiss, reviewError }
}
export type ServiceStatusEditor = ReturnType<typeof useServiceStatusEditor>

export function ServiceStatusSheet({
  editor,
  allowed,
  scopeChanged,
}: { editor: ServiceStatusEditor; allowed: boolean; scopeChanged: boolean }) {
  const { market } = useServiceAppearance()
  const { height } = useWindowDimensions()
  const [footerHeight, setFooterHeight] = useState(120)
  const required =
    editor.draft?.action === "blocked" || editor.draft?.action === "cancelled"
  const disabled = !allowed || (required && !editor.draft?.reason.trim())
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
            Review status
          </ServiceAction>
          <ServiceAction variant="outline" onPress={editor.modal.dismiss}>
            Cancel
          </ServiceAction>
        </View>
      </BottomSheetFooter>
    ),
    [disabled, editor, market],
  )
  const ink = market ? "text-market-ink" : "text-foreground"
  return (
    <Modal
      ref={editor.modal.ref}
      title="Update work status"
      snapPoints={["44%"]}
      enableDynamicSizing
      maxDynamicContentSize={height * 0.64}
      keyboardBehavior="fillParent"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onDismiss={editor.afterDismiss}
      footerComponent={footer}
      backdropComponent={AppBottomSheetBackdrop}
    >
      <VariableContextProvider
        value={{ "--service-status-footer": footerHeight + 16 }}
      >
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={footerHeight + 12}
          extraKeyboardSpace={0}
          disableScrollOnKeyboardHide
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4 px-5 pt-2 pb-[var(--service-status-footer)]">
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
            ) : (
              <>
                <Text className={ink + " font-bold"}>
                  {editor.draft?.jobLabel} ·{" "}
                  {editor.draft?.line.catalogItemName}
                </Text>
                <Text className={ink + " text-sm"}>
                  {editor.draft
                    ? actionLabel(editor.draft.action)
                    : "Update status"}{" "}
                  · {editor.draft?.line.allocatedQuantity} units
                </Text>
                <FormField
                  variant={market ? "market" : "filled"}
                  label={required ? "Reason" : "Reason (optional)"}
                  multiline
                  maxLength={500}
                  value={editor.draft?.reason ?? ""}
                  onChangeText={editor.edit}
                  editable={allowed}
                  helper={
                    required
                      ? "Explain why this work is blocked or cancelled."
                      : "Add context for your team if helpful."
                  }
                />
              </>
            )}
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </VariableContextProvider>
    </Modal>
  )
}
