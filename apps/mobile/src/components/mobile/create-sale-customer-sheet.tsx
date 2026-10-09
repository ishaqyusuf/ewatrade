import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { ActionButton } from "@/components/mobile/action-button"
import { CountrySelect } from "@/components/mobile/country-select"
import {
  CREATE_CUSTOMER_SHEET_SNAP_POINTS,
  type SaleCustomerDraft,
  getCreateCustomerSheetMaxHeight,
  hasCreateCustomerDraft,
  isCreateCustomerSaveDisabled,
} from "@/components/mobile/create-sale-customer-sheet-model"
import { FormField } from "@/components/mobile/form-field"
import { PhoneField, phoneCountryOf } from "@/components/mobile/phone-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { createCustomerFixture } from "@/internal-tooling/fixture-recipes"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import type { MobileDesign } from "@/lib/mobile-design/screens"
import { cn } from "@/lib/utils"
import {
  getCountry,
  toInternationalPhone,
  toLocalPhone,
} from "@ewatrade/utils/countries"
import type {
  BottomSheetBackdropProps,
  BottomSheetFooterProps,
  BottomSheetModal,
} from "@gorhom/bottom-sheet"
import { BottomSheetFooter, useBottomSheetModal } from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { forwardRef, useCallback, useEffect, useRef, useState } from "react"
import { View, useWindowDimensions } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export type { SaleCustomerDraft } from "@/components/mobile/create-sale-customer-sheet-model"

type CreateSaleCustomerSheetProps = {
  appearance?: MobileDesign
  phoneCountryCode?: string
  description?: string
  headline?: string
  disabled?: boolean
  draft: SaleCustomerDraft
  error?: string | null
  isLoading?: boolean
  onChange: (draft: SaleCustomerDraft) => void
  onSave: () => void
  onDismiss?: () => void
  recoveryAction?: { label: string; onPress: () => void; disabled?: boolean }
  saveLabel?: string
}

export const CreateSaleCustomerSheet = forwardRef<
  BottomSheetModal,
  CreateSaleCustomerSheetProps
