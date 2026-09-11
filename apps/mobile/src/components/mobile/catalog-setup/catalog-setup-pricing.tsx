import { Text } from "@/components/ui/text"
import { View, type LayoutChangeEvent } from "react-native"
import { CatalogVariantManager } from "./catalog-variant-manager"
import { catalogSetupClassName } from "./catalog-setup-presentation"
import type { CatalogSetupModel } from "./use-catalog-setup"

export function CatalogSetupPricing({
  model,
  market,
  onLayout,
  onPageChange,
}: {
  model: CatalogSetupModel
  market: boolean
  onLayout: (event: LayoutChangeEvent) => void
  onPageChange: () => void
}) {
  const {
    kind,
    price,
    multiplePriceOptions,
    unitName,
    showAdvanced,
    canonicalTransactionScale,
    variantDrafts,
    setVariantDrafts,
    additionalUnits,
    currencyCode,
    stores,
    combinations,
    makeDefaultVariantDraft,
  } = model
  if (!kind) return null
  return (
    <>
      {showAdvanced ? (
        <View
          onLayout={onLayout}
          className={catalogSetupClassName(
            "mt-3 gap-5 border-t border-border pt-7",
            market,
          )}
        >
          <View className={catalogSetupClassName("gap-1", market)}>
            <Text
              className={catalogSetupClassName(
                "text-lg font-extrabold text-foreground",
                market,
              )}
            >
              {kind === "product"
                ? "Product stock & pricing"
                : "Price each choice"}
            </Text>
            <Text
              className={catalogSetupClassName(
                "text-xs [-rn-line-height:20] text-muted-foreground",
                market,
              )}
            >
              {kind === "product"
                ? "Open any option and unit combination to set its price, stock, and details."
                : "Set a fixed price, request a quote, or add customer-facing details for each choice."}
            </Text>
          </View>
          <CatalogVariantManager
            onPageChange={onPageChange}
            disabled={model.locked}
            basePrice={price}
            canonicalTransactionScale={canonicalTransactionScale}
            combinations={combinations}
            currencyCode={currencyCode}
            drafts={variantDrafts}
            kind={kind}
            makeDefaultDraft={makeDefaultVariantDraft}
            onChangeDraft={(key, draft) =>
              setVariantDrafts((current) => ({
                ...current,
                [key]: draft,
              }))
            }
            optionPricingOnly={kind === "product" && multiplePriceOptions}
            stores={stores}
            unitName={unitName}
            units={additionalUnits}
          />
          {kind === "service" ? (
            <View
              className={catalogSetupClassName(
                "border-l-2 border-primary bg-muted px-3 py-3",
                market,
              )}
            >
              <Text
                className={catalogSetupClassName(
                  "text-xs [-rn-line-height:20] text-muted-foreground",
                  market,
                )}
              >
                A fixed price is optional. Use Quote when the final amount
                depends on the customer request.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  )
}
