import type { SellingUnitEditorFieldsProps } from "@/components/mobile/catalog-setup/catalog-setup-model"
import { SellingUnitReferenceSelector } from "@/components/mobile/catalog-setup/selling-unit-reference-selector"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { addExactDecimals, compareExactDecimals } from "@ewatrade/utils"
import { Text as NativeText, TextInput, View } from "react-native"

const UNIT_SUGGESTIONS = ["Carton", "Pack", "Tray", "Half bag", "Dozen"]

function stepCount(value: string, direction: 1 | -1) {
  try {
    const next = addExactDecimals(value.trim() || "0", String(direction))
    return compareExactDecimals(next, "1") < 0 ? "1" : next
  } catch {
    return direction === 1 ? "2" : "1"
  }
}

/** Sell another way (01 Live Card): relation card, unit, price, stock. */
export function ClassicSellingUnitFields({
  referenceUnits,
  currencyCode,
  multiplePriceOptions,
  onChangeDirection,
  onChangeDraft,
  unitEditorDraft,
  unitEditorError,
  unitName,
}: SellingUnitEditorFieldsProps) {
  const largeTextLayout = useLargeTextLayout()
  const colors = useColors()
  const referenceName =
    referenceUnits?.find((unit) => unit.id === unitEditorDraft.referenceUnitId)
      ?.name ??
    (unitName.trim() || "main unit")
  const name = unitEditorDraft.name.trim() || "Carton"
  const contains = unitEditorDraft.relationDirection === "canonical_per_unit"
  const [left, right] = contains ? [name, referenceName] : [referenceName, name]
  const stepButton = (direction: 1 | -1) => (
    <Pressable
      accessibilityLabel={direction === 1 ? "One more" : "One less"}
      accessibilityRole="button"
      haptic
      onPress={() =>
        onChangeDraft({
          relationCount: stepCount(unitEditorDraft.relationCount, direction),
        })
      }
      style={{
        alignItems: "center",
        backgroundColor: colors.muted,
        borderRadius: 9,
        height: 36,
        justifyContent: "center",
        width: 36,
      }}
    >
      <Icon
        className="size-[15px] text-foreground"
        name={direction === 1 ? "Plus" : "Minus"}
      />
    </Pressable>
  )
  const stepper = (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.card,
        borderRadius: 13,
        flexDirection: "row",
        gap: 2,
        padding: 4,
      }}
    >
      {stepButton(-1)}
      <TextInput
        accessibilityLabel={`How many ${right} in 1 ${left}`}
        keyboardType="decimal-pad"
        maxFontSizeMultiplier={1.3}
        onChangeText={(value) => onChangeDraft({ relationCount: value })}
        placeholder="12"
        placeholderTextColor={colors.mutedForeground}
        selectTextOnFocus
        style={{
          color: colors.foreground,
          fontSize: 18,
          fontVariant: ["tabular-nums"],
          fontWeight: "800",
          minWidth: 40,
          padding: 0,
          textAlign: "center",
        }}
        value={unitEditorDraft.relationCount}
      />
      {stepButton(1)}
    </View>
  )

  return (
    <View className="gap-3.5 px-[18px] pb-6">
      <Text className="text-[13px] text-muted-foreground">
        Packs, trays and cartons are amounts customers buy. A size customers
        choose goes in Customer choices.
      </Text>
      {unitEditorError ? (
        <StatusBanner
          icon="AlertCircle"
          message={unitEditorError}
          tone="destructive"
        />
      ) : null}
      <View
        accessibilityLabel={`1 ${left} equals ${unitEditorDraft.relationCount || "…"} ${right}`}
        style={{
          alignItems: "center",
          backgroundColor: colors.accent,
          borderRadius: 18,
          flexDirection: largeTextLayout ? "column" : "row",
          gap: 10,
          justifyContent: "center",
          paddingHorizontal: 8,
          paddingVertical: 16,
        }}
      >
        <NativeText
          style={{
            color: colors.accentForeground,
            fontSize: 16,
            fontWeight: "800",
          }}
        >
          {`1 ${left}`}
        </NativeText>
        <NativeText
          style={{
            color: colors.accentForeground,
            fontSize: 16,
            fontWeight: "800",
          }}
        >
          =
        </NativeText>
        {stepper}
        <NativeText
          numberOfLines={1}
          style={{
            color: colors.accentForeground,
            flexShrink: 1,
            fontSize: 16,
            fontWeight: "800",
          }}
        >
          {right}
        </NativeText>
      </View>
      <View className="flex-row gap-2">
        {(
          [
            ["canonical_per_unit", `Bigger pack of ${referenceName}`],
            ["units_per_canonical", `Smaller part of ${referenceName}`],
          ] as const
        ).map(([value, label]) => {
          const on = unitEditorDraft.relationDirection === value
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              className={cn(
                "min-h-9 flex-1 items-center justify-center rounded-full border-[1.5px] px-3",
                on
                  ? "border-primary/40 bg-accent"
                  : "border-transparent bg-muted",
              )}
              haptic
              onPress={() => onChangeDirection(value)}
            >
              <Text
                numberOfLines={1}
                className={cn(
                  "text-xs font-bold",
                  on ? "text-accent-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <View className="gap-3 rounded-[20px] bg-card p-3.5 shadow-sm">
        <FormField
          autoCapitalize="words"
          label="Unit name"
          onChangeText={(value) => onChangeDraft({ name: value })}
          placeholder="e.g. Carton"
          value={unitEditorDraft.name}
          variant="green-gate"
        />
        <View className="-mt-1 flex-row flex-wrap gap-1.5">
          {UNIT_SUGGESTIONS.map((suggestion) => {
            const on =
              suggestion.toLowerCase() ===
              unitEditorDraft.name.trim().toLowerCase()
            return (
              <Pressable
                key={suggestion}
                accessibilityLabel={`Use ${suggestion}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                className={cn(
                  "min-h-9 justify-center rounded-full border-[1.5px] px-3",
                  on
                    ? "border-primary/40 bg-accent"
                    : "border-transparent bg-muted",
                )}
                haptic
                onPress={() => onChangeDraft({ name: suggestion })}
              >
                <Text
                  className={cn(
                    "text-[12.5px] font-bold",
                    on ? "text-accent-foreground" : "text-foreground",
                  )}
                >
                  {suggestion}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <SellingUnitReferenceSelector
          fields={{ referenceUnits, unitEditorDraft, onChangeDraft, unitName }}
          market={false}
        />
        <MoneyField
          currencyCode={currencyCode}
          editable={!multiplePriceOptions}
          helper={multiplePriceOptions ? "Set per option later." : undefined}
          label={`Price for 1 ${name.toLowerCase()}`}
          onChangeValue={(value) => onChangeDraft({ price: value })}
          placeholder="0.00"
          value={unitEditorDraft.price}
          variant="green-gate"
        />
      </View>
      <Text className="mt-2 text-base font-extrabold text-foreground">
        Stock
      </Text>
      <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
        {(
          [
            [
              "alternate_transaction",
              "Share main stock",
              `Selling 1 ${name.toLowerCase()} takes ${unitEditorDraft.relationCount.trim() || "…"} ${referenceName.toLowerCase()} from stock.`,
            ],
            [
              "packaged_stock",
              "Track prepared stock",
              `Count packed ${name.toLowerCase()}s separately.`,
            ],
          ] as const
        ).map(([value, label, description], index) => {
          const on = unitEditorDraft.stockBehavior === value
          return (
            <Pressable
              key={value}
              accessibilityLabel={`${label}. ${description}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              className={cn(
                "min-h-[62px] flex-row items-center gap-3 py-3",
                index > 0 && "border-t border-border",
              )}
              haptic
              onPress={() => onChangeDraft({ stockBehavior: value })}
            >
              <View
                style={{
                  alignItems: "center",
                  borderColor: on ? colors.primary : colors.border,
                  borderRadius: 999,
                  borderWidth: 2,
                  height: 22,
                  justifyContent: "center",
                  width: 22,
                }}
              >
                {on ? (
                  <View
                    style={{
                      backgroundColor: colors.primary,
                      borderRadius: 999,
                      height: 11,
                      width: 11,
                    }}
                  />
                ) : null}
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-foreground">
                  {label}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {description}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
