import * as Classic from "@/components/mobile/appearances/classic/catalog-setup"
import * as Market from "@/components/mobile/appearances/market-day/catalog-setup"
import { FormField } from "@/components/mobile/form-field"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { Text as NativeText, View } from "react-native"
import { catalogSetupClassName } from "./catalog-setup-presentation"
import type { CatalogSetupModel } from "./use-catalog-setup"

export function CatalogSetupEssentials({
  model,
  market,
  focused = false,
  onOpenCategory,
}: {
  model: CatalogSetupModel
  market: boolean
  focused?: boolean
  onOpenCategory?: () => void
}) {
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
    formGuidance,
  } = model
  const { OptionalDetailAction, ToggleRow, CatalogEssentialsFields } = market
    ? Market
    : Classic
  if (!kind) return null
  const bestMatch = model.categorySuggestions[0]
  const categoryChip =
    market || kind !== "product" ? null : model.category ? (
      <CategoryChip
        icon="Check"
        lead="Category"
        value={model.category.split(" / ").join(" › ")}
        action="Change"
        onPress={onOpenCategory}
      />
    ) : bestMatch ? (
      <CategoryChip
        icon="FolderPlus"
        lead="Best match"
        value={bestMatch.category.split(" / ").join(" › ")}
        action="Use"
        onPress={() => {
          if (!model.applyCategorySuggestion(bestMatch)) onOpenCategory?.()
        }}
      />
    ) : null
  const fields = (
    <>
      <CatalogEssentialsFields
        afterName={categoryChip}
        currencyCode={currencyCode}
        guidance={formGuidance}
        defaultQuoteRequired={defaultQuoteRequired}
        kind={kind}
        multiplePriceOptions={multiplePriceOptions}
        name={name}
        onNameChange={setName}
        onNameBlur={model.requestCategorySuggestions}
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
    </>
  )
  return (
    <>
      {market ? (
        fields
      ) : (
        <View className="gap-3 rounded-[20px] bg-card p-3.5 shadow-sm">
          {fields}
        </View>
      )}
      {!focused && kind === "product" && !showAdvanced && showOpeningStock ? (
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

      {!focused && showDescription ? (
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
          placeholder={formGuidance.description.placeholder}
          helper={formGuidance.description.helperText}
          textAlignVertical="top"
          value={description}
        />
      ) : null}

      {!focused && kind === "product" ? (
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

/** "Best match · Poultry › Eggs · Use", then "Category · … · Change". */
function CategoryChip({
  action,
  icon,
  lead,
  onPress,
  value,
}: {
  action: string
  icon: IconKeys
  lead: string
  onPress?: () => void
  value: string
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: palette.lilac,
        borderRadius: 13,
        flexDirection: "row",
        gap: 8,
        paddingLeft: 12,
        paddingRight: 6,
        paddingVertical: 6,
      }}
    >
      <Icon
        className="size-[15px]"
        color={palette.lilacForeground}
        name={icon}
      />
      <NativeText
        numberOfLines={1}
        style={{ color: palette.lilacForeground, flex: 1, fontSize: 12.5 }}
      >
        {`${lead} · `}
        <NativeText style={{ fontWeight: "800" }}>{value}</NativeText>
      </NativeText>
      <Pressable
        accessibilityLabel={`${action} category ${value}`}
        accessibilityRole="button"
        haptic
        onPress={onPress}
        style={{
          backgroundColor: palette.lilacChip,
          borderRadius: 999,
          minHeight: 32,
          justifyContent: "center",
          paddingHorizontal: 12,
        }}
      >
        <NativeText
          style={{
            color: palette.lilacForeground,
            fontSize: 12.5,
            fontWeight: "800",
          }}
        >
          {action}
        </NativeText>
      </Pressable>
    </View>
  )
}
