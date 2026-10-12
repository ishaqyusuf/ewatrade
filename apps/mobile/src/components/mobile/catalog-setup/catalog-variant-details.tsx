import { MoneyField } from "@/components/mobile/money-field"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { View } from "react-native"
import type { CatalogVariantManagerProps } from "./catalog-variant-model"
import type { CatalogVariantsModel } from "./use-catalog-variants"

export function CatalogVariantDetails({
  model,
  ...props
}: CatalogVariantManagerProps & {
  model: CatalogVariantsModel
}) {
  const { editor, updateEditor, updateEditorUnitPrice, collapseEditor } = model
  const { kind, currencyCode, units, stores, optionPricingOnly = false } = props
  const largeTextLayout = useLargeTextLayout()
  const editorUnit = units.find((unit) => unit.id === editor?.unitId)
  const editorTitle = props.combinations.find(
    (row) => row.key === editor?.key,
  )?.name

  if (!editor) return null
  return (
    <View className="gap-5">
      {kind === "product" ? (
        <Text className="text-sm [-rn-line-height:24] text-muted-foreground">
          Choices use the item’s image. Choose where this choice is available.
        </Text>
      ) : (
        <View className="gap-1">
          <Text className="text-lg font-extrabold text-foreground">
            More details
          </Text>
          <Text className="text-sm [-rn-line-height:24] text-muted-foreground">
            Choices use the service image. Choose where this choice can be
            requested.
          </Text>
        </View>
      )}
      {editorUnit ? (
        <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
          Full option combination settings
        </Text>
      ) : null}
      {editor.draft.imageUrl.trim() ? (
        <View className="gap-3">
          <Text className="text-sm text-muted-foreground">
            Remove the older image link to use the image selected in Images.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: Boolean(props.disabled) }}
            className="min-h-14 items-center justify-center rounded-xl border border-border px-4 py-3"
            disabled={props.disabled}
            onPress={() => updateEditor({ imageUrl: "" })}
          >
            <Text className="font-bold text-foreground">Remove image link</Text>
          </Pressable>
        </View>
      ) : null}

      {kind === "product" && units.length > 0 ? (
        <View className="gap-4">
          <View className="gap-1">
            <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
              Prices by unit
            </Text>
            <Text className="text-xs [-rn-line-height:20] text-muted-foreground">
              Each unit keeps its own price. Leave blank only when that unit has
              a default price.
            </Text>
          </View>
          {units.map((unit) => (
            <MoneyField
              currencyCode={currencyCode}
              helper={
                optionPricingOnly
                  ? "Set a separate price for this option and unit combination."
                  : unit.price.trim()
                    ? `Defaults to ${currencyCode} ${unit.price}.`
                    : "Set a separate price for this unit."
              }
              key={unit.id}
              label={`${unit.name} price`}
              onChangeValue={(value) => updateEditorUnitPrice(unit.id, value)}
              placeholder={
                (!optionPricingOnly ? unit.price.trim() : "") || "0.00"
              }
              value={editor.draft.unitPrices[unit.id] ?? ""}
            />
          ))}
        </View>
      ) : null}

      {stores.length > 0 ? (
        <View className="gap-3">
          <View className="gap-1">
            <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
              Availability
            </Text>
            <Text className="text-xs [-rn-line-height:20] text-muted-foreground">
              Choose where this choice is available.
            </Text>
          </View>
          <View className="border-y border-border">
            {stores.map((store) => {
              const available = editor.draft.storeIds.includes(store.id)
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: available }}
                  className={
                    available
                      ? "min-h-16 flex-row items-center gap-3 border-b border-border bg-muted px-3 py-3 last:border-b-0"
                      : "min-h-16 flex-row items-center gap-3 border-b border-border px-3 py-3 last:border-b-0"
                  }
                  key={store.id}
                  onPress={() =>
                    updateEditor({
                      storeIds: available
                        ? editor.draft.storeIds.filter(
                            (storeId) => storeId !== store.id,
                          )
                        : [...editor.draft.storeIds, store.id],
                    })
                  }
                >
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Icon className="size-sm text-primary" name="Building2" />
                  </View>
                  <Text className="min-w-0 flex-1 font-bold text-foreground">
                    {store.name}
                  </Text>
                  <View
                    className={
                      available
                        ? "h-7 w-7 items-center justify-center rounded-full bg-primary"
                        : "h-7 w-7 rounded-full border border-border"
                    }
                  >
                    {available ? (
                      <Icon
                        className="size-xs text-primary-foreground"
                        name="Check"
                      />
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : null}

      <Pressable
        accessibilityLabel={
          kind === "product"
            ? "Back to stock, price, and description"
            : "Back to pricing and description"
        }
        className={
          kind === "product"
            ? "-mx-2 min-h-16 flex-row items-center gap-3 border-y border-border px-4 py-3 active:bg-muted"
            : largeTextLayout
              ? "-mx-2 min-h-16 flex-row items-start gap-3 border-y border-border px-3 py-3 pr-3"
              : "-mx-2 min-h-16 flex-row items-center gap-3 border-y border-border px-3 py-3 pr-3"
        }
        haptic
        onPress={collapseEditor}
        transition
      >
        <Icon
          className={
            largeTextLayout
              ? "mt-1 size-xs text-muted-foreground"
              : "size-xs text-muted-foreground"
          }
          name="ChevronLeft"
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-bold text-foreground">
            {kind === "product"
              ? "Stock, price, and description"
              : "Pricing and description"}
          </Text>
          <Text className="text-xs [-rn-line-height:20] text-muted-foreground">
            {kind === "product"
              ? `Return to the main ${editorTitle || "combination"} settings.`
              : "Return to the main choice settings."}
          </Text>
        </View>
        {kind === "product" ? (
          <Icon className="size-xs text-muted-foreground" name="ChevronRight" />
        ) : null}
      </Pressable>
    </View>
  )
}
