import { ActionButton } from "@/components/mobile/action-button"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { useMemo, useState } from "react"
import { Modal as NativeModal, View, useWindowDimensions } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { CatalogVariantFields } from "./catalog-variant-fields"
import { CatalogVariantList } from "./catalog-variant-list"
import {
  type CatalogVariantManagerProps,
  catalogVariantRows,
} from "./catalog-variant-model"
import { useCatalogVariants } from "./use-catalog-variants"

export type { CatalogVariantDraft } from "./catalog-variant-model"

export function CatalogVariantManager(props: CatalogVariantManagerProps) {
  const model = useCatalogVariants(props)
  const { height } = useWindowDimensions()
  const [footerHeight, setFooterHeight] = useState(88)
  const rows = useMemo(
    () => catalogVariantRows(props),
    [
      props.basePrice,
      props.canonicalTransactionScale,
      props.combinations,
      props.currencyCode,
      props.drafts,
      props.kind,
      props.makeDefaultDraft,
      props.optionPricingOnly,
      props.unitName,
      props.units,
    ],
  )
  const combination = props.combinations.find(
    (row) => row.key === model.action?.key,
  )
  const actionUnit = props.units.find(
    (unit) => unit.id === model.action?.unitId,
  )
  const editorCombination = props.combinations.find(
    (row) => row.key === model.editor?.key,
  )
  const editorUnit = props.units.find(
    (unit) => unit.id === model.editor?.unitId,
  )
  const editorTitle =
    [editorCombination?.name, editorUnit?.name].filter(Boolean).join(" · ") ||
    "Edit option"
  const disabled = Boolean(props.disabled)
  return (
    <>
      <CatalogVariantList
        rows={rows}
        kind={props.kind}
        disabled={disabled}
        onEdit={model.openEditor}
        onMenu={model.openActions}
        onPageChange={props.onPageChange}
      />
      <Modal
        ref={model.actionModal.ref}
        onDismiss={model.onActionDismiss}
        snapPoints={[]}
        enableDynamicSizing
        maxDynamicContentSize={height * 0.44}
        hideHeader
      >
        <BottomSheetScrollView keyboardShouldPersistTaps="handled">
          <View className="gap-2 bg-card px-5 pt-4 pb-6">
            <Text
              accessibilityRole="header"
              className="text-lg font-extrabold text-foreground"
            >
              {[combination?.name, actionUnit?.name]
                .filter(Boolean)
                .join(" · ") || "Option"}
            </Text>
            {combination ? (
              <>
                <VariantMenuAction
                  disabled={disabled}
                  icon="Pencil"
                  label="Edit"
                  onPress={model.editFromActions}
                />
                <VariantMenuAction
                  disabled={disabled}
                  icon={
                    model.getDraft(combination.key).enabled ? "EyeOff" : "Check"
                  }
                  label={
                    model.getDraft(combination.key).enabled
                      ? "Disable entire option combination"
                      : "Enable entire option combination"
                  }
                  onPress={model.toggleEnabledFromActions}
                />
              </>
            ) : null}
          </View>
        </BottomSheetScrollView>
      </Modal>
      <NativeModal
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        navigationBarTranslucent
        visible={
          Boolean(model.editor) && !disabled && Boolean(editorCombination)
        }
        onRequestClose={model.closeEditor}
      >
        <MobileWorkflowChrome
          hideHeader={false}
          keyboardBottomOffset={footerHeight + 12}
          title={editorTitle}
          closeLabel="Cancel option changes"
          onClose={model.closeEditor}
        >
          <VariableContextProvider
            value={{ "--variant-editor-footer": footerHeight + 24 }}
          >
            <View className="flex-1">
              <KeyboardAwareScrollView
                key={model.editorExpanded ? "details" : "basics"}
                className="flex-1"
                bottomOffset={footerHeight + 12}
                extraKeyboardSpace={0}
                disableScrollOnKeyboardHide
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
              >
                <View className="pb-[var(--variant-editor-footer)]">
                  <CatalogVariantFields {...props} model={model} />
                </View>
              </KeyboardAwareScrollView>
              <BottomSearchFooter
                accessibilityLabel="Option editor actions"
                onHeightChange={setFooterHeight}
                searchVisible={false}
                onChangeText={() => undefined}
                placeholder=""
                totalCount={0}
                value=""
              >
                {model.editorError ? (
                  <StatusBanner
                    tone="destructive"
                    message={model.editorError}
                  />
                ) : null}
                <ActionButton disabled={disabled} onPress={model.saveEditor}>
                  Save option changes
                </ActionButton>
              </BottomSearchFooter>
            </View>
          </VariableContextProvider>
        </MobileWorkflowChrome>
      </NativeModal>
    </>
  )
}

function VariantMenuAction({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled: boolean
  icon: "Check" | "EyeOff" | "Pencil"
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      haptic
      className="min-h-14 flex-row items-start gap-3 border-b border-border py-3 last:border-b-0"
    >
      <View className="size-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon name={icon} className="size-sm text-foreground" />
      </View>
      <View className="min-h-10 min-w-0 flex-1 justify-center">
        <Text className="font-semibold text-foreground">{label}</Text>
      </View>
    </Pressable>
  )
}
