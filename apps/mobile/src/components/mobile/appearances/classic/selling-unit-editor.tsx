import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { View } from "react-native"
import type { SellingUnitEditorFieldsProps } from "@/components/mobile/catalog-setup/catalog-setup-model"

export function ClassicSellingUnitFields({
  currencyCode,
  multiplePriceOptions,
  onChangeDirection,
  onChangeDraft,
  unitEditorDraft,
  unitEditorError,
  unitName,
}: SellingUnitEditorFieldsProps) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <View className={largeTextLayout ? "gap-4 px-4 pb-6" : "gap-4 px-5 pb-6"}>
      <Text className="text-sm [-rn-line-height:20] text-muted-foreground">
        Add another way customers buy this Product, then connect it to the unit
        you count in stock.
      </Text>

      {unitEditorError ? (
        <StatusBanner
          icon="AlertCircle"
          message={unitEditorError}
          tone="destructive"
        />
      ) : null}

      <FormField
        autoCapitalize="words"
        label="Unit name"
        onChangeText={(value) => onChangeDraft({ name: value })}
        placeholder={
          largeTextLayout
            ? "e.g. Carton or Pack"
            : "e.g. Half bag, Carton, Pack"
        }
        value={unitEditorDraft.name}
      />
      <View className="gap-2">
        <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
          How it converts
        </Text>
        <View className={largeTextLayout ? "gap-2" : "flex-row gap-2"}>
          {(
            [
              [
                "units_per_canonical",
                "Inside main unit",
                "A smaller unit taken from one main unit.",
              ],
              [
                "canonical_per_unit",
                "Contains main units",
                "A larger pack made from main units.",
              ],
            ] as const
          ).map(([value, label, description]) => (
            <Pressable
              accessibilityLabel={`${label}. ${description}`}
              accessibilityRole="radio"
              accessibilityState={{
                selected: unitEditorDraft.relationDirection === value,
              }}
              className={
                unitEditorDraft.relationDirection === value
                  ? largeTextLayout
                    ? "min-h-20 w-full justify-center rounded-2xl border border-primary bg-primary/10 px-4 py-3"
                    : "min-h-[76px] flex-1 justify-center rounded-2xl border border-primary bg-primary/10 px-3 py-3"
                  : largeTextLayout
                    ? "min-h-20 w-full justify-center rounded-2xl border border-border px-4 py-3 active:bg-muted"
                    : "min-h-[76px] flex-1 justify-center rounded-2xl border border-border px-3 py-3 active:bg-muted"
              }
              haptic
              key={value}
              onPress={() => onChangeDirection(value)}
            >
              <Text
                className={
                  unitEditorDraft.relationDirection === value
                    ? "text-xs font-extrabold text-primary"
                    : "text-xs font-extrabold text-foreground"
                }
              >
                {label}
              </Text>
              <Text
                className={
                  largeTextLayout
                    ? "mt-1 text-[11px] [-rn-line-height:20] text-muted-foreground"
                    : "mt-1 text-[11px] [-rn-line-height:16] text-muted-foreground"
                }
              >
                {description}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="border-l-2 border-primary bg-muted px-3 py-3">
        <Text className="text-xs [-rn-line-height:20] text-foreground">
          {unitEditorDraft.relationDirection === "units_per_canonical"
            ? `1 ${unitName.trim() || "main unit"} contains ${unitEditorDraft.relationCount.trim() || "…"} ${unitEditorDraft.name.trim() || "of this unit"}`
            : `1 ${unitEditorDraft.name.trim() || "selling unit"} contains ${unitEditorDraft.relationCount.trim() || "…"} ${unitName.trim() || "main units"}`}
        </Text>
      </View>

      <View className={largeTextLayout ? "gap-3" : "flex-row gap-3"}>
        <View className={largeTextLayout ? undefined : "min-w-0 flex-1"}>
          <FormField
            helper="Use a positive number."
            keyboardType="decimal-pad"
            label={
              unitEditorDraft.relationDirection === "units_per_canonical"
                ? `Units in 1 ${unitName.trim() || "main unit"}`
                : `Main units in 1 ${unitEditorDraft.name.trim() || "selling unit"}`
            }
            onChangeText={(value) => onChangeDraft({ relationCount: value })}
            placeholder="e.g. 50"
            value={unitEditorDraft.relationCount}
          />
        </View>
        <View className={largeTextLayout ? undefined : "min-w-0 flex-1"}>
          <MoneyField
            currencyCode={currencyCode}
            editable={!multiplePriceOptions}
            helper={
              multiplePriceOptions
                ? "Set per option later."
                : "Options may override it."
            }
            label="Default price"
            onChangeValue={(value) => onChangeDraft({ price: value })}
            placeholder="e.g. 25000"
            value={unitEditorDraft.price}
          />
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
          Stock source
        </Text>
        <View className="gap-2">
          {(
            [
              [
                "alternate_transaction",
                "Share main stock",
                "Sales deduct from the main-unit balance.",
              ],
              [
                "packaged_stock",
                "Track prepared stock",
                "Keep a separate balance for units already packed.",
              ],
            ] as const
          ).map(([value, label, description]) => (
            <Pressable
              accessibilityLabel={`${label}. ${description}`}
              accessibilityRole="radio"
              accessibilityState={{
                selected: unitEditorDraft.stockBehavior === value,
              }}
              className={
                unitEditorDraft.stockBehavior === value
                  ? largeTextLayout
                    ? "min-h-20 flex-row items-start gap-3 rounded-2xl border border-primary bg-primary/10 px-3 py-3"
                    : "min-h-16 flex-row items-center gap-3 rounded-2xl border border-primary bg-primary/10 px-3 py-3"
                  : largeTextLayout
                    ? "min-h-20 flex-row items-start gap-3 rounded-2xl border border-border px-3 py-3 active:bg-muted"
                    : "min-h-16 flex-row items-center gap-3 rounded-2xl border border-border px-3 py-3 active:bg-muted"
              }
              haptic
              key={value}
              onPress={() => onChangeDraft({ stockBehavior: value })}
            >
              <View
                className={
                  unitEditorDraft.stockBehavior === value
                    ? largeTextLayout
                      ? "mt-1 h-5 w-5 items-center justify-center rounded-full border-[5px] border-primary"
                      : "h-5 w-5 items-center justify-center rounded-full border-[5px] border-primary"
                    : largeTextLayout
                      ? "mt-1 h-5 w-5 rounded-full border border-border"
                      : "h-5 w-5 rounded-full border border-border"
                }
              />
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-extrabold text-foreground">
                  {label}
                </Text>
                <Text
                  className={
                    largeTextLayout
                      ? "mt-1 text-[11px] [-rn-line-height:20] text-muted-foreground"
                      : "mt-1 text-[11px] [-rn-line-height:16] text-muted-foreground"
                  }
                >
                  {description}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  )
}
