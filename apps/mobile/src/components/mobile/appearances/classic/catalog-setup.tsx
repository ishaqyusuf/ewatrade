import type { CatalogItemKind } from "@/components/mobile/catalog-setup/catalog-setup-model"
import { FormField } from "@/components/mobile/form-field"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import { MoneyField } from "@/components/mobile/money-field"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { getCurrencySymbol } from "@ewatrade/utils"
import type { CatalogFormGuidance } from "@ewatrade/utils/business-catalog-guidance"
import { Text as NativeText, View } from "react-native"

export function KindChoice({
  description,
  icon,
  label,
  onPress,
  recommendation,
}: {
  description: string
  icon: IconKeys
  label: string
  onPress: () => void
  recommendation?: string
}) {
  const largeTextLayout = useLargeTextLayout()
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={`Create ${label}`}
      accessibilityRole="button"
      className={
        largeTextLayout
          ? "w-full gap-4 rounded-3xl border border-border bg-card p-5 active:bg-accent"
          : "flex-1 gap-4 rounded-3xl border border-border bg-card p-5 active:bg-accent"
      }
      haptic
      onPress={onPress}
      transition
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Icon className="size-base text-primary" name={icon} />
      </View>
      <View className="gap-1.5">
        <Text className="text-lg font-extrabold text-foreground">{label}</Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          {description}
        </Text>
        {recommendation ? (
          <Text className="text-xs font-bold leading-5 text-primary">
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
}: {
  description: string
  icon: IconKeys
  label: string
  onPress: () => void
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={label}
      accessibilityRole="button"
      className={
        largeTextLayout
          ? "-mx-2 min-h-16 flex-row items-start gap-3 border-b border-border px-3 py-3 active:bg-accent/60"
          : "-mx-2 min-h-16 flex-row items-center gap-3 border-b border-border px-3 active:bg-accent/60"
      }
      haptic
      onPress={onPress}
      transition
    >
      <View
        className={
          largeTextLayout
            ? "mt-1 h-10 w-10 items-center justify-center rounded-2xl bg-muted"
            : "h-10 w-10 items-center justify-center rounded-2xl bg-muted"
        }
      >
        <Icon className="size-sm text-primary" name={icon} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-sm font-bold text-foreground">{label}</Text>
        <Text
          className={
            largeTextLayout
              ? "text-xs leading-5 text-muted-foreground"
              : "text-xs leading-4 text-muted-foreground"
          }
        >
          {description}
        </Text>
      </View>
      <Icon
        className={
          largeTextLayout
            ? "mt-1 size-sm text-muted-foreground"
            : "size-sm text-muted-foreground"
        }
        name="ChevronRight"
      />
    </Pressable>
  )
}

export function ServiceDetailAction({
  description,
  icon,
  label,
  onPress,
}: {
  description: string
  icon: IconKeys
  label: string
  onPress: () => void
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={label}
      accessibilityRole="button"
      className={
        largeTextLayout
          ? "-mx-2 min-h-16 flex-row items-start gap-3 border-b border-border px-3 py-3 active:bg-accent/60"
          : "-mx-2 min-h-16 flex-row items-center gap-3 border-b border-border px-3 active:bg-accent/60"
      }
      haptic
      onPress={onPress}
      transition
    >
      <View
        className={
          largeTextLayout
            ? "mt-1 h-10 w-10 items-center justify-center rounded-2xl bg-muted"
            : "h-10 w-10 items-center justify-center rounded-2xl bg-muted"
        }
      >
        <Icon className="size-sm text-primary" name={icon} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-sm font-bold text-foreground">{label}</Text>
        <Text className="text-xs leading-4 text-muted-foreground">
          {description}
        </Text>
      </View>
      <Icon
        className={
          largeTextLayout
            ? "mt-1 size-sm text-muted-foreground"
            : "size-sm text-muted-foreground"
        }
        name="ChevronRight"
      />
    </Pressable>
  )
}

export function ServiceAuthorizationOption({
  description,
  label,
  onPress,
  selected,
}: {
  description: string
  label: string
  onPress: () => void
  selected: boolean
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={
        largeTextLayout
          ? selected
            ? "-mx-2 min-h-16 flex-row items-start gap-3 border-b border-border bg-accent px-3 py-3"
            : "-mx-2 min-h-16 flex-row items-start gap-3 border-b border-border px-3 py-3 active:bg-accent/60"
          : selected
            ? "-mx-2 min-h-16 flex-row items-center gap-3 border-b border-border bg-accent px-3"
            : "-mx-2 min-h-16 flex-row items-center gap-3 border-b border-border px-3 active:bg-accent/60"
      }
      haptic
      onPress={onPress}
      transition
    >
      <View
        className={
          largeTextLayout
            ? selected
              ? "mt-1 h-5 w-5 items-center justify-center rounded-full border-[6px] border-primary"
              : "mt-1 h-5 w-5 rounded-full border-2 border-border"
            : selected
              ? "h-5 w-5 items-center justify-center rounded-full border-[6px] border-primary"
              : "h-5 w-5 rounded-full border-2 border-border"
        }
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-sm font-bold text-foreground">{label}</Text>
        <Text className="text-xs leading-4 text-muted-foreground">
          {description}
        </Text>
      </View>
    </Pressable>
  )
}

export function ServiceWorkTrackingSwitch({
  onPress,
}: {
  onPress: () => void
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <Pressable
      accessibilityHint="Turn each confirmed service order into a job."
      accessibilityLabel="Create tracked work"
      accessibilityRole="switch"
      accessibilityState={{ checked: true }}
      className={
        largeTextLayout
          ? "-mx-2 min-h-16 flex-row items-start gap-3 border-b border-border px-3 py-3 active:bg-accent/60"
          : "-mx-2 min-h-16 flex-row items-center gap-3 border-b border-border px-3 active:bg-accent/60"
      }
      haptic
      onPress={onPress}
      transition
    >
      <View
        className={
          largeTextLayout
            ? "mt-1 h-10 w-10 items-center justify-center rounded-2xl bg-muted"
            : "h-10 w-10 items-center justify-center rounded-2xl bg-muted"
        }
      >
        <Icon className="size-sm text-primary" name="Briefcase" />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-sm font-bold text-foreground">
          Create tracked work
        </Text>
        <Text className="text-xs leading-4 text-muted-foreground">
          Turn each confirmed service order into a job.
        </Text>
      </View>
      <View
        className={
          largeTextLayout
            ? "mt-1 h-7 w-12 items-end justify-center rounded-full bg-primary px-1"
            : "h-7 w-12 items-end justify-center rounded-full bg-primary px-1"
        }
      >
        <View className="h-5 w-5 rounded-full bg-background" />
      </View>
    </Pressable>
  )
}

export function ServiceChoicesSectionHeader({
  helperText,
  onAddOption,
}: {
  helperText: string
  onAddOption: () => void
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <View
      className={
        largeTextLayout ? "gap-3" : "flex-row items-start justify-between gap-3"
      }
    >
      <View className={largeTextLayout ? "gap-1" : "min-w-0 flex-1 gap-1"}>
        <Text className="text-lg font-extrabold text-foreground">
          Service choices
        </Text>
        <Text className="text-xs text-muted-foreground">{helperText}</Text>
      </View>
      <Pressable
        accessibilityLabel="Add option"
        className={
          largeTextLayout
            ? "min-h-12 w-full flex-row items-center justify-center gap-2 rounded-full bg-muted px-5"
            : "min-h-11 shrink-0 flex-row items-center gap-2 rounded-full bg-muted px-4"
        }
        haptic
        onPress={onAddOption}
        transition
      >
        <Icon className="size-xs text-primary" name="Plus" />
        <Text className="text-xs font-extrabold text-primary">Add option</Text>
      </Pressable>
    </View>
  )
}

export function EmptyServiceChoiceGroupActions({
  groupName,
  onAddFirstChoice,
}: {
  groupName: string
  onAddFirstChoice: () => void
}) {
  return (
    <>
      <View className="flex-row flex-wrap gap-2">
        <Pressable
          accessibilityLabel={`Add values to ${groupName || "option"}`}
          className="min-h-10 flex-row items-center gap-2 rounded-full bg-muted px-3"
          haptic
          onPress={onAddFirstChoice}
          transition
        >
          <Icon className="size-xs text-foreground" name="Plus" />
          <Text className="text-xs font-bold text-foreground">
            Add first choice
          </Text>
        </Pressable>
      </View>
      <View className="border-l-2 border-primary bg-muted px-3 py-3">
        <Text className="text-xs leading-5 text-muted-foreground">
          Customers can choose from {groupName || "this option"} after you add
          its first choice.
        </Text>
      </View>
    </>
  )
}

export function SectionHeaderActions({
  addLabel,
  canRemove = true,
  onAdd,
  onRemove,
  removeLabel,
}: {
  addLabel: string
  canRemove?: boolean
  onAdd: () => void
  onRemove: () => void
  removeLabel: string
}) {
  return (
    <View className="flex-row items-center">
      {canRemove ? (
        <>
          <Pressable
            accessibilityLabel={removeLabel}
            accessibilityRole="button"
            className="min-h-11 min-w-20 items-center justify-center rounded-full px-5 active:bg-destructive/10"
            haptic
            onPress={onRemove}
            transition
          >
            <Text className="text-sm font-bold text-destructive">Remove</Text>
          </Pressable>
          <Text className="text-sm text-muted-foreground">|</Text>
        </>
      ) : null}
      <Pressable
        accessibilityLabel={addLabel}
        accessibilityRole="button"
        className="min-h-11 min-w-20 items-center justify-center rounded-full px-5 active:bg-primary/10"
        haptic
        onPress={onAdd}
        transition
      >
        <Text className="text-sm font-bold text-primary">Add</Text>
      </Pressable>
    </View>
  )
}

export function ToggleRow({
  enabled,
  label,
  onPress,
}: {
  enabled: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      className="min-h-11 flex-row items-center justify-between gap-3"
      haptic
      onPress={onPress}
    >
      <Text className="min-w-0 flex-1 font-bold text-foreground">{label}</Text>
      <View
        className={
          enabled
            ? "h-7 w-12 items-end justify-center rounded-full bg-primary px-1"
            : "h-7 w-12 items-start justify-center rounded-full bg-muted px-1"
        }
      >
        <View className="h-5 w-5 rounded-full bg-background" />
      </View>
    </Pressable>
  )
}

export function CatalogEssentialsFields({
  guidance,
  currencyCode,
  defaultQuoteRequired,
  kind,
  multiplePriceOptions,
  name,
  onNameChange,
  onNameBlur,
  onPriceChange,
  onUnitNameChange,
  price,
  showProductEssentials,
  unitName,
}: {
  currencyCode: string
  defaultQuoteRequired: boolean
  kind: CatalogItemKind
  multiplePriceOptions: boolean
  name: string
  onNameChange: (value: string) => void
  onNameBlur?: () => void
  onPriceChange: (value: string) => void
  onUnitNameChange: (value: string) => void
  price: string
  guidance: CatalogFormGuidance
  showProductEssentials: boolean
  unitName: string
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <>
      <FormField
        autoCapitalize="words"
        label={kind === "product" ? "Product name" : "Service name"}
        maxLength={160}
        onChangeText={onNameChange}
        onBlur={onNameBlur}
        placeholder={guidance.name.placeholder}
        returnKeyType="next"
        value={name}
      />
      {kind === "product" && showProductEssentials ? (
        <View className={largeTextLayout ? "gap-3" : "flex-row gap-3"}>
          <FormField
            autoCapitalize="words"
            containerClassName={largeTextLayout ? undefined : "min-w-0 flex-1"}
            label="Main unit"
            maxLength={80}
            onChangeText={onUnitNameChange}
            placeholder={guidance.stockUnit?.placeholder}
            value={unitName}
          />
          <MoneyField
            containerClassName={largeTextLayout ? undefined : "min-w-0 flex-1"}
            currencyCode={currencyCode}
            editable={!multiplePriceOptions}
            helper={
              multiplePriceOptions
                ? "Set prices in Product stock & pricing below."
                : undefined
            }
            label="Selling price"
            onChangeValue={onPriceChange}
            placeholder="0.00"
            value={price}
          />
        </View>
      ) : !defaultQuoteRequired ? (
        <MoneyField
          currencyCode={currencyCode}
          helper="Set the amount customers pay for this service. Choose Quote each job when the amount depends on the request."
          label="Fixed price"
          onChangeValue={onPriceChange}
          placeholder="0.00"
          value={price}
        />
      ) : null}
      {kind === "product" && showProductEssentials ? (
        <UnitChips
          onSelect={onUnitNameChange}
          suggestions={guidance.stockUnit?.suggestions ?? []}
          value={unitName}
        />
      ) : null}
    </>
  )
}

/** One-tap units from the business type, e.g. Crate, Piece, Tray, Bag. */
function UnitChips({
  onSelect,
  suggestions,
  value,
}: {
  onSelect: (unit: string) => void
  suggestions: readonly string[]
  value: string
}) {
  const units = suggestions.slice(0, 5)
  if (!units.length) return null
  return (
    <View
      accessibilityLabel="Common units"
      className="-mt-1 flex-row flex-wrap gap-2"
    >
      {units.map((unit) => {
        const selected = unit.toLowerCase() === value.trim().toLowerCase()
        return (
          <Pressable
            accessibilityLabel={`Sell by ${unit}`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            className={cn(
              "min-h-9 justify-center rounded-full border-[1.5px] px-3.5",
              selected
                ? "border-primary bg-accent"
                : "border-transparent bg-muted",
            )}
            haptic
            hitSlop={4}
            key={unit}
            onPress={() => onSelect(unit)}
          >
            <Text
              className={cn(
                "text-[12.5px] font-bold",
                selected ? "text-primary" : "text-foreground",
              )}
            >
              {unit}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** 01 Live Card: the item as customers will see it, updating as you type. */
export function CatalogLivePreview({
  currencyCode,
  kind,
  label = "Customers will see",
  name,
  pill = "Draft",
  price,
  quoteRequired,
  unitName,
}: {
  currencyCode: string
  kind: CatalogItemKind
  label?: string
  name: string
  pill?: string
  price: string
  quoteRequired?: boolean
  unitName: string
}) {
  const trimmedName = name.trim()
  const amount = Number(price.replace(/,/g, ""))
  const priceLine =
    kind === "service" && quoteRequired
      ? "Quote each job"
      : price.trim() && Number.isFinite(amount)
        ? `${getCurrencySymbol(currencyCode)}${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${kind === "product" && unitName.trim() ? ` per ${unitName.trim().toLowerCase()}` : ""}`
        : "Set a price"
  return (
    <HeroCard
      label={label}
      pill={{ label: pill, tone: "draft" }}
      testID="catalog-live-preview"
    >
      <View
        accessibilityLabel={`${trimmedName || "Unnamed item"}, ${priceLine}`}
        accessible
        className="mt-3 flex-row items-center gap-3"
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: "rgba(255,255,255,0.14)",
            borderRadius: 14,
            height: 52,
            justifyContent: "center",
            width: 52,
          }}
        >
          <Icon
            className="size-[22px]"
            color="#FFF9ED"
            name={kind === "service" ? "Wrench" : "Camera"}
          />
        </View>
        <View className="min-w-0 flex-1">
          <NativeText
            numberOfLines={2}
            style={{
              color: "#FFF9ED",
              fontSize: 20,
              fontWeight: "800",
              letterSpacing: -0.4,
              lineHeight: 25,
              opacity: trimmedName ? 1 : 0.6,
            }}
          >
            {trimmedName ||
              (kind === "service" ? "Your service" : "Your product")}
          </NativeText>
          <NativeText
            style={{
              color: "rgba(255,249,237,0.78)",
              fontSize: 14,
              fontVariant: ["tabular-nums"],
              fontWeight: "700",
              lineHeight: 20,
            }}
          >
            {priceLine}
          </NativeText>
        </View>
      </View>
    </HeroCard>
  )
}

export function ProductOptionsSectionHeader({
  helperText,
  hasOptions,
  onAddOption,
}: {
  helperText: string
  hasOptions: boolean
  onAddOption: () => void
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <View
      className={
        largeTextLayout && hasOptions
          ? "gap-3"
          : "flex-row items-start justify-between gap-3"
      }
    >
      <View
        className={
          largeTextLayout && hasOptions ? "gap-1" : "min-w-0 flex-1 gap-1"
        }
      >
        <Text className="text-lg font-extrabold text-foreground">
          Product options
        </Text>
        <Text
          className={
            largeTextLayout
              ? "text-xs leading-5 text-muted-foreground"
              : "text-xs text-muted-foreground"
          }
        >
          {helperText}
        </Text>
      </View>
      {hasOptions ? (
        <Pressable
          accessibilityLabel="Add option"
          className={
            largeTextLayout
              ? "min-h-12 w-full flex-row items-center justify-center gap-2 rounded-full bg-muted px-5"
              : "min-h-11 shrink-0 flex-row items-center gap-2 rounded-full bg-muted px-4"
          }
          haptic
          onPress={onAddOption}
          transition
        >
          <Icon className="size-xs text-primary" name="Plus" />
          <Text className="text-xs font-extrabold text-primary">
            Add option
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function ProductFirstOptionAction({
  helperText,
  onPress,
}: {
  helperText: string
  onPress: () => void
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <View className="gap-3 border-b border-border pb-4">
      <Pressable
        accessibilityLabel="Add first Product option"
        className={
          largeTextLayout
            ? "-mx-2 min-h-16 flex-row items-start gap-3 rounded-2xl px-3 py-3 active:bg-muted"
            : "-mx-2 min-h-16 flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-muted"
        }
        haptic
        onPress={onPress}
      >
        <View
          className={
            largeTextLayout
              ? "mt-1 h-10 w-10 items-center justify-center rounded-2xl bg-muted"
              : "h-10 w-10 items-center justify-center rounded-2xl bg-muted"
          }
        >
          <Icon className="size-sm text-primary" name="Plus" />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-sm font-extrabold text-foreground">
            Add first option
          </Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            {helperText}
          </Text>
        </View>
        <Icon
          className={
            largeTextLayout
              ? "mt-1 size-sm text-muted-foreground"
              : "size-sm text-muted-foreground"
          }
          name="ChevronRight"
        />
      </Pressable>
      <View className="border-l-2 border-primary bg-muted px-3 py-3">
        <Text className="text-xs leading-5 text-muted-foreground">
          After you add values, Product stock &amp; pricing will create every
          combination for you.
        </Text>
      </View>
    </View>
  )
}

export function ProductFirstOptionValueAction({
  helperText,
  groupName,
  onPress,
}: {
  helperText: string
  groupName: string
  onPress: () => void
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <>
      <Pressable
        accessibilityLabel={`Add first value to ${groupName || "option"}`}
        className={
          largeTextLayout
            ? "-mx-2 min-h-16 flex-row items-start gap-3 rounded-2xl px-3 py-3 active:bg-muted"
            : "-mx-2 min-h-16 flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-muted"
        }
        haptic
        onPress={onPress}
      >
        <View
          className={
            largeTextLayout
              ? "mt-1 h-10 w-10 items-center justify-center rounded-2xl bg-muted"
              : "h-10 w-10 items-center justify-center rounded-2xl bg-muted"
          }
        >
          <Icon className="size-sm text-primary" name="Plus" />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-sm font-extrabold text-foreground">
            Add first {groupName || "option"} value
          </Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            {helperText}
          </Text>
        </View>
        <Icon
          className={
            largeTextLayout
              ? "mt-1 size-sm text-muted-foreground"
              : "size-sm text-muted-foreground"
          }
          name="ChevronRight"
        />
      </Pressable>
      <View className="border-l-2 border-primary bg-muted px-3 py-3">
        <Text className="text-xs leading-5 text-muted-foreground">
          Product stock &amp; pricing appears after every option has at least
          one value.
        </Text>
      </View>
    </>
  )
}

export function ProductUseOnePriceAction({
  onPress,
}: {
  onPress: () => void
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <Pressable
      accessibilityLabel="Use one price instead and clear Product options"
      className={
        largeTextLayout
          ? "-mx-2 min-h-16 flex-row items-start gap-3 rounded-2xl px-3 py-3 active:bg-destructive/10"
          : "-mx-2 min-h-16 flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-destructive/10"
      }
      haptic
      onPress={onPress}
    >
      <View
        className={
          largeTextLayout
            ? "mt-1 h-10 w-10 items-center justify-center rounded-2xl bg-destructive/10"
            : "h-10 w-10 items-center justify-center rounded-2xl bg-destructive/10"
        }
      >
        <Icon className="size-sm text-destructive" name="RotateCw" />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-xs font-extrabold text-destructive">
          Use one price instead
        </Text>
        <Text className="text-xs leading-5 text-muted-foreground">
          Clear option setup and return to one Product price.
        </Text>
      </View>
      <Icon
        className={
          largeTextLayout
            ? "mt-1 size-sm text-muted-foreground"
            : "size-sm text-muted-foreground"
        }
        name="ChevronRight"
      />
    </Pressable>
  )
}
