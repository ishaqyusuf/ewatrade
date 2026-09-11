import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { useMemo, useState } from "react"
import { Modal as NativeModal, View, useWindowDimensions } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { catalogSetupClassName } from "./catalog-setup-presentation"
import { CatalogVariantFields } from "./catalog-variant-fields"
import {
  catalogVariantRows,
  type CatalogVariantManagerProps,
} from "./catalog-variant-model"
import { useCatalogVariants } from "./use-catalog-variants"
import { CatalogVariantList } from "./catalog-variant-list"

export type { CatalogVariantDraft } from "./catalog-variant-model"

export function CatalogVariantManager(props: CatalogVariantManagerProps) {
  const model = useCatalogVariants(props)
  const market = useMobileDesign("first-product") === "market-day"
  const palette = useMarketDayPalette()
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
        market={market}
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
          <View
            className={catalogSetupClassName(
              "gap-2 bg-card px-5 pt-4 pb-6",
              market,
            )}
          >
            <Text
              accessibilityRole="header"
              className={catalogSetupClassName(
                "text-lg font-extrabold text-foreground",
                market,
              )}
            >
              {[combination?.name, actionUnit?.name]
                .filter(Boolean)
                .join(" · ") || "Option"}
            </Text>
            {combination ? (
              <>
                <VariantMenuAction
                  market={market}
                  disabled={disabled}
                  icon="Pencil"
                  label="Edit"
                  onPress={model.editFromActions}
                />
                <VariantMenuAction
                  market={market}
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
          screen="first-product"
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
                  <CatalogVariantFields
                    {...props}
                    model={model}
                    market={market}
                  />
                </View>
              </KeyboardAwareScrollView>
              <BottomSearchFooter
                variant={market ? "market-day" : "default"}
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
                <ActionButton
                  disabled={disabled}
                  onPress={model.saveEditor}
                  foregroundColor={market ? palette.onPalm : undefined}
                  className={
                    market
                      ? "bg-market-palm active:bg-market-hero-pressed"
                      : undefined
                  }
                >
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
  market,
  disabled,
  icon,
  label,
  onPress,
}: {
  market: boolean
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
      className={catalogSetupClassName(
        "min-h-14 flex-row items-start gap-3 border-b border-border py-3 last:border-b-0",
        market,
      )}
    >
      <View
        className={catalogSetupClassName(
          "size-10 shrink-0 items-center justify-center rounded-full bg-muted",
          market,
        )}
      >
        <Icon
          name={icon}
          className={catalogSetupClassName("size-sm text-foreground", market)}
        />
      </View>
      <View className="min-h-10 min-w-0 flex-1 justify-center">
        <Text
          className={catalogSetupClassName(
            "font-semibold text-foreground",
            market,
          )}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )
}
