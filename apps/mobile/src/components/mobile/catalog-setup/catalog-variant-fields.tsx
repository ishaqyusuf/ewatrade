import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { Text } from "@/components/ui/text"
import { View } from "react-native"
import type { CatalogVariantManagerProps } from "./catalog-variant-model"
import type { CatalogVariantsModel } from "./use-catalog-variants"
import { CatalogVariantBasics } from "./catalog-variant-basics"
import { CatalogVariantDetails } from "./catalog-variant-details"

export function CatalogVariantFields({
  model,
  market,
  ...props
}: CatalogVariantManagerProps & {
  model: CatalogVariantsModel
  market: boolean
}) {
  const { editor, editorExpanded, canUndoEditorQuickFill } = model
  if (!editor) return null
  return (
    <View className="gap-5 px-5 pt-4">
      {market ? (
        <View className="gap-2 border-b border-market-line pb-5">
          <Text className="font-market-mono text-[11px] uppercase tracking-[1px] text-market-muted-ink">
            {editorExpanded ? "02 / More details" : "01 / Price & stock"}
          </Text>
          <Text className="font-market-display text-[28px] text-market-ink [-rn-line-height:34]">
            {editorExpanded
              ? "Make this choice clear."
              : "Every choice, priced."}
          </Text>
          <Text className="text-sm text-market-muted-ink [-rn-line-height:21]">
            Changes stay in this draft until you save the item.
          </Text>
        </View>
      ) : null}
      <QaQuickFillButton
        canUndo={canUndoEditorQuickFill}
        formId="mobile.catalog.options"
        isDirty={Boolean(
          editor.draft.description ||
            editor.draft.price ||
            editor.draft.quantity ||
            editor.draft.sku ||
            Object.values(editor.draft.unitPrices).some(Boolean),
        )}
        onFill={model.fillEditor}
        onUndo={model.undoEditorFill}
      />

      {editorExpanded ? (
        <CatalogVariantDetails {...props} model={model} market={market} />
      ) : (
        <CatalogVariantBasics {...props} model={model} market={market} />
      )}
    </View>
  )
}
