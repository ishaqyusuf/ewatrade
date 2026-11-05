import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { FullScreenModal } from "@/components/mobile/full-screen-form"
import { PhoneField } from "@/components/mobile/phone-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { WhatsAppMark } from "@/components/mobile/whatsapp-mark"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { createStaffFixture } from "@/internal-tooling/fixture-recipes"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { forwardRef, useEffect, useRef, useState } from "react"
import { hasStaffInviteDraft } from "../staff-invite-sheet-model"
import {
  type StaffDraft,
  type StaffDraftErrors,
  type StaffInviteChannel,
  type StaffRow,
  staffDraftShows,
} from "./staff-model"

const channels: Array<{ value: StaffInviteChannel; label: string }> = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "both", label: "Both" },
]

function DuplicateBanner({
  duplicate,
}: {
  duplicate: { row: StaffRow; via: "email" | "phone" }
}) {
  const contact =
    duplicate.via === "phone" ? "This WhatsApp number" : "This email"
  return duplicate.row.statusLabel === "Active" ? (
    <StatusBanner
      icon="Users"
      title={`${duplicate.row.name} is already on your staff`}
      message={`${contact} belongs to an active sales rep.`}
    />
  ) : (
    <StatusBanner
      icon="Clock"
      tone="warning"
      title={`${duplicate.row.name} is already invited`}
      message="They haven’t accepted yet. Resend the invite instead of sending a new one."
    />
  )
}

type StaffInvitationSheetProps = {
  draft: StaffDraft
  error: string | null
  fieldErrors: StaffDraftErrors
  duplicate: { row: StaffRow; via: "email" | "phone" } | null
  whatsappEnabled: boolean
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
    fieldErrors,
    duplicate,
    whatsappEnabled,
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
  const largeText = useLargeTextLayout()
  const shows = staffDraftShows(draft)
  const resend = duplicate?.row.statusLabel === "Pending"
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
          icon={uncertain ? "Search" : resend ? "RefreshCw" : "UserPlus"}
          disabled={uncertain ? recoveryDisabled : !canSubmit}
          isLoading={isPending}
          loadingLabel="Sending invitation"
          onPress={uncertain ? onCheckDirectory : onSave}
        >
          {uncertain
            ? "Check directory"
            : resend
              ? "Resend invite"
              : "Send invite"}
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
              onChange({
                ...draft,
                channel: draft.channel === "whatsapp" ? "email" : draft.channel,
                email: fixture.email,
                name: fixture.name,
              })
              setCanUndo(true)
            }}
            onUndo={() => {
              if (locked || !quickFillSnapshot.current) return
              onChange(quickFillSnapshot.current)
              quickFillSnapshot.current = null
              setCanUndo(false)
            }}
          />
          {whatsappEnabled ? (
            <View className="gap-2">
              <Text className="text-xs font-bold text-foreground">
                Invite by
              </Text>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Invite by"
                className={largeText ? "gap-2" : "flex-row flex-wrap gap-2"}
              >
                {channels.map((item) => (
                  <Pressable
                    key={item.value}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: draft.channel === item.value,
                    }}
                    disabled={locked}
                    onPress={() => onChange({ ...draft, channel: item.value })}
                    className={`min-h-11 flex-row items-center justify-center gap-1.5 rounded-full border px-3.5 ${draft.channel === item.value ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                  >
                    {item.value === "whatsapp" ? (
                      <WhatsAppMark size={16} />
                    ) : null}
                    <Text className="text-xs font-semibold text-foreground">
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {shows.email ? (
            <FormField
              variant="filled"
              editable={!locked}
              maxLength={320}
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="email"
              keyboardType="email-address"
              label="Email address"
              leadingIcon="Mail"
              placeholder="attendant@example.com"
              value={draft.email}
              error={fieldErrors.email}
              onChangeText={(email) => onChange({ ...draft, email })}
            />
          ) : null}
          {shows.email && duplicate?.via === "email" ? (
            <DuplicateBanner duplicate={duplicate} />
          ) : null}
          {shows.phone ? (
            <PhoneField
              label="WhatsApp number"
              countryCode={draft.phoneCountry}
              onCountryChange={(phoneCountry) =>
                onChange({ ...draft, phoneCountry })
              }
              value={draft.phone}
              onChangeText={(phone) => onChange({ ...draft, phone })}
              error={fieldErrors.phone}
              variant="filled"
              editable={!locked}
            />
          ) : null}
          {shows.phone && duplicate?.via === "phone" ? (
            <DuplicateBanner duplicate={duplicate} />
          ) : null}
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
