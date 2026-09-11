import { ActionButton } from "@/components/mobile/action-button"
import type * as Classic from "@/components/mobile/appearances/classic/catalog-setup"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"
import { View } from "react-native"

type Props<K extends keyof typeof Classic> = ComponentProps<(typeof Classic)[K]>

export function MarketSetupHeader({
  kind,
}: { kind: "product" | "service" | null }) {
  return (
    <View className="gap-3 border-b-[5px] border-market-marigold bg-market-palm px-5 pb-6 pt-4">
      <Text className="font-market-mono text-[11px] uppercase tracking-[1.4px] text-market-on-palm-muted">
        Catalog / A new beginning
      </Text>
      <Text
        accessibilityRole="header"
        className="font-market-display text-[34px] text-market-on-palm [-rn-line-height:40]"
      >
        {kind === "service"
          ? "Make room for your work."
          : kind === "product"
            ? "Your next best seller."
            : "What are you adding?"}
      </Text>
      <Text className="text-sm text-market-on-palm-muted [-rn-line-height:21]">
        {kind === "service"
          ? "Name the work. Price it now, or quote each order later."
          : kind === "product"
            ? "Start with the essentials. Add detail when you need it."
            : "Products can track stock. Services do not affect inventory."}
      </Text>
    </View>
  )
}

export function MarketQuickSetup({
  title,
  onPress,
  disabled,
}: { title?: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Choose a quick setup"
      disabled={disabled}
      onPress={onPress}
      haptic
      className="min-h-14 flex-row items-center gap-3 rounded-2xl bg-market-marigold px-4 py-3 active:bg-market-canopy-accent"
    >
      <Icon name="LayoutGrid" className="size-sm text-market-on-marigold" />
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-extrabold text-market-on-marigold">
          {title ? `Quick setup: ${title}` : "Quick setup"}
        </Text>
        {!title ? (
          <Text className="text-xs text-market-on-marigold">
            Optional · Start from a familiar pattern
          </Text>
        ) : null}
      </View>
      <Icon name="ChevronRight" className="size-sm text-market-on-marigold" />
    </Pressable>
  )
}

function SectionHeading({
  number,
  title,
  description,
  onAdd,
}: { number: string; title: string; description: string; onAdd?: () => void }) {
  const large = useLargeTextLayout()
  const palette = useMarketDayPalette()
  return (
    <View className={cn("gap-3", !large && "flex-row items-start")}>
      <View className={cn("gap-1.5", !large && "min-w-0 flex-1")}>
        <Text className="font-market-mono text-[10px] uppercase tracking-[1px] text-market-muted-ink">
          {number} / Setup
        </Text>
        <Text
          accessibilityRole="header"
          className="text-lg font-extrabold text-market-ink"
        >
          {title}
        </Text>
        <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
          {description}
        </Text>
      </View>
      {onAdd ? (
        <ActionButton
          icon="Plus"
          onPress={onAdd}
          variant="outline"
          foregroundColor={palette.ink}
          className={cn(
            "border-market-line bg-market-field active:bg-market-line",
            large ? "w-full" : "w-auto",
          )}
        >
          Add option
        </ActionButton>
      ) : null}
    </View>
  )
}

