import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "react-native"
import { catalogSetupClassName } from "./catalog-setup-presentation"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import type { CatalogVariantManagerProps } from "./catalog-variant-model"
import type { CatalogVariantsModel } from "./use-catalog-variants"

export function CatalogVariantDetails({
  model,
  market,
  ...props
}: CatalogVariantManagerProps & {
  model: CatalogVariantsModel
  market: boolean
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
    <View className={catalogSetupClassName("gap-5", market)}>
      {kind === "product" ? (
        <Text
          className={catalogSetupClassName(
            "text-sm [-rn-line-height:24] text-muted-foreground",
            market,
          )}
        >
          Optional customer image, inventory codes, and Store availability.
        </Text>
      ) : (
        <View className={catalogSetupClassName("gap-1", market)}>
          <Text
            className={catalogSetupClassName(
              "text-lg font-extrabold text-foreground",
              market,
            )}
          >
            More details
          </Text>
          <Text
            className={catalogSetupClassName(
              "text-sm [-rn-line-height:24] text-muted-foreground",
              market,
            )}
          >
            Optional customer-facing media and where this choice can be
            requested.
          </Text>
        </View>
      )}
      {editorUnit ? (
        <Text
          className={catalogSetupClassName(
            "text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground",
            market,
          )}
        >
          Full option combination settings
        </Text>
      ) : null}
      <FormField
        inputClassName={market ? "bg-market-field text-market-ink" : undefined}
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="url"
        keyboardType="url"
        helper="Use a secure image link customers can open."
        label="Customer image link"
        maxLength={2000}
        leadingIcon="Globe"
        onChangeText={(imageUrl) => updateEditor({ imageUrl })}
        placeholder="https://example.com/image.jpg"
        value={editor.draft.imageUrl}
      />

      {kind === "product" ? (
        <View className={catalogSetupClassName("gap-3", market)}>
          <View className={catalogSetupClassName("gap-1", market)}>
            <Text
              className={catalogSetupClassName(
                "text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground",
                market,
              )}
            >
              Inventory codes
            </Text>
            <Text
              className={catalogSetupClassName(
                "text-xs [-rn-line-height:20] text-muted-foreground",
                market,
              )}
            >
              Optional codes for finding and scanning this exact combination.
            </Text>
          </View>
          <View
            className={catalogSetupClassName(
              largeTextLayout ? "gap-3" : "flex-row gap-3",
              market,
            )}
          >
            <FormField
              inputClassName={
                market ? "bg-market-field text-market-ink" : undefined
              }
              autoCapitalize="characters"
              containerClassName={
                largeTextLayout ? undefined : "min-w-0 flex-1"
              }
              label="SKU"
              maxLength={120}
              onChangeText={(sku) => updateEditor({ sku })}
              placeholder="SKU"
              value={editor.draft.sku}
            />
            <FormField
              inputClassName={
                market ? "bg-market-field text-market-ink" : undefined
              }
              containerClassName={
                largeTextLayout ? undefined : "min-w-0 flex-1"
              }
              label="Barcode"
              maxLength={120}
              onChangeText={(barcode) => updateEditor({ barcode })}
              placeholder="Barcode"
              value={editor.draft.barcode}
            />
          </View>
        </View>
      ) : null}

      {kind === "product" && units.length > 0 ? (
        <View className={catalogSetupClassName("gap-4", market)}>
          <View className={catalogSetupClassName("gap-1", market)}>
            <Text
              className={catalogSetupClassName(
                "text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground",
                market,
              )}
            >
              Prices by unit
            </Text>
            <Text
              className={catalogSetupClassName(
                "text-xs [-rn-line-height:20] text-muted-foreground",
                market,
              )}
            >
              Each unit keeps its own price. Leave blank only when that unit has
              a default price.
            </Text>
          </View>
          {units.map((unit) => (
            <MoneyField
              inputClassName={
                market ? "bg-market-field text-market-ink" : undefined
              }
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
        <View className={catalogSetupClassName("gap-3", market)}>
          <View className={catalogSetupClassName("gap-1", market)}>
            <Text
              className={catalogSetupClassName(
                "text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground",
                market,
              )}
            >
              Availability
            </Text>
            <Text
              className={catalogSetupClassName(
                "text-xs [-rn-line-height:20] text-muted-foreground",
                market,
              )}
            >
              Choose where this choice is available.
            </Text>
          </View>
          <View
            className={catalogSetupClassName("border-y border-border", market)}
          >
            {stores.map((store) => {
              const available = editor.draft.storeIds.includes(store.id)
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: available }}
                  className={catalogSetupClassName(
                    available
                      ? "min-h-16 flex-row items-center gap-3 border-b border-border bg-muted px-3 py-3 last:border-b-0"
                      : "min-h-16 flex-row items-center gap-3 border-b border-border px-3 py-3 last:border-b-0",
                    market,
                  )}
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
                  <View
                    className={catalogSetupClassName(
                      "h-10 w-10 items-center justify-center rounded-full bg-muted",
                      market,
                    )}
                  >
                    <Icon
                      className={catalogSetupClassName(
                        "size-sm text-primary",
                        market,
                      )}
                      name="Building2"
                    />
                  </View>
                  <Text
                    className={catalogSetupClassName(
                      "min-w-0 flex-1 font-bold text-foreground",
                      market,
                    )}
                  >
                    {store.name}
                  </Text>
                  <View
                    className={catalogSetupClassName(
                      available
                        ? "h-7 w-7 items-center justify-center rounded-full bg-primary"
                        : "h-7 w-7 rounded-full border border-border",
                      market,
                    )}
                  >
                    {available ? (
                      <Icon
                        className={catalogSetupClassName(
                          "size-xs text-primary-foreground",
                          market,
                        )}
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
        className={catalogSetupClassName(
          kind === "product"
            ? "-mx-2 min-h-16 flex-row items-center gap-3 border-y border-border px-4 py-3 active:bg-muted"
            : largeTextLayout
              ? "-mx-2 min-h-16 flex-row items-start gap-3 border-y border-border px-3 py-3 pr-3"
              : "-mx-2 min-h-16 flex-row items-center gap-3 border-y border-border px-3 py-3 pr-3",
          market,
        )}
        haptic
        onPress={collapseEditor}
        transition
      >
        <Icon
          className={catalogSetupClassName(
            largeTextLayout
              ? "mt-1 size-xs text-muted-foreground"
              : "size-xs text-muted-foreground",
            market,
          )}
          name="ChevronLeft"
        />
        <View
          className={catalogSetupClassName("min-w-0 flex-1 gap-0.5", market)}
        >
          <Text
            className={catalogSetupClassName(
              "font-bold text-foreground",
              market,
            )}
          >
            {kind === "product"
              ? "Stock, price, and description"
              : "Pricing and description"}
          </Text>
          <Text
            className={catalogSetupClassName(
              "text-xs [-rn-line-height:20] text-muted-foreground",
              market,
            )}
          >
            {kind === "product"
              ? `Return to the main ${editorTitle || "combination"} settings.`
              : "Return to the main choice settings."}
          </Text>
        </View>
        {kind === "product" ? (
          <Icon
            className={catalogSetupClassName(
              "size-xs text-muted-foreground",
              market,
            )}
            name="ChevronRight"
          />
        ) : null}
      </Pressable>
    </View>
  )
}
