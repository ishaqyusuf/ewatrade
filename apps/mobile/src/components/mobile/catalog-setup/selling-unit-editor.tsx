import { ActionButton } from "@/components/mobile/action-button"
import { ClassicSellingUnitFields } from "@/components/mobile/appearances/classic/selling-unit-editor"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { useModal } from "@/components/ui/modal"
import {
  type CatalogUnitRelationDirection,
  transposeCatalogUnitRelation,
} from "@ewatrade/utils"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { useState } from "react"
import { Keyboard, Modal as NativeModal, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import {
  type MobileUnitDraft,
  type SellingUnitEditorFieldsProps,
  newUnit,
} from "./catalog-setup-model"
import { SellingUnitReferenceSheetContext } from "./selling-unit-reference-selector"

export function SellingUnitEditor({
  onClose,
  onSave,
  ...fields
}: SellingUnitEditorFieldsProps & { onClose: () => void; onSave: () => void }) {
  const [footerHeight, setFooterHeight] = useState(88)
  const referenceSheet = useModal()
  const [referencePickerOpen, setReferencePickerOpen] = useState(false)
  return (
    <NativeModal
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      visible
      onRequestClose={referencePickerOpen ? referenceSheet.dismiss : onClose}
    >
      <BottomSheetModalProvider>
        <SellingUnitReferenceSheetContext.Provider
          value={{
            ref: referenceSheet.ref,
            open: referencePickerOpen,
            present: () => {
              Keyboard.dismiss()
              setReferencePickerOpen(true)
              referenceSheet.present()
            },
            dismiss: referenceSheet.dismiss,
            onDismiss: () => setReferencePickerOpen(false),
          }}
        >
          <MobileWorkflowChrome
            hideHeader={false}
            keyboardBottomOffset={footerHeight + 12}
            title={
              fields.isEditingUnit ? "Edit selling unit" : "Add selling unit"
            }
            closeLabel="Cancel selling unit changes"
            onClose={onClose}
          >
            <VariableContextProvider
              value={{ "--selling-unit-footer": footerHeight + 24 }}
            >
              <View
                className="flex-1"
                accessibilityElementsHidden={referencePickerOpen}
                importantForAccessibility={
                  referencePickerOpen ? "no-hide-descendants" : "auto"
                }
              >
                <KeyboardAwareScrollView
                  enabled={!referencePickerOpen}
                  className="flex-1"
                  bottomOffset={footerHeight + 12}
                  extraKeyboardSpace={0}
                  disableScrollOnKeyboardHide
                  keyboardDismissMode="interactive"
                  keyboardShouldPersistTaps="handled"
                >
                  <View className="pt-3 pb-[var(--selling-unit-footer)]">
                    <ClassicSellingUnitFields {...fields} />
                  </View>
                </KeyboardAwareScrollView>
                <BottomSearchFooter
                  variant="action-bar"
                  accessibilityLabel="Selling unit actions"
                  onHeightChange={setFooterHeight}
                  searchVisible={false}
                  onChangeText={() => undefined}
                  placeholder=""
                  totalCount={0}
                  value=""
                >
                  <ActionButton icon="Check" onPress={onSave}>
                    {`${fields.isEditingUnit ? "Save" : "Add"} ${fields.unitEditorDraft.name.trim().toLowerCase() || "selling unit"}`}
                  </ActionButton>
                </BottomSearchFooter>
              </View>
            </VariableContextProvider>
          </MobileWorkflowChrome>
        </SellingUnitReferenceSheetContext.Provider>
      </BottomSheetModalProvider>
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
