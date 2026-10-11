import { MoneyField } from "@/components/mobile/money-field"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"
import {
  CATALOG_FREE_DESCRIPTION_MAX_LENGTH,
  CATALOG_FREE_LINE_LABELS,
  type CatalogFreeLineKind,
  catalogFreeLineAmountMinor,
  catalogFreeLineDisplay,
} from "@ewatrade/utils/catalog-free-lines"
import { Text as NativeText, TextInput } from "react-native"
import type { CreateSaleViewModel } from "./create-sale-presentation"

const money = (minor: number, currency: string) =>
  formatMinorMoney(minor, currency).replace(/\.00(?=\D*$)/, "")

/**
 * Skip-catalog entry: typed-price Quick sale lines and Additional costs.
 * Sits above the Catalog list so a business without items can still sell.
 */
export function CatalogFreeSaleLines({
  model,
}: {
  model: CreateSaleViewModel
}) {
  const colors = useColors()
  const largeText = useLargeTextLayout()
  const {
    actionsLocked,
    addCatalogFreeLine,
    catalogFreeLines,
    currencyCode,
    removeCatalogFreeLine,
    updateCatalogFreeLine,
  } = model
  return (
    <View className="gap-2.5">
      {catalogFreeLines.length ? (
        <View className="overflow-hidden rounded-[20px] bg-card">
          {catalogFreeLines.map((line, index) => (
            <View
              key={line.id}
              className={cn(
                "gap-2 px-3.5 py-3",
                index < catalogFreeLines.length - 1 && "border-b border-border",
              )}
              testID={`sale-catalog-free-line-${index}`}
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text className="text-sm font-extrabold text-foreground">
                  {CATALOG_FREE_LINE_LABELS[line.kind]}
                </Text>
                <Pressable
                  accessibilityLabel={`Remove ${CATALOG_FREE_LINE_LABELS[line.kind]}`}
                  accessibilityRole="button"
                  className="size-9 items-center justify-center rounded-full"
                  disabled={actionsLocked}
                  haptic
                  hitSlop={6}
                  onPress={() => removeCatalogFreeLine(line.id)}
                >
                  <Icon
                    className="size-[16px] text-muted-foreground"
                    name="X"
                  />
                </Pressable>
              </View>
              <MoneyField
                autoFocus={!line.amount}
                currencyCode={currencyCode}
                editable={!actionsLocked}
                label={line.kind === "quick_sale" ? "Price" : "Cost"}
                onChangeValue={(amount) =>
                  updateCatalogFreeLine(line.id, { amount })
                }
                placeholder="0.00"
                testID={`sale-catalog-free-amount-${index}`}
                value={line.amount}
              />
              <TextInput
                accessibilityLabel={`${CATALOG_FREE_LINE_LABELS[line.kind]} description`}
                editable={!actionsLocked}
                maxFontSizeMultiplier={1.3}
                maxLength={CATALOG_FREE_DESCRIPTION_MAX_LENGTH}
                onChangeText={(description) =>
                  updateCatalogFreeLine(line.id, { description })
                }
                placeholder={
                  line.kind === "quick_sale"
                    ? "What was sold? (optional)"
                    : "What is this cost for? (optional)"
                }
                placeholderTextColor={colors.mutedForeground}
                selectionColor={colors.primary}
                style={{
                  backgroundColor: colors.muted,
                  borderRadius: 14,
                  color: colors.foreground,
                  fontSize: 15,
                  minHeight: 46,
                  paddingHorizontal: 14,
                }}
                testID={`sale-catalog-free-description-${index}`}
                value={line.description}
              />
            </View>
          ))}
        </View>
      ) : null}
      <View className={cn("gap-2.5", !largeText && "flex-row")}>
        <CatalogFreeAddButton
          disabled={actionsLocked}
          icon="Pencil"
          kind="quick_sale"
          label="Type a price"
          onPress={addCatalogFreeLine}
        />
        <CatalogFreeAddButton
          disabled={actionsLocked}
          icon="Plus"
          kind="additional_cost"
          label="Additional cost"
          onPress={addCatalogFreeLine}
        />
      </View>
    </View>
  )
}

function CatalogFreeAddButton({
  disabled,
  icon,
  kind,
  label,
  onPress,
}: {
  disabled: boolean
  icon: IconKeys
  kind: CatalogFreeLineKind
  label: string
  onPress: (kind: CatalogFreeLineKind) => void
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityHint={
        kind === "quick_sale"
          ? "Adds a sale line with a price you type, without the catalog"
          : "Adds a cost such as delivery or packaging"
      }
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      haptic
      onPress={() => onPress(kind)}
      style={{
        alignItems: "center",
        backgroundColor: colors.accent,
        borderRadius: 14,
        flex: 1,
        flexDirection: "row",
        gap: 6,
        justifyContent: "center",
        minHeight: 44,
        paddingHorizontal: 14,
      }}
      testID={`sale-add-${kind.replace("_", "-")}`}
    >
      <Icon
        className="size-[15px]"
        color={colors.accentForeground}
        name={icon}
      />
      <NativeText
        maxFontSizeMultiplier={1.3}
        style={{
          color: colors.accentForeground,
          fontSize: 13,
          fontWeight: "800",
        }}
      >
        {label}
      </NativeText>
    </Pressable>
  )
}

/** Read-only rows for checkout summaries. */
export function CatalogFreeSaleSummaryRows({
  model,
  hasRowsAbove,
}: {
  model: CreateSaleViewModel
  hasRowsAbove: boolean
}) {
  const largeText = useLargeTextLayout()
  const { catalogFreeLines, currencyCode } = model
  return catalogFreeLines.map((line, index) => {
    const display = catalogFreeLineDisplay(line)
    return (
      <View
        key={line.id}
        className={cn(
          "gap-2 py-2.5",
          !largeText && "flex-row items-start justify-between",
          (hasRowsAbove || index > 0) && "border-t border-border",
        )}
      >
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-bold text-foreground">
            {display.title}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {display.detail ??
              (line.kind === "quick_sale" ? "Typed price" : null)}
          </Text>
        </View>
        <Text className="text-sm font-extrabold tabular-nums text-foreground">
          {money(catalogFreeLineAmountMinor(line) ?? 0, currencyCode)}
        </Text>
      </View>
    )
  })
}
