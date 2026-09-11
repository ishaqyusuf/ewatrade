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
import { ClassicServicePricingModeOption } from "@/components/mobile/appearances/classic/catalog-variant-manager"
import { MarketServicePricingModeOption } from "@/components/mobile/appearances/market-day/catalog-variant-manager"

export function CatalogVariantBasics({
  model,
  market,
  ...props
}: CatalogVariantManagerProps & {
  model: CatalogVariantsModel
  market: boolean
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

  const ServicePricingModeOption = market
    ? MarketServicePricingModeOption
    : ClassicServicePricingModeOption
  if (!editor) return null
  return (
    <>
      {editorUnit ? (
        <Text
          className={catalogSetupClassName(
            "text-sm [-rn-line-height:24] text-muted-foreground",
            market,
          )}
        >
          Editing the {editorUnit.name} price. Quantity, description, media,
          codes, and availability belong to the full option combination.
        </Text>
      ) : null}

      {kind === "service" && !editorUnit ? (
        <View className={catalogSetupClassName("gap-3", market)}>
          <View className={catalogSetupClassName("gap-1", market)}>
            <Text
              className={catalogSetupClassName(
                "text-sm [-rn-line-height:24] text-muted-foreground",
                market,
              )}
            >
              Choose how this Service choice is priced.
            </Text>
            <Text
              className={catalogSetupClassName(
                "text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground",
                market,
              )}
            >
              Pricing
            </Text>
          </View>
          <View
            accessibilityRole="radiogroup"
            className={catalogSetupClassName(
              largeTextLayout || market ? "gap-3" : "flex-row gap-3",
              market,
            )}
          >
            <ServicePricingModeOption
              description="Show one amount before ordering."
              label="Fixed price"
              onPress={() => updateEditor({ quoteRequired: false })}
              selected={!editor.draft.quoteRequired}
            />
            <ServicePricingModeOption
              description="Confirm price after the request."
              label="Quote"
              onPress={() => updateEditor({ quoteRequired: true })}
              selected={editor.draft.quoteRequired}
            />
          </View>
        </View>
      ) : null}

      <View
        className={catalogSetupClassName(
          largeTextLayout && kind === "product" && !editorUnit
            ? "gap-3"
            : "flex-row gap-3",
          market,
        )}
      >
        {kind === "product" && !editorUnit ? (
          <FormField
            inputClassName={
              market ? "bg-market-field text-market-ink" : undefined
            }
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
            inputClassName={
              market ? "bg-market-field text-market-ink" : undefined
            }
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
                  ? "Fixed price (optional)"
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
        <View
          className={catalogSetupClassName(
            "rounded-2xl bg-muted px-4 py-3",
            market,
          )}
        >
          <Text
            className={catalogSetupClassName(
              "text-sm [-rn-line-height:24] text-muted-foreground",
              market,
            )}
          >
            Final price will be confirmed after the customer request.
          </Text>
        </View>
      ) : null}

      {editorUnit ? null : descriptionVisible ? (
        <FormField
          inputClassName={
            market ? "bg-market-field text-market-ink" : undefined
          }
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
          className={catalogSetupClassName(
            "-mx-2 min-h-16 flex-row items-center gap-3 border-y border-border px-3 py-3",
            market,
          )}
          haptic
          onPress={() => setDescriptionVisible(true)}
          transition
        >
          <View
            className={catalogSetupClassName(
              "h-10 w-10 items-center justify-center rounded-full bg-muted",
              market,
            )}
          >
            <Icon
              className={catalogSetupClassName(
                "size-sm text-foreground",
                market,
              )}
              name="Plus"
            />
          </View>
          <View
            className={catalogSetupClassName("min-w-0 flex-1 gap-0.5", market)}
          >
            <Text
              className={catalogSetupClassName(
                "font-bold text-foreground",
                market,
              )}
            >
              Description
            </Text>
            <Text
              className={catalogSetupClassName(
                "text-xs [-rn-line-height:20] text-muted-foreground",
                market,
              )}
            >
              Explain what this Service choice includes.
            </Text>
          </View>
          <Icon
            className={catalogSetupClassName(
              "size-xs text-muted-foreground",
              market,
            )}
            name="ChevronRight"
          />
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel="Add option description"
          className={catalogSetupClassName(
            "min-h-11 flex-row items-center gap-2 self-start rounded-full bg-muted px-4",
            market,
          )}
          haptic
          onPress={() => setDescriptionVisible(true)}
          transition
        >
          <Icon
            className={catalogSetupClassName("size-xs text-foreground", market)}
            name="Plus"
          />
          <Text
            className={catalogSetupClassName(
              "text-sm font-bold text-foreground",
              market,
            )}
          >
            Add description
          </Text>
        </Pressable>
      )}

      <Pressable
        accessibilityLabel="Show all option settings"
        className={catalogSetupClassName(
          "-mx-2 min-h-16 flex-row items-center gap-3 border-b border-border py-3 pl-3 pr-3",
          market,
        )}
        haptic
        onPress={expandEditor}
        transition
      >
        <View
          className={catalogSetupClassName("min-w-0 flex-1 gap-0.5", market)}
        >
          <Text
            className={catalogSetupClassName(
              "font-bold text-foreground",
              market,
            )}
          >
            More details
          </Text>
          <Text
            className={catalogSetupClassName(
              "text-xs [-rn-line-height:20] text-muted-foreground",
              market,
            )}
          >
            {kind === "service"
              ? "Image and availability"
              : "Image, inventory codes, and availability"}
          </Text>
        </View>
        <Icon
          className={catalogSetupClassName(
            "size-xs text-muted-foreground",
            market,
          )}
          name="ChevronRight"
        />
      </Pressable>
    </>
  )
}
