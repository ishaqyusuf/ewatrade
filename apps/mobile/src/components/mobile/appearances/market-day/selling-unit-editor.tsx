import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import type { SellingUnitEditorFieldsProps } from "@/components/mobile/catalog-setup/catalog-setup-model"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import { View } from "react-native"

function Choice({
  selected,
  label,
  description,
  onPress,
}: {
  selected: boolean
  label: string
  description: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ selected }}
      onPress={onPress}
      haptic
      className={cn(
        "min-h-20 flex-row items-center gap-3 rounded-2xl border px-4 py-4",
        selected ? "border-market-palm bg-market-field" : "border-market-line",
      )}
    >
      <View
        className={cn(
          "size-6 shrink-0 items-center justify-center rounded-full",
          selected ? "bg-market-palm" : "border border-market-line",
        )}
      >
        {selected ? (
          <Icon name="Check" className="size-xs text-market-on-palm" />
        ) : null}
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-extrabold text-market-ink">{label}</Text>
        <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
          {description}
        </Text>
      </View>
    </Pressable>
  )
}

export function MarketSellingUnitFields({
  currencyCode,
  multiplePriceOptions,
  onChangeDirection,
  onChangeDraft,
  unitEditorDraft: draft,
  unitEditorError,
  unitName,
}: SellingUnitEditorFieldsProps) {
  const mainName = unitName.trim() || "main unit"
  const sellingName = draft.name.trim() || "selling unit"
  return (
    <View className="gap-5 px-5 pb-5">
      <View className="gap-2">
        <Text
          accessibilityRole="header"
          className="font-market-display text-[28px] text-market-ink [-rn-line-height:34]"
        >
          Another way to sell.
        </Text>
        <Text className="text-sm text-market-muted-ink [-rn-line-height:21]">
          Connect a selling unit to the unit you count in stock.
        </Text>
      </View>
      {unitEditorError ? (
        <StatusBanner tone="destructive" message={unitEditorError} />
      ) : null}
      <FormField
        autoCapitalize="words"
        label="Unit name"
        onChangeText={(name) => onChangeDraft({ name })}
        value={draft.name}
        placeholder="e.g. Carton or Pack"
        inputClassName="bg-market-field text-market-ink"
      />
      <View className="gap-3">
        <Text className="font-market-mono text-[11px] uppercase tracking-[1px] text-market-muted-ink">
          01 / How it converts
        </Text>
        <Choice
          selected={draft.relationDirection === "units_per_canonical"}
          label="Inside main unit"
          description="A smaller unit taken from one main unit."
          onPress={() => onChangeDirection("units_per_canonical")}
        />
        <Choice
          selected={draft.relationDirection === "canonical_per_unit"}
          label="Contains main units"
          description="A larger pack made from main units."
          onPress={() => onChangeDirection("canonical_per_unit")}
        />
        <View className="rounded-xl bg-market-marigold px-4 py-4">
          <Text className="text-sm font-bold text-market-on-marigold [-rn-line-height:21]">
            {draft.relationDirection === "units_per_canonical"
              ? `1 ${mainName} contains ${draft.relationCount.trim() || "…"} ${sellingName}`
              : `1 ${sellingName} contains ${draft.relationCount.trim() || "…"} ${mainName}`}
          </Text>
        </View>
        <FormField
          keyboardType="decimal-pad"
          label={
            draft.relationDirection === "units_per_canonical"
              ? `Units in 1 ${mainName}`
              : `Main units in 1 ${sellingName}`
          }
          helper="Use a positive number that converts exactly."
          onChangeText={(relationCount) => onChangeDraft({ relationCount })}
          value={draft.relationCount}
          placeholder="e.g. 12"
          inputClassName="bg-market-field text-market-ink"
        />
        <MoneyField
          currencyCode={currencyCode}
          label="Default price"
          editable={!multiplePriceOptions}
          helper={
            multiplePriceOptions
              ? "Set each option price in Product stock & pricing."
              : "Individual options can override this price."
          }
          onChangeValue={(price) => onChangeDraft({ price })}
          value={draft.price}
          inputClassName="bg-market-field text-market-ink"
        />
      </View>
      <View className="gap-3 border-t border-market-line pt-5">
        <Text className="font-market-mono text-[11px] uppercase tracking-[1px] text-market-muted-ink">
          02 / Stock source
        </Text>
        <Choice
          selected={draft.stockBehavior === "alternate_transaction"}
          label="Share main stock"
          description="Sales deduct from the main-unit balance."
          onPress={() =>
            onChangeDraft({ stockBehavior: "alternate_transaction" })
          }
        />
        <Choice
          selected={draft.stockBehavior === "packaged_stock"}
          label="Track prepared stock"
          description="Keep a separate balance for units already packed."
          onPress={() => onChangeDraft({ stockBehavior: "packaged_stock" })}
        />
      </View>
    </View>
  )
}
