import { ActionButton } from "@/components/mobile/action-button"
import {
  type SaleCustomerDraft,
  hasCreateCustomerDraft,
  isCreateCustomerSaveDisabled,
} from "@/components/mobile/create-sale-customer-sheet-model"
import { FormField } from "@/components/mobile/form-field"
import { FullScreenModal } from "@/components/mobile/full-screen-form"
import { PhoneField, phoneCountryOf } from "@/components/mobile/phone-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { createCustomerFixture } from "@/internal-tooling/fixture-recipes"
import {
  getCountry,
  toInternationalPhone,
  toLocalPhone,
} from "@ewatrade/utils/countries"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { type ReactNode, forwardRef, useEffect, useRef, useState } from "react"
import { View } from "react-native"

export type { SaleCustomerDraft } from "@/components/mobile/create-sale-customer-sheet-model"

type CreateSaleCustomerSheetProps = {
  phoneCountryCode?: string
  description?: string
  disabled?: boolean
  draft: SaleCustomerDraft
  error?: string | null
  isLoading?: boolean
  onChange: (draft: SaleCustomerDraft) => void
  onSave: () => void
  onDismiss?: () => void
  recoveryAction?: { label: string; onPress: () => void; disabled?: boolean }
  saveLabel?: string
  /** Extra fields under the contact fields, such as a starting balance. */
  children?: ReactNode
}

export const CreateSaleCustomerSheet = forwardRef<
  BottomSheetModal,
  CreateSaleCustomerSheetProps
