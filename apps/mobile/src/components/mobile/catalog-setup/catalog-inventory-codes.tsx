import { BarcodeField } from "@/components/mobile/barcode-field"
import { FormField } from "@/components/mobile/form-field"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useState } from "react"
import { Keyboard, View } from "react-native"
import type { CatalogSetupModel } from "./use-catalog-setup"

export function CatalogInventoryCodes({ model }: { model: CatalogSetupModel }) {
  const picker = useModal()
  const [choosing, setChoosing] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const choices = model.showAdvanced
    ? model.combinations
    : [{ key: "default", name: model.name || "This product" }]
  const selected =
    choices.find((choice) => choice.key === selectedKey) ?? choices[0]
  if (!selected)
    return (
      <Text className="text-muted-foreground">
        Finish your customer choices to add their codes.
      </Text>
    )
  const draft =
    model.variantDrafts[selected.key] ?? model.makeDefaultVariantDraft()
  const update = (field: "sku" | "barcode", value: string) => {
    if (model.locked) return
    model.setVariantDrafts((current) => ({
      ...current,
      [selected.key]: {
        ...model.makeDefaultVariantDraft(),
        ...current[selected.key],
        [field]: value,
      },
    }))
  }
  return (
    <View>
      <View
        collapsable={false}
        className="gap-5"
        accessibilityElementsHidden={choosing}
        importantForAccessibility={choosing ? "no-hide-descendants" : "auto"}
      >
        <Text className="text-sm text-muted-foreground">
          SKU is your own reference. Barcode is the code printed on the product.
          Both are optional.
        </Text>
        {choices.length > 1 ? (
          <View className="gap-2">
            <Text className="font-bold text-foreground">Customer choice</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Choose customer choice: ${selected.name}`}
              disabled={model.locked}
              className="min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-input px-4 py-3"
              onPress={() => {
                Keyboard.dismiss()
                setChoosing(true)
                picker.present()
              }}
            >
              <Text className="min-w-0 flex-1 text-foreground">
                {selected.name}
              </Text>
              <Icon
                name="ChevronDown"
                className="size-sm text-muted-foreground"
              />
            </Pressable>
          </View>
        ) : null}
        <Text className="text-sm text-muted-foreground">
          {selected.name} · {model.unitName || "Main unit"}
        </Text>
        <FormField
          label="SKU"
          helper="Your internal reference for this product or choice."
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!model.locked}
          maxLength={120}
          placeholder="e.g. EGG-LARGE"
          value={draft.sku}
          onChangeText={(value) => update("sku", value)}
        />
        <BarcodeField
          key={selected.key}
          label="Barcode"
          helper="Scan with the camera or type the printed code. Keep leading zeros."
          editable={!model.locked}
          maxLength={120}
          placeholder="Enter the printed code"
          value={draft.barcode}
          onChangeText={(value) => update("barcode", value)}
        />
        <Text className="text-sm text-muted-foreground">
          These codes identify the main-unit listing. Each customer choice keeps
          its own codes.
        </Text>
      </View>
      <Modal
        ref={picker.ref}
        title="Customer choice"
        snapPoints={["60%"]}
        onChange={(index) => setChoosing(index >= 0)}
        onDismiss={() => setChoosing(false)}
      >
        <BottomSheetScrollView keyboardShouldPersistTaps="handled">
          <View className="px-5 pb-8">
            {choices.map((choice) => (
              <Pressable
                key={choice.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected.key === choice.key }}
                accessibilityLabel={choice.name}
                disabled={model.locked}
                className="min-h-14 flex-row items-center gap-3 border-b border-border py-4"
                onPress={() => {
                  setSelectedKey(choice.key)
                  picker.dismiss()
                }}
              >
                <Text className="min-w-0 flex-1 text-foreground">
                  {choice.name}
                </Text>
                {selected.key === choice.key ? (
                  <Icon name="Check" className="size-sm text-primary" />
                ) : null}
              </Pressable>
            ))}
          </View>
        </BottomSheetScrollView>
      </Modal>
    </View>
  )
}
