import { ClassicServicePricingModeOption } from "@/components/mobile/appearances/classic/catalog-variant-manager"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { View } from "react-native"
import type { CatalogVariantManagerProps } from "./catalog-variant-model"
import type { CatalogVariantsModel } from "./use-catalog-variants"

export function CatalogVariantBasics({
  model,
  ...props
}: CatalogVariantManagerProps & {
  model: CatalogVariantsModel
}) {
  const {
    editor,
    updateEditor,
    updateEditorUnitPrice,
    descriptionVisible,
    setDescriptionVisible,
    expandEditor,
  } = model
  const {
    kind,
    basePrice,
    currencyCode,
    units,
    optionPricingOnly = false,
  } = props
  const largeTextLayout = useLargeTextLayout()
  const editorUnit = units.find((unit) => unit.id === editor?.unitId)
  if (!editor) return null
  return (
    <>
      {editorUnit ? (
        <Text className="text-sm [-rn-line-height:24] text-muted-foreground">
          Editing the {editorUnit.name} price. Quantity, description, media,
          codes, and availability belong to the full option combination.
        </Text>
      ) : null}

      {kind === "service" && !editorUnit ? (
        <View className="gap-3">
          <View className="gap-1">
            <Text className="text-sm [-rn-line-height:24] text-muted-foreground">
              Choose how this Service choice is priced.
            </Text>
            <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
              Pricing
            </Text>
          </View>
          <View
            accessibilityRole="radiogroup"
            className={largeTextLayout ? "gap-3" : "flex-row gap-3"}
          >
            <ClassicServicePricingModeOption
              description="Show one amount before ordering."
              label="Fixed price"
              onPress={() => updateEditor({ quoteRequired: false })}
              selected={!editor.draft.quoteRequired}
            />
            <ClassicServicePricingModeOption
              description="Confirm price after the request."
              label="Quote"
              onPress={() => updateEditor({ quoteRequired: true })}
              selected={editor.draft.quoteRequired}
            />
          </View>
        </View>
      ) : null}

      <View
        className={
          largeTextLayout && kind === "product" && !editorUnit
            ? "gap-3"
            : "flex-row gap-3"
        }
      >
        {kind === "product" && !editorUnit ? (
          <FormField
            containerClassName={largeTextLayout ? undefined : "min-w-0 flex-1"}
            keyboardType="decimal-pad"
            label="Opening quantity (optional)"
            helper="Blank means no opening-stock declaration."
            onChangeText={(quantity) => updateEditor({ quantity })}
            placeholder="0"
            value={editor.draft.quantity}
          />
        ) : null}
        {kind !== "service" || !editor.draft.quoteRequired ? (
          <MoneyField
            containerClassName={
              largeTextLayout && kind === "product" && !editorUnit
                ? undefined
                : "min-w-0 flex-1"
            }
            currencyCode={currencyCode}
            label={
              editorUnit
                ? `${editorUnit.name} price`
                : kind === "service"
                  ? "Fixed price"
                  : "Price"
            }
            onChangeValue={(price) =>
              editorUnit
                ? updateEditorUnitPrice(editorUnit.id, price)
                : updateEditor({ price })
            }
            placeholder={
              editorUnit
                ? (!optionPricingOnly ? editorUnit.price.trim() : "") || "0.00"
                : (!optionPricingOnly ? basePrice.trim() : "") || "0.00"
            }
            value={
              editorUnit
                ? (editor.draft.unitPrices[editorUnit.id] ?? "")
                : editor.draft.price
            }
          />
        ) : null}
      </View>

      {kind === "service" && editor.draft.quoteRequired ? (
        <View className="rounded-2xl bg-muted px-4 py-3">
          <Text className="text-sm [-rn-line-height:24] text-muted-foreground">
            Final price will be confirmed after the customer request.
          </Text>
        </View>
      ) : null}

      {editorUnit ? null : descriptionVisible ? (
        <FormField
          label="Description"
          maxLength={2000}
          multiline
          onActionPress={() => {
            updateEditor({ description: "" })
            setDescriptionVisible(false)
          }}
          actionLabel="Remove"
          onChangeText={(description) => updateEditor({ description })}
          placeholder="Add notes about this option"
          textAlignVertical="top"
          value={editor.draft.description}
        />
      ) : kind === "service" ? (
        <Pressable
          accessibilityHint="Opens an optional description field"
          accessibilityLabel="Add Service choice description"
          className="-mx-2 min-h-16 flex-row items-center gap-3 border-y border-border px-3 py-3"
          haptic
          onPress={() => setDescriptionVisible(true)}
          transition
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Icon className="size-sm text-foreground" name="Plus" />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="font-bold text-foreground">Description</Text>
            <Text className="text-xs [-rn-line-height:22] text-muted-foreground">
              Explain what this Service choice includes.
            </Text>
          </View>
          <Icon className="size-xs text-muted-foreground" name="ChevronRight" />
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel="Add option description"
          className="min-h-11 flex-row items-center gap-2 self-start rounded-full bg-muted px-4"
          haptic
          onPress={() => setDescriptionVisible(true)}
          transition
        >
          <Icon className="size-xs text-foreground" name="Plus" />
          <Text className="text-sm font-bold text-foreground">
            Add description
          </Text>
        </Pressable>
      )}

      <Pressable
        accessibilityLabel="Show all option settings"
        className="-mx-2 min-h-16 flex-row items-center gap-3 border-b border-border py-3 pl-3 pr-3"
        haptic
        onPress={expandEditor}
        transition
      >
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-bold text-foreground">More details</Text>
          <Text className="text-xs [-rn-line-height:22] text-muted-foreground">
            Image and availability
          </Text>
        </View>
        <Icon className="size-xs text-muted-foreground" name="ChevronRight" />
      </Pressable>
    </>
  )
}