>(
  (
    {
      phoneCountryCode,
      description = "Save this contact so it can be selected on future orders.",
      disabled = false,
      draft,
      error,
      isLoading = false,
      onChange,
      onSave,
      onDismiss,
      recoveryAction,
      saveLabel = "Save customer",
      children,
    },
    ref,
  ) => {
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
    const country = getCountry(selectedCountry ?? phoneCountryCode)
    const useCountryPhone = phoneCountryCode !== undefined
    // Green Till keeps the typed local digits (so a trunk 0 is not swallowed)
    // and stores the international number on the draft.
    const [localPhone, setLocalPhone] = useState(() =>
      toLocalPhone(country.dialCode, draft.phone),
    )
    useEffect(() => {
      if (draft.phone === toInternationalPhone(country.dialCode, localPhone))
        return
      // Set from outside (Quick Fill, Undo, reset): follow its country.
      const detected = phoneCountryOf(draft.phone)
      const next = getCountry(detected ?? country.code)
      if (detected && detected !== country.code) setSelectedCountry(detected)
      setLocalPhone(toLocalPhone(next.dialCode, draft.phone))
    }, [draft.phone, country.code, country.dialCode, localPhone])
    const hasDraft = hasCreateCustomerDraft(draft)
    // Green Till: a full-screen form that asks for name and phone first;
    // Show more reveals the secondary fields (phone country, email).
    const [moreOpen, setMoreOpen] = useState(false)
    const showMore = moreOpen || Boolean(draft.email.trim())
    const saveDisabled = isCreateCustomerSaveDisabled({
      disabled: disabled || isLoading,
      name: draft.name,
    })
    const actionDisabled = recoveryAction
      ? Boolean(recoveryAction.disabled || isLoading)
      : saveDisabled
    const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
    const quickFillSnapshot = useRef<SaleCustomerDraft | null>(null)
    return (
      <FullScreenModal
        closeDisabled={isLoading}
        closeLabel="Close add customer"
        footer={
          <ActionButton
            icon={recoveryAction ? "Search" : "UserPlus"}
            disabled={actionDisabled}
            isLoading={isLoading}
            loadingLabel="Saving customer"
            onPress={recoveryAction?.onPress ?? onSave}
          >
            {recoveryAction?.label ?? saveLabel}
          </ActionButton>
        }
        ref={ref}
        onDismiss={() => {
          setMoreOpen(false)
          onDismiss?.()
        }}
        title="Add customer"
      >
        <BottomSheetKeyboardAwareScrollView
          disableScrollOnKeyboardHide
          extraKeyboardSpace={0}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4 px-5 pb-5">
            <Text className="text-xs text-muted-foreground">{description}</Text>
            {error ? (
              <StatusBanner
                icon="AlertCircle"
                message={error}
                title="Check customer details"
                tone="destructive"
              />
            ) : null}
            <QaQuickFillButton
              canUndo={canUndoQuickFill}
              formId="mobile.customer.create"
              isDirty={hasDraft}
              onFill={(context, sequence) => {
                if (isLoading || disabled) return
                quickFillSnapshot.current = draft
                const fixture = createCustomerFixture(context, sequence)
                onChange({
                  email: fixture.email,
                  name: fixture.name,
                  phone: fixture.phone,
                })
                setCanUndoQuickFill(true)
              }}
              onUndo={() => {
                if (isLoading || disabled) return
                if (!quickFillSnapshot.current) return
                onChange(quickFillSnapshot.current)
                quickFillSnapshot.current = null
                setCanUndoQuickFill(false)
              }}
            />
            <FormField
              variant="green-gate"
              maxLength={160}
              editable={!isLoading && !disabled}
              autoCapitalize="words"
              label="Name · required"
              leadingIcon="User"
              onChangeText={(name) => onChange({ ...draft, name })}
              placeholder="Enter customer name"
              value={draft.name}
            />
            {useCountryPhone ? (
              <PhoneField
                countryCode={country.code}
                editable={!isLoading && !disabled}
                label="Phone"
                onChangeText={(digits) => {
                  setLocalPhone(digits)
                  onChange({
                    ...draft,
                    phone: toInternationalPhone(country.dialCode, digits),
                  })
                }}
                onCountryChange={(code) => {
                  setSelectedCountry(code)
                  onChange({
                    ...draft,
                    phone: toInternationalPhone(
                      getCountry(code).dialCode,
                      localPhone,
                    ),
                  })
                }}
                value={localPhone}
                variant="green-gate"
              />
            ) : (
              <FormField
                variant="green-gate"
                maxLength={40}
                editable={!isLoading && !disabled}
                keyboardType="phone-pad"
                label={
                  useCountryPhone ? `Phone · +${country.dialCode}` : "Phone"
                }
                leadingIcon="Phone"
                onChangeText={(phone) =>
                  onChange({
                    ...draft,
                    phone: useCountryPhone
                      ? toInternationalPhone(country.dialCode, phone)
                      : phone,
                  })
                }
                placeholder="Phone number"
                value={
                  useCountryPhone
                    ? toLocalPhone(country.dialCode, draft.phone)
                    : draft.phone
                }
              />
            )}
            {showMore ? (
              <FormField
                variant="green-gate"
                maxLength={320}
                editable={!isLoading && !disabled}
                autoCapitalize="none"
                keyboardType="email-address"
                label="Email"
                leadingIcon="Mail"
                onChangeText={(email) => onChange({ ...draft, email })}
                placeholder="Email address"
                value={draft.email}
              />
            ) : null}
            {children}
            <ShowMoreToggle
              hint={useCountryPhone ? "Email" : "Country, email"}
              open={showMore}
              locked={Boolean(draft.email.trim())}
              onToggle={() => setMoreOpen((open) => !open)}
            />
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </FullScreenModal>
    )
  },
)

CreateSaleCustomerSheet.displayName = "CreateSaleCustomerSheet"

/** Dashed "Show more · Email" row that folds the secondary fields. */
function ShowMoreToggle({
  hint,
  locked,
  onToggle,
  open,
}: {
  hint: string
  /** An email is filled in, so the fields cannot fold away. */
  locked: boolean
  onToggle: () => void
  open: boolean
}) {
  if (open && locked) return null
  return (
    <Pressable
      accessibilityLabel={open ? "Show fewer fields" : "Show more fields"}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      className="min-h-11 flex-row items-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-border px-3.5"
      haptic
      onPress={onToggle}
    >
      <Text className="text-xs font-extrabold text-primary">
        {open ? "Show less" : "Show more"}
      </Text>
      {open ? null : (
        <Text className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">
          {hint}
        </Text>
      )}
      <Icon
        className="ml-auto size-[16px] text-primary"
        name={open ? "ChevronUp" : "ChevronDown"}
      />
    </Pressable>
  )
}