export function KindChoice({
  description,
  icon,
  label,
  onPress,
  recommendation,
}: Props<"KindChoice">) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Create ${label}`}
      accessibilityHint={description}
      onPress={onPress}
      haptic
      className="min-h-24 gap-4 rounded-[22px] border border-market-line bg-market-field p-5 active:bg-market-soft-band"
    >
      <View className="flex-row items-center justify-between gap-3">
        <View className="size-12 items-center justify-center rounded-2xl bg-market-marigold">
          <Icon name={icon} className="size-base text-market-on-marigold" />
        </View>
        <Icon name="ArrowRight" className="size-sm text-market-accent-ink" />
      </View>
      <View className="gap-2">
        <Text className="font-market-display text-[27px] text-market-ink">
          {label}
        </Text>
        <Text className="text-sm text-market-muted-ink [-rn-line-height:21]">
          {description}
        </Text>
        {recommendation ? (
          <Text className="text-xs font-bold text-market-accent-ink [-rn-line-height:18]">
            {recommendation}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

export function OptionalDetailAction({
  description,
  icon,
  label,
  onPress,
}: Props<"OptionalDetailAction">) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={description}
      onPress={onPress}
      haptic
      className="min-h-20 flex-row items-center gap-3 border-b border-market-line py-4 active:bg-market-soft-band"
    >
      <View className="size-10 shrink-0 items-center justify-center rounded-xl bg-market-field">
        <Icon name={icon} className="size-sm text-market-accent-ink" />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-bold text-market-ink">{label}</Text>
        <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
          {description}
        </Text>
      </View>
      <Icon name="ChevronRight" className="size-sm text-market-muted-ink" />
    </Pressable>
  )
}
export const ServiceDetailAction = OptionalDetailAction

export function ServiceAuthorizationOption({
  description,
  label,
  onPress,
  selected,
}: Props<"ServiceAuthorizationOption">) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ selected }}
      onPress={onPress}
      haptic
      className={cn(
        "min-h-20 flex-row items-center gap-3 border-b border-market-line px-3 py-4",
        selected && "bg-market-field",
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
        <Text className="text-sm font-bold text-market-ink">{label}</Text>
        <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
          {description}
        </Text>
      </View>
    </Pressable>
  )
}

export function ToggleRow({ enabled, label, onPress }: Props<"ToggleRow">) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: enabled }}
      onPress={onPress}
      haptic
      className="min-h-14 flex-row items-center justify-between gap-4 py-3"
    >
      <Text className="min-w-0 flex-1 text-sm font-bold text-market-ink">
        {label}
      </Text>
      <View
        className={cn(
          "h-7 w-12 shrink-0 justify-center rounded-full px-1",
          enabled ? "items-end bg-market-palm" : "items-start bg-market-line",
        )}
      >
        <View className="size-5 rounded-full bg-market-on-palm" />
      </View>
    </Pressable>
  )
}
export function ServiceWorkTrackingSwitch({
  onPress,
}: Props<"ServiceWorkTrackingSwitch">) {
  return <ToggleRow enabled label="Create tracked work" onPress={onPress} />
}

export function ServiceChoicesSectionHeader({
  onAddOption,
}: Props<"ServiceChoicesSectionHeader">) {
  return (
    <SectionHeading
      number="03"
      title="Service choices"
      description="Offer packages, turnaround times, visit types or add-ons."
      onAdd={onAddOption}
    />
  )
}
export function ProductOptionsSectionHeader({
  hasOptions,
  onAddOption,
}: Props<"ProductOptionsSectionHeader">) {
  return (
    <SectionHeading
      number="03"
      title="Product options"
      description="Choices such as Size and Color can have their own prices."
      onAdd={hasOptions ? onAddOption : undefined}
    />
  )
}
export function ProductFirstOptionAction({
  onPress,
}: Props<"ProductFirstOptionAction">) {
  return (
    <OptionalDetailAction
      icon="Plus"
      label="Add first option"
      description="Start with Size, Color, Material or your own name."
      onPress={onPress}
    />
  )
}
export function ProductFirstOptionValueAction({
  groupName,
  onPress,
}: Props<"ProductFirstOptionValueAction">) {
  return (
    <OptionalDetailAction
      icon="Plus"
      label={`Add first ${groupName || "option"} value`}
      description="Pricing appears when every option has at least one value."
      onPress={onPress}
    />
  )
}
export function EmptyServiceChoiceGroupActions({
  groupName,
  onAddFirstChoice,
}: Props<"EmptyServiceChoiceGroupActions">) {
  return (
    <OptionalDetailAction
      icon="Plus"
      label="Add first choice"
      description={`Give customers a choice for ${groupName || "this option"}.`}
      onPress={onAddFirstChoice}
    />
  )
}
export function ProductUseOnePriceAction({
  onPress,
}: Props<"ProductUseOnePriceAction">) {
  return (
    <OptionalDetailAction
      icon="RotateCw"
      label="Use one price instead"
      description="Review before clearing all option setup."
      onPress={onPress}
    />
  )
}

export function SectionHeaderActions({
  addLabel,
  canRemove = true,
  onAdd,
  onRemove,
  removeLabel,
}: Props<"SectionHeaderActions">) {
  const large = useLargeTextLayout()
  const palette = useMarketDayPalette()
  return (
    <View className={large ? "gap-2" : "flex-row flex-wrap gap-2"}>
      {canRemove ? (
        <ActionButton
          accessibilityLabel={removeLabel}
          onPress={onRemove}
          variant="destructive"
          className={large ? "w-full" : "w-auto"}
        >
          Remove
        </ActionButton>
      ) : null}
      <ActionButton
        accessibilityLabel={addLabel}
        icon="Plus"
        onPress={onAdd}
        variant="outline"
        foregroundColor={palette.ink}
        className={cn(
          "border-market-line bg-market-field active:bg-market-line",
          large ? "w-full" : "w-auto",
        )}
      >
        Add
      </ActionButton>
    </View>
  )
}

export function CatalogEssentialsFields({
  currencyCode,
  defaultQuoteRequired,
  kind,
  multiplePriceOptions,
  name,
  onNameChange,
  onPriceChange,
  onUnitNameChange,
  price,
  unitName,
}: Props<"CatalogEssentialsFields">) {
  const large = useLargeTextLayout()
  return (
    <View className="gap-4 border-b border-market-line pb-5">
      <SectionHeading
        number="01"
        title={kind === "product" ? "The essentials" : "Name the work"}
        description={
          kind === "product"
            ? "What you sell and the unit you count."
            : "Set a fixed price or prepare to quote each job."
        }
      />
      <FormField
        autoCapitalize="words"
        label={kind === "product" ? "Product name" : "Service name"}
        maxLength={160}
        onChangeText={onNameChange}
        value={name}
        placeholder={
          kind === "product"
            ? "e.g. Ankara tote bag"
            : "e.g. Interior consultation"
        }
        inputClassName="bg-market-field text-market-ink"
      />
      {kind === "product" ? (
        <View className={large ? "gap-4" : "flex-row gap-3"}>
          <FormField
            containerClassName={large ? undefined : "min-w-0 flex-1"}
            autoCapitalize="words"
            label="Stock unit"
            maxLength={80}
            onChangeText={onUnitNameChange}
            value={unitName}
            placeholder="Piece, bag, kg"
            inputClassName="bg-market-field text-market-ink"
          />
          <MoneyField
            containerClassName={large ? undefined : "min-w-0 flex-1"}
            currencyCode={currencyCode}
            label="Selling price"
            inputClassName="bg-market-field text-market-ink"
            editable={!multiplePriceOptions}
            helper={
              multiplePriceOptions
                ? "Set prices in Product stock & pricing."
                : undefined
            }
            onChangeValue={onPriceChange}
            value={price}
          />
        </View>
      ) : (
        <MoneyField
          currencyCode={currencyCode}
          inputClassName="bg-market-field text-market-ink"
          label={
            defaultQuoteRequired ? "Starting price · Optional" : "Fixed price"
          }
          helper={
            defaultQuoteRequired
              ? "The final amount is agreed in a quote."
              : "Choose Quote each job below if the final price varies."
          }
          onChangeValue={onPriceChange}
          value={price}
        />
      )}
    </View>
  )
}
