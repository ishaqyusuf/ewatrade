import { ActionButton } from "@/components/mobile/action-button"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { BarcodeField } from "@/components/mobile/barcode-field"
import { RowDivider, SectionHeader } from "@/components/mobile/green-till/kit"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useState } from "react"
import { Modal as NativeModal, ScrollView } from "react-native"
import { useSaveOfferingBarcode } from "./save-offering-barcode"

export type BarcodeOption = {
  offeringId: string
  name: string
  variantName: string
  barcode: string | null
}

/** Owner/Admin list of each product option's barcode, with an editor per option. */
export function ProductBarcodes({
  catalogItemId,
  options,
}: {
  catalogItemId: string
  options: BarcodeOption[]
}) {
  const [editing, setEditing] = useState<BarcodeOption | null>(null)
  if (!options.length) return null
  const showVariant = new Set(options.map((o) => o.variantName)).size > 1
  return (
    <View>
      <SectionHeader title="Barcodes" />
      <View className="overflow-hidden rounded-[20px] bg-card shadow-sm">
        {options.map((option, index) => (
          <Pressable
            key={option.offeringId}
            accessibilityHint="Scan or type this option's barcode"
            accessibilityLabel={`${option.name}, ${option.barcode ? `barcode ${option.barcode}` : "no barcode"}`}
            accessibilityRole="button"
            className="relative flex-row items-center gap-3 px-3.5 py-3"
            haptic
            onPress={() => setEditing(option)}
          >
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-foreground">
                {showVariant
                  ? `${option.variantName} · ${option.name}`
                  : option.name}
              </Text>
              <Text className="text-xs tabular-nums text-muted-foreground">
                {option.barcode ?? "No barcode"}
              </Text>
            </View>
            <Text className="text-sm font-extrabold text-primary">
              {option.barcode ? "Change" : "Add"}
            </Text>
            {index < options.length - 1 ? <RowDivider /> : null}
          </Pressable>
        ))}
      </View>
      {editing ? (
        <OfferingBarcodeScreen
          catalogItemId={catalogItemId}
          option={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </View>
  )
}

/** Full-screen barcode entry for one option: scan with the camera or type. */
export function OfferingBarcodeScreen({
  catalogItemId,
  option,
  title = "Barcode",
  initialBarcode,
  allowRemove = true,
  saveLabel = "Save barcode",
  onClose,
  onSaved,
}: {
  catalogItemId: string
  option: BarcodeOption
  title?: string
  initialBarcode?: string
  allowRemove?: boolean
  saveLabel?: string
  onClose: () => void
  onSaved?: () => void
}) {
  const [draft, setDraft] = useState(initialBarcode ?? option.barcode ?? "")
  const [error, setError] = useState("")
  const { save, saving } = useSaveOfferingBarcode()
  const code = draft.trim()
  const submit = async (barcode: string | null) => {
    setError("")
    try {
      await save({ catalogItemId, offeringId: option.offeringId, barcode })
      onSaved?.()
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "The barcode could not be saved. Try again.",
      )
    }
  }
  return (
    <NativeModal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
      visible
    >
      <MobileWorkflowChrome
        closeLabel="Close barcode"
        hideHeader={false}
        keyboardBottomOffset={0}
        onClose={onClose}
        title={title}
      >
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8 pt-2"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-base font-extrabold text-foreground">
            {`${option.variantName} · ${option.name}`}
          </Text>
          <BarcodeField
            editable={!saving}
            error={error || undefined}
            label="Barcode"
            maxLength={120}
            onChangeText={(value) => {
              setError("")
              setDraft(value)
            }}
            placeholder="Scan or type"
            value={draft}
          />
          {option.barcode && code && code !== option.barcode ? (
            <Text className="text-xs text-muted-foreground">
              {`This replaces barcode ${option.barcode}. Each option keeps one barcode.`}
            </Text>
          ) : null}
          <ActionButton
            disabled={!code || code === option.barcode || saving}
            isLoading={saving}
            onPress={() => void submit(code)}
          >
            {saveLabel}
          </ActionButton>
          {option.barcode && allowRemove ? (
            <ActionButton
              disabled={saving}
              onPress={() => void submit(null)}
              variant="outline"
            >
              Remove barcode
            </ActionButton>
          ) : null}
        </ScrollView>
      </MobileWorkflowChrome>
    </NativeModal>
  )
}
