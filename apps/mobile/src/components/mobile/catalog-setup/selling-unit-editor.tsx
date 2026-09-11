import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { ClassicSellingUnitFields } from "@/components/mobile/appearances/classic/selling-unit-editor"
import { MarketSellingUnitFields } from "@/components/mobile/appearances/market-day/selling-unit-editor"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import {
  type CatalogUnitRelationDirection,
  transposeCatalogUnitRelation,
} from "@ewatrade/utils"
import { VariableContextProvider } from "nativewind"
import { useState } from "react"
import { Keyboard, Modal as NativeModal, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import {
  newUnit,
  type MobileUnitDraft,
  type SellingUnitEditorFieldsProps,
} from "./catalog-setup-model"

export function SellingUnitEditor({
  onClose,
  onSave,
  ...fields
}: SellingUnitEditorFieldsProps & { onClose: () => void; onSave: () => void }) {
  const [footerHeight, setFooterHeight] = useState(88)
  const market = useMobileDesign("first-product") === "market-day"
  const palette = useMarketDayPalette()
  const Fields = market ? MarketSellingUnitFields : ClassicSellingUnitFields
  return (
    <NativeModal
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      visible
      onRequestClose={onClose}
    >
      <MobileWorkflowChrome
        screen="first-product"
        title={fields.isEditingUnit ? "Edit selling unit" : "Add selling unit"}
        closeLabel="Cancel selling unit changes"
        onClose={onClose}
      >
        <VariableContextProvider
          value={{ "--selling-unit-footer": footerHeight + 24 }}
        >
          <View className="flex-1">
            <KeyboardAwareScrollView
              className="flex-1"
              bottomOffset={footerHeight + 12}
              extraKeyboardSpace={0}
              disableScrollOnKeyboardHide
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
            >
              <View className="pt-3 pb-[var(--selling-unit-footer)]">
                <Fields {...fields} />
              </View>
            </KeyboardAwareScrollView>
            <BottomSearchFooter
              variant={market ? "market-day" : "default"}
              accessibilityLabel="Selling unit actions"
              onHeightChange={setFooterHeight}
              searchVisible={false}
              onChangeText={() => undefined}
              placeholder=""
              totalCount={0}
              value=""
            >
              <ActionButton
                onPress={onSave}
                foregroundColor={market ? palette.onPalm : undefined}
                className={
                  market
                    ? "bg-market-palm active:bg-market-hero-pressed"
                    : undefined
                }
              >
                {fields.isEditingUnit
                  ? "Save unit changes"
                  : "Add selling unit"}
              </ActionButton>
            </BottomSearchFooter>
          </View>
        </VariableContextProvider>
      </MobileWorkflowChrome>
    </NativeModal>
  )
}

export function SellingUnitEditorQaFixture() {
  const [visible, setVisible] = useState(true)
  const [draft, setDraft] = useState<MobileUnitDraft>(() => newUnit())

  const changeDirection = (nextDirection: CatalogUnitRelationDirection) => {
    if (!draft.relationCount.trim()) {
      setDraft((current) => ({
        ...current,
        relationDirection: nextDirection,
      }))
      return
    }

    try {
      const relation = transposeCatalogUnitRelation(
        {
          count: draft.relationCount,
          direction: draft.relationDirection,
        },
        nextDirection,
      )
      setDraft((current) => ({
        ...current,
        relationCount: relation.count,
        relationDirection: relation.direction,
      }))
    } catch {
      return
    }
  }

  if (!visible) return null

  return (
    <SellingUnitEditor
      onClose={() => setVisible(false)}
      currencyCode="NGN"
      isEditingUnit={false}
      multiplePriceOptions={false}
      onChangeDirection={changeDirection}
      onChangeDraft={(update) =>
        setDraft((current) => ({ ...current, ...update }))
      }
      onSave={() => {
        Keyboard.dismiss()
        setVisible(false)
      }}
      unitEditorDraft={draft}
      unitEditorError={null}
      unitName="Piece"
    />
  )
}
