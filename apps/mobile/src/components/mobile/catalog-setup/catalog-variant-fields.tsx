import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { View } from "react-native"
import { CatalogVariantBasics } from "./catalog-variant-basics"
import { CatalogVariantDetails } from "./catalog-variant-details"
import type { CatalogVariantManagerProps } from "./catalog-variant-model"
import type { CatalogVariantsModel } from "./use-catalog-variants"

export function CatalogVariantFields({
  model,
  ...props
}: CatalogVariantManagerProps & {
  model: CatalogVariantsModel
}) {
  const { editor, editorExpanded, canUndoEditorQuickFill } = model
  if (!editor) return null
  return (
    <View className="gap-5 px-5 pt-4">
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
        <CatalogVariantDetails {...props} model={model} />
      ) : (
        <CatalogVariantBasics {...props} model={model} />
      )}
    </View>
  )
}
