import { FormField } from "@/components/mobile/form-field"
import { Text } from "@/components/ui/text"
import { View } from "react-native"
import { catalogSetupClassName } from "./catalog-setup-presentation"
import * as Classic from "@/components/mobile/appearances/classic/catalog-setup"
import * as Market from "@/components/mobile/appearances/market-day/catalog-setup"
import type { CatalogSetupModel } from "./use-catalog-setup"

export function CatalogSetupEssentials({
  model,
  market,
}: { model: CatalogSetupModel; market: boolean }) {
  const {
    kind,
    name,
    setName,
    price,
    setPrice,
    multiplePriceOptions,
    unitName,
    setUnitName,
    openingStock,
    setOpeningStock,
    description,
    setDescription,
    showOpeningStock,
    setShowOpeningStock,
    showDescription,
    setShowDescription,
    showAdvanced,
    defaultQuoteRequired,
    currencyCode,
  } = model
  const { OptionalDetailAction, ToggleRow, CatalogEssentialsFields } = market
    ? Market
    : Classic
  if (!kind) return null
  return (
    <>
      <CatalogEssentialsFields
        currencyCode={currencyCode}
        defaultQuoteRequired={defaultQuoteRequired}
        kind={kind}
        multiplePriceOptions={multiplePriceOptions}
        name={name}
        onNameChange={setName}
        onPriceChange={setPrice}
        onUnitNameChange={setUnitName}
        price={price}
        showProductEssentials={kind === "product"}
        unitName={unitName}
      />

      {kind === "service" ? (
        <ToggleRow
          enabled={defaultQuoteRequired}
          label="Quote each job"
          onPress={() => model.setDefaultQuoteRequired(!defaultQuoteRequired)}
        />
      ) : null}
      {kind === "product" && !showAdvanced && showOpeningStock ? (
        <FormField
          actionLabel="Remove"
          keyboardType="decimal-pad"
          label="Opening stock"
          inputClassName={
            market ? "bg-market-field text-market-ink" : undefined
          }
          helper="Optional. Blank means no opening-stock declaration."
          onActionPress={() => {
            setOpeningStock("")
            setShowOpeningStock(false)
          }}
          onChangeText={setOpeningStock}
          placeholder="0"
          value={openingStock}
        />
      ) : null}

      {showDescription ? (
        <FormField
          actionLabel="Remove"
          label="Description"
          inputClassName={
            market ? "bg-market-field text-market-ink" : undefined
          }
          maxLength={2000}
          multiline
          onActionPress={() => {
            setDescription("")
            setShowDescription(false)
          }}
          onChangeText={setDescription}
          placeholder="Optional notes"
          textAlignVertical="top"
          value={description}
        />
      ) : null}

      {kind === "product" ? (
        <View
          className={catalogSetupClassName(
            "mt-1 border-t border-border pt-4",
            market,
          )}
        >
          <Text
            className={catalogSetupClassName(
              "text-lg font-extrabold text-foreground",
              market,
            )}
          >
            Optional product details
          </Text>
          <Text
            className={catalogSetupClassName(
              "mb-1 text-xs [-rn-line-height:20] text-muted-foreground",
              market,
            )}
          >
            Add starting quantity or customer-facing context only when needed.
          </Text>
          {!showAdvanced && !showOpeningStock ? (
            <OptionalDetailAction
              description="Record the quantity available when this Product is saved."
              icon="Warehouse"
              label="Opening stock"
              onPress={() => setShowOpeningStock(true)}
            />
          ) : null}
          {!showDescription ? (
            <OptionalDetailAction
              description="Explain what customers should know."
              icon="FileText"
              label="Description"
              onPress={() => setShowDescription(true)}
            />
          ) : null}
        </View>
      ) : null}
    </>
  )
}
