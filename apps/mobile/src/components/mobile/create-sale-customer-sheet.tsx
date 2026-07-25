import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { forwardRef } from "react"
import { View } from "react-native"

export type SaleCustomerDraft = {
  email: string
  name: string
  phone: string
}

type CreateSaleCustomerSheetProps = {
  description?: string
  disabled?: boolean
  draft: SaleCustomerDraft
  error?: string | null
  isLoading?: boolean
  onChange: (draft: SaleCustomerDraft) => void
  onSave: () => void
  saveLabel?: string
}

export const CreateSaleCustomerSheet = forwardRef<
  BottomSheetModal,
  CreateSaleCustomerSheetProps
>(
  (
    {
      description = "Save this contact so it can be selected on future orders.",
      disabled = false,
      draft,
      error,
      isLoading = false,
      onChange,
      onSave,
      saveLabel = "Save customer",
    },
    ref,
  ) => (
    <Modal
      enableDynamicSizing
      maxDynamicContentSize={620}
      ref={ref}
      snapPoints={["72%"]}
      title="Create customer"
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={280}
        contentContainerStyle={{ paddingBottom: 220 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-5 pb-6">
          <View className="gap-1">
            <Text className="text-lg font-extrabold text-foreground">
              Customer details
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              {description}
            </Text>
          </View>
          {error ? (
            <StatusBanner
              icon="AlertCircle"
              message={error}
              title="Check customer details"
              tone="destructive"
            />
          ) : null}
          <FormField
            autoCapitalize="words"
            label="Customer name"
            onChangeText={(name) => onChange({ ...draft, name })}
            placeholder="Enter customer name"
            value={draft.name}
          />
          <FormField
            keyboardType="phone-pad"
            label="Phone"
            onChangeText={(phone) => onChange({ ...draft, phone })}
            placeholder="Optional phone number"
            value={draft.phone}
          />
          <FormField
            autoCapitalize="none"
            keyboardType="email-address"
            label="Email"
            onChangeText={(email) => onChange({ ...draft, email })}
            placeholder="Optional email address"
            value={draft.email}
          />
          <ActionButton
            icon="UserPlus"
            disabled={disabled}
            isLoading={isLoading}
            loadingLabel="Saving customer"
            onPress={onSave}
          >
            {saveLabel}
          </ActionButton>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  ),
)

CreateSaleCustomerSheet.displayName = "CreateSaleCustomerSheet"
