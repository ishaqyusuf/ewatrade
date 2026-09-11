import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { ActionButton } from "@/components/mobile/action-button"
import {
  CREATE_CUSTOMER_SHEET_SNAP_POINTS,
  type SaleCustomerDraft,
  getCreateCustomerSheetMaxHeight,
  hasCreateCustomerDraft,
  isCreateCustomerSaveDisabled,
} from "@/components/mobile/create-sale-customer-sheet-model"
import { FormField } from "@/components/mobile/form-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import type { MobileDesign } from "@/lib/mobile-design/screens"
import { cn } from "@/lib/utils"
import { VariableContextProvider } from "nativewind"
import { createCustomerFixture } from "@/internal-tooling/fixture-recipes"
import type {
  BottomSheetBackdropProps,
  BottomSheetFooterProps,
  BottomSheetModal,
} from "@gorhom/bottom-sheet"
import { BottomSheetFooter } from "@gorhom/bottom-sheet"
import { forwardRef, useCallback, useRef, useState } from "react"
import { View, useWindowDimensions } from "react-native"

export type { SaleCustomerDraft } from "@/components/mobile/create-sale-customer-sheet-model"

type CreateSaleCustomerSheetProps = {
  appearance?: MobileDesign
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
    const { height } = useWindowDimensions()
    const palette = useMarketDayPalette()
    const market = appearance === "market-day"
    const [footerHeight, setFooterHeight] = useState(88)
    const hasDraft = hasCreateCustomerDraft(draft)
    const maxDynamicContentSize = getCreateCustomerSheetMaxHeight(height)
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
        </BottomSheetFooter>
      ),
      [
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
        value={{ "--sale-customer-footer": footerHeight }}
      >
        <Modal
          backdropComponent={renderBackdrop}
          enableDynamicSizing
          enablePanDownToClose={!hasDraft && !isLoading}
          keyboardBehavior="fillParent"
          footerComponent={renderFooter}
          maxDynamicContentSize={maxDynamicContentSize}
          ref={ref}
          onDismiss={onDismiss}
          snapPoints={CREATE_CUSTOMER_SHEET_SNAP_POINTS}
          title="Create customer"
        >
          <BottomSheetKeyboardAwareScrollView
            bottomOffset={footerHeight + 12}
            disableScrollOnKeyboardHide
            extraKeyboardSpace={0}
            keyboardShouldPersistTaps="handled"
          >
            <View className="gap-4 px-5 pb-5">
              {market ? (
                <Text className="border-l-4 border-market-marigold pl-3 font-market-display text-[26px] font-bold text-market-ink [-rn-line-height:32]">
                  {headline}
                </Text>
              ) : null}
              <Text
                className={cn(
                  "text-sm [-rn-line-height:20]",
                  market ? "text-market-muted-ink" : "text-muted-foreground",
                )}
              >
                {description}
              </Text>
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
                variant={market ? "market" : "filled"}
                maxLength={160}
                editable={!isLoading && !disabled}
                autoCapitalize="words"
                label="Customer name · Required"
                leadingIcon="User"
                onChangeText={(name) => onChange({ ...draft, name })}
                placeholder="Enter customer name"
                value={draft.name}
              />
              <Text
                className={cn(
                  "text-xs font-bold uppercase tracking-[1.4px]",
                  market ? "text-market-muted-ink" : "text-muted-foreground",
                )}
              >
                Optional contact
              </Text>
              <FormField
                variant={market ? "market" : "filled"}
                maxLength={40}
                editable={!isLoading && !disabled}
                keyboardType="phone-pad"
                label="Phone"
                leadingIcon="Phone"
                onChangeText={(phone) => onChange({ ...draft, phone })}
                placeholder="Phone number"
                value={draft.phone}
              />
              <FormField
                variant={market ? "market" : "filled"}
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
              <View className="h-[var(--sale-customer-footer)]" />
            </View>
          </BottomSheetKeyboardAwareScrollView>
        </Modal>
      </VariableContextProvider>
    )
  },
)

CreateSaleCustomerSheet.displayName = "CreateSaleCustomerSheet"
