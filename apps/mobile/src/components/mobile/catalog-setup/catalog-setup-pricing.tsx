import { Text } from "@/components/ui/text"
import { type LayoutChangeEvent, View } from "react-native"
import { CatalogVariantManager } from "./catalog-variant-manager"
import type { CatalogSetupModel } from "./use-catalog-setup"

export function CatalogSetupPricing({
  model,
  onLayout,
  onPageChange,
}: {
  model: CatalogSetupModel
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
          className="mt-3 gap-5 border-t border-border pt-7"
        >
          <View className="gap-1">
            <Text className="text-lg font-extrabold text-foreground">
              {kind === "product"
                ? "Product stock & pricing"
                : "Price each choice"}
            </Text>
            <Text className="text-xs [-rn-line-height:22] text-muted-foreground">
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
            <View className="border-l-2 border-primary bg-muted px-3 py-3">
              <Text className="text-xs [-rn-line-height:22] text-muted-foreground">
                Set an amount for each fixed-price choice. Use Quote when the
                amount depends on the customer request.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  )
}
