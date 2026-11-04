import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { FullScreenModal } from "@/components/mobile/full-screen-form"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { createStaffFixture } from "@/internal-tooling/fixture-recipes"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { forwardRef, useEffect, useRef, useState } from "react"
import { hasStaffInviteDraft } from "../staff-invite-sheet-model"
import type { StaffDraft } from "./staff-model"

type StaffInvitationSheetProps = {
  draft: StaffDraft
  error: string | null
  quotaMessage: string
  locked: boolean
  isPending: boolean
  canSubmit: boolean
  uncertain: boolean
  recoveryDisabled: boolean
  onChange: (draft: StaffDraft) => void
  onSave: () => void
  onCheckDirectory: () => void
  onDismiss: () => void
}

export const StaffInvitationSheet = forwardRef<
  BottomSheetModal,
  StaffInvitationSheetProps
>(function StaffInvitationSheet(
  {
    draft,
    error,
    quotaMessage,
    locked,
    isPending,
    canSubmit,
    uncertain,
    recoveryDisabled,
    onChange,
    onSave,
    onCheckDirectory,
    onDismiss,
  },
  ref,
) {
  const hasDraft = hasStaffInviteDraft(draft)
  const quickFillSnapshot = useRef<StaffDraft | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  useEffect(() => {
    if (!hasDraft) {
      quickFillSnapshot.current = null
      setCanUndo(false)
    }
  }, [hasDraft])
  return (
    <FullScreenModal
      ref={ref}
      title={uncertain ? "Result not confirmed" : "Invite attendant"}
      closeLabel="Close invitation"
      closeDisabled={isPending}
      onDismiss={onDismiss}
      footer={
        <ActionButton
          icon={uncertain ? "Search" : "UserPlus"}
          disabled={uncertain ? recoveryDisabled : !canSubmit}
          isLoading={isPending}
          loadingLabel="Sending invitation"
          onPress={uncertain ? onCheckDirectory : onSave}
        >
          {uncertain ? "Check directory" : "Send invite"}
        </ActionButton>
      }
    >
      <BottomSheetKeyboardAwareScrollView
        extraKeyboardSpace={0}
        disableScrollOnKeyboardHide
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4 px-5 pt-1">
          <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
            An account of their own, with Sales rep access to orders and stock
            work.
          </Text>
          {error ? (
            <StatusBanner
              icon="TriangleAlert"
              title={
                uncertain
                  ? "Check before sending again"
                  : "Check invitation details"
              }
              message={error}
              tone="warning"
            />
          ) : null}
          <QaQuickFillButton
            canUndo={canUndo && !locked}
            formId="mobile.staff.invite"
            isDirty={hasDraft}
            onFill={(context, sequence) => {
              if (locked) return
              quickFillSnapshot.current = draft
              const fixture = createStaffFixture(context, sequence)
              onChange({ email: fixture.email, name: fixture.name })
              setCanUndo(true)
            }}
            onUndo={() => {
              if (locked || !quickFillSnapshot.current) return
              onChange(quickFillSnapshot.current)
              quickFillSnapshot.current = null
              setCanUndo(false)
            }}
          />
          <FormField
            variant="filled"
            editable={!locked}
            maxLength={320}
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="email"
            keyboardType="email-address"
            label="Email address · Required"
            leadingIcon="Mail"
            placeholder="attendant@example.com"
            value={draft.email}
            onChangeText={(email) => onChange({ ...draft, email })}
          />
          <FormField
            variant="filled"
            editable={!locked}
            maxLength={120}
            autoCapitalize="words"
            label="Attendant name · Optional"
            leadingIcon="User"
            placeholder="Enter their name"
            value={draft.name}
            onChangeText={(name) => onChange({ ...draft, name })}
          />
          <Text className="pb-5 text-xs [-rn-line-height:22] text-muted-foreground">
            {quotaMessage}
          </Text>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </FullScreenModal>
  )
})