>(
  (
    {
      appearance = "classic",
      phoneCountryCode,
      description = "Save this contact so it can be selected on future orders.",
      headline = "An order with a name.",
      disabled = false,
      draft,
      error,
      isLoading = false,
      onChange,
      onSave,
      onDismiss,
      recoveryAction,
      saveLabel = "Save customer",
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
    const { height } = useWindowDimensions()
    const palette = useMarketDayPalette()
    const market = appearance === "market-day"
    const [footerHeight, setFooterHeight] = useState(88)
    const hasDraft = hasCreateCustomerDraft(draft)
    // Green Till: a full-screen form that asks for name and phone first;
    // Show more reveals the secondary fields (phone country, email).
    const [moreOpen, setMoreOpen] = useState(false)
    const showMore = market || moreOpen || Boolean(draft.email.trim())
    const insets = useSafeAreaInsets()
    const fullScreen = !market
    const expandedHeight = height - insets.top
    const maxDynamicContentSize = market
      ? getCreateCustomerSheetMaxHeight(height)
      : expandedHeight
    const saveDisabled = isCreateCustomerSaveDisabled({
      disabled: disabled || isLoading,
      name: draft.name,
    })
    const actionDisabled = recoveryAction
      ? Boolean(recoveryAction.disabled || isLoading)
      : saveDisabled
    const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
    const quickFillSnapshot = useRef<SaleCustomerDraft | null>(null)
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <AppBottomSheetBackdrop
          {...props}
          dismissible={!hasDraft && !isLoading}
        />
      ),
      [hasDraft, isLoading],
    )
    const renderFooter = useCallback(
      (props: BottomSheetFooterProps) => (
        <BottomSheetFooter {...props}>
          {/* Full screen: the sheet cannot rise, so Save rides the keyboard. */}
          <KeyboardStickyView enabled={fullScreen}>
            <View
              onLayout={(event) =>
                setFooterHeight(event.nativeEvent.layout.height)
              }
              className={cn(
                "px-5 pb-5 pt-3",
                market ? "bg-market-field" : "bg-card",
              )}
            >
              <ActionButton
                icon={recoveryAction ? "Search" : "UserPlus"}
                disabled={actionDisabled}
                isLoading={isLoading}
                loadingLabel="Saving customer"
                onPress={recoveryAction?.onPress ?? onSave}
                foregroundColor={market ? palette.onPalm : undefined}
                disabledForegroundColor={market ? palette.mutedInk : undefined}
                className={
                  market
                    ? actionDisabled
                      ? "bg-market-line active:bg-market-line"
                      : "bg-market-palm active:bg-market-hero-pressed"
                    : undefined
                }
              >
                {recoveryAction?.label ?? saveLabel}
              </ActionButton>
            </View>
          </KeyboardStickyView>
        </BottomSheetFooter>
      ),
      [
        fullScreen,
        market,
        actionDisabled,
        isLoading,
        onSave,
        palette.onPalm,
        palette.mutedInk,
        saveLabel,
        recoveryAction,
      ],
    )

    return (
      <VariableContextProvider
        value={{
          "--sale-customer-footer": footerHeight,
        }}
      >
        <Modal
          backdropComponent={renderBackdrop}
          enableDynamicSizing={!fullScreen}
          enablePanDownToClose={!hasDraft && !isLoading}
          keyboardBehavior="fillParent"
          footerComponent={renderFooter}
          maxDynamicContentSize={maxDynamicContentSize}
          ref={ref}
          onDismiss={() => {
            setMoreOpen(false)
            onDismiss?.()
          }}
          snapPoints={
            fullScreen ? ["100%"] : [...CREATE_CUSTOMER_SHEET_SNAP_POINTS]
          }
          detached={!fullScreen}
          handleComponent={fullScreen ? null : undefined}
          bottomInset={fullScreen ? 0 : undefined}
          topInset={insets.top}
          accessibilityLabel="Add customer"
          hideHeader={!market}
          title={market ? "Create customer" : undefined}
        >
          <BottomSheetKeyboardAwareScrollView
            bottomOffset={footerHeight + 12}
            disableScrollOnKeyboardHide
            extraKeyboardSpace={0}
            keyboardShouldPersistTaps="handled"
          >
            <View className="gap-4 px-5 pb-5">
              {market ? (
                <>
                  <Text className="border-l-4 border-market-marigold pl-3 font-market-display text-[26px] font-bold text-market-ink [-rn-line-height:32]">
                    {headline}
                  </Text>
                  <Text className="text-sm text-market-muted-ink [-rn-line-height:20]">
                    {description}
                  </Text>
                </>
              ) : (
                <ClassicSheetHeader
                  description={description}
                  dismissible={!isLoading}
                />
              )}
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
                variant={market ? "market" : "green-gate"}
                maxLength={160}
                editable={!isLoading && !disabled}
                autoCapitalize="words"
                label={market ? "Customer name · Required" : "Name · required"}
                leadingIcon="User"
                onChangeText={(name) => onChange({ ...draft, name })}
                placeholder="Enter customer name"
                value={draft.name}
              />
              {market ? (
                <Text className="text-xs font-bold uppercase tracking-[1.4px] text-market-muted-ink">
                  Optional contact
                </Text>
              ) : null}
              {market && useCountryPhone ? (
                <CountrySelect
                  label="Phone country"
                  value={country.code}
                  onChange={setSelectedCountry}
                  disabled={disabled || isLoading}
                />
              ) : null}
              {!market && useCountryPhone ? (
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
                  variant={market ? "market" : "green-gate"}
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
                  variant={market ? "market" : "green-gate"}
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
              {!market ? (
                <ShowMoreToggle
                  hint={useCountryPhone ? "Email" : "Country, email"}
                  open={showMore}
                  locked={Boolean(draft.email.trim())}
                  onToggle={() => setMoreOpen((open) => !open)}
                />
              ) : null}
              <View className="h-[var(--sale-customer-footer)]" />
            </View>
          </BottomSheetKeyboardAwareScrollView>
        </Modal>
      </VariableContextProvider>
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
      <Text className="text-[13.5px] font-extrabold text-primary">
        {open ? "Show less" : "Show more"}
      </Text>
      {open ? null : (
        <Text className="min-w-0 flex-1 text-[12.5px] font-semibold text-muted-foreground">
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

/** Green Till full-screen form bar: X on the left, centred title, line below. */
function ClassicSheetHeader({
  description,
  dismissible,
}: {
  description: string
  dismissible: boolean
}) {
  const { dismiss } = useBottomSheetModal()
  return (
    <View className="gap-3 pt-2">
      <View className="flex-row items-center gap-2.5">
        <Pressable
          accessibilityLabel="Close add customer"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full bg-muted active:bg-accent"
          disabled={!dismissible}
          haptic
          onPress={() => dismiss()}
        >
          <Icon className="size-[18px] text-foreground" name="X" />
        </Pressable>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="min-w-0 flex-1 text-center text-base font-extrabold tracking-tight text-foreground"
        >
          Add customer
        </Text>
        <View className="size-11" />
      </View>
      <Text className="text-[13px] text-muted-foreground">{description}</Text>
    </View>
  )
}
