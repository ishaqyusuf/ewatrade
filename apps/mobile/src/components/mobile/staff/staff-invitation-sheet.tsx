import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { createStaffFixture } from "@/internal-tooling/fixture-recipes"
import {
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  type BottomSheetModal,
} from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { forwardRef, useCallback, useEffect, useRef, useState } from "react"
import { Keyboard, useWindowDimensions } from "react-native"
import {
  STAFF_INVITE_SHEET_SNAP_POINTS,
  getStaffInviteSheetMaxHeight,
  hasStaffInviteDraft,
} from "../staff-invite-sheet-model"
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
  onClose: () => void
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
    onClose,
    onDismiss,
  },
  ref,
) {
  const { height } = useWindowDimensions()
  const [footerHeight, setFooterHeight] = useState(88)
  const hasDraft = hasStaffInviteDraft(draft)
  const quickFillSnapshot = useRef<StaffDraft | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  useEffect(() => {
    if (!hasDraft) {
      quickFillSnapshot.current = null
      setCanUndo(false)
    }
  }, [hasDraft])
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <AppBottomSheetBackdrop
        {...props}
        dismissible={!hasDraft && !isPending}
      />
    ),
    [hasDraft, isPending],
  )
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <View
          className="bg-card px-5 pb-5 pt-3"
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        >
          <ActionButton
            icon={uncertain ? "Search" : "UserPlus"}
            disabled={uncertain ? recoveryDisabled : !canSubmit}
            isLoading={isPending}
            loadingLabel="Sending invitation"
            onPress={uncertain ? onCheckDirectory : onSave}
          >
            {uncertain ? "Check directory" : "Send invite"}
          </ActionButton>
        </View>
      </BottomSheetFooter>
    ),
    [
      uncertain,
      recoveryDisabled,
      canSubmit,
      isPending,
      onCheckDirectory,
      onSave,
    ],
  )
  return (
    <Modal
      ref={ref}
      hideHeader
      title="Invite attendant"
      onDismiss={onDismiss}
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      enableDynamicSizing
      enablePanDownToClose={!hasDraft && !isPending}
      keyboardBehavior="fillParent"
      maxDynamicContentSize={getStaffInviteSheetMaxHeight(height)}
      snapPoints={[...STAFF_INVITE_SHEET_SNAP_POINTS]}
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={footerHeight + 12}
        extraKeyboardSpace={0}
        disableScrollOnKeyboardHide
        keyboardShouldPersistTaps="handled"
      >
        <VariableContextProvider
          value={{ "--staff-invite-footer": footerHeight }}
        >
          <View className="gap-4 px-5 pb-[var(--staff-invite-footer)]">
            <View className="flex-row items-start justify-between gap-3">
              <Text
                accessibilityRole="header"
                className="min-w-0 flex-1 text-xl font-bold text-foreground"
              >
                {uncertain ? "Result not confirmed" : "Invite attendant"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close invitation"
                accessibilityState={{ disabled: isPending }}
                disabled={isPending}
                onPress={() => {
                  Keyboard.dismiss()
                  onClose()
                }}
                className="size-11 items-center justify-center rounded-full bg-muted"
              >
                <Icon name="X" className="size-sm text-foreground" />
              </Pressable>
            </View>
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
        </VariableContextProvider>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  )
})
