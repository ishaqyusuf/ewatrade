import { BarcodeField } from "@/components/mobile/barcode-field"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import {
  addExactDecimals,
  compareExactDecimals,
  formatMinorMoney,
} from "@ewatrade/utils"
import { type ReactNode, useState } from "react"
import { Text as NativeText, TextInput, View } from "react-native"
import { CatalogSetupPricing } from "./catalog-setup-pricing"
import type { CatalogVariantDraft } from "./catalog-variant-model"
import type { CatalogSetupModel } from "./use-catalog-setup"

// More details editors for the 01 Live Card (owner revision, 9 Oct 2026).

type Choice = { key: string; name: string }

function useDrafts(model: CatalogSetupModel) {
  const choices: Choice[] = model.showAdvanced
    ? model.combinations.filter(
        (combination) =>
          (
            model.variantDrafts[combination.key] ??
            model.makeDefaultVariantDraft()
          ).enabled,
      )
    : [{ key: "default", name: model.name.trim() || "This product" }]
  const draft = (key: string) =>
    model.variantDrafts[key] ?? model.makeDefaultVariantDraft()
  const update = (key: string, change: Partial<CatalogVariantDraft>) => {
    if (model.locked) return
    model.setVariantDrafts((current) => ({
      ...current,
      [key]: {
        ...model.makeDefaultVariantDraft(),
        ...current[key],
        ...change,
      },
    }))
  }
  return { choices, draft, update }
}

function Lead({ children }: { children: string }) {
  return <Text className="text-[13px] text-muted-foreground">{children}</Text>
}

function Section({ title, trailing }: { title: string; trailing?: string }) {
  return (
    <View className="mt-2 flex-row items-baseline justify-between">
      <Text className="text-base font-extrabold text-foreground">{title}</Text>
      {trailing ? (
        <Text className="text-[13px] font-bold text-muted-foreground">
          {trailing}
        </Text>
      ) : null}
    </View>
  )
}

function Card({
  children,
  rows = false,
}: { children: ReactNode; rows?: boolean }) {
  return (
    <View
      className={cn(
        "rounded-[20px] bg-card shadow-sm",
        rows ? "px-3.5" : "gap-3 p-3.5",
      )}
    >
      {children}
    </View>
  )
}

/** A small right-aligned number or money input for list rows. */
function MiniInput({
  accessibilityLabel,
  editable = true,
  onChangeText,
  placeholder,
  prefix,
  value,
}: {
  accessibilityLabel: string
  editable?: boolean
  onChangeText: (value: string) => void
  placeholder: string
  prefix?: string
  value: string
}) {
  const colors = useColors()
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.muted,
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1.5,
        flexDirection: "row",
        gap: 4,
        height: 42,
        opacity: editable ? 1 : 0.5,
        paddingHorizontal: 10,
        width: 112,
      }}
    >
      {prefix ? (
        <NativeText
          style={{ color: colors.mutedForeground, fontWeight: "800" }}
        >
          {prefix}
        </NativeText>
      ) : null}
      <TextInput
        accessibilityLabel={accessibilityLabel}
        editable={editable}
        keyboardType="decimal-pad"
        maxFontSizeMultiplier={1.3}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        selectTextOnFocus
        style={{
          color: colors.foreground,
          flex: 1,
          fontSize: 14,
          fontVariant: ["tabular-nums"],
          fontWeight: "700",
          padding: 0,
          textAlign: "right",
        }}
        value={value}
      />
    </View>
  )
}

function Row({
  children,
  first,
}: {
  children: ReactNode
  first: boolean
}) {
  return (
    <View
      className={cn(
        "min-h-[58px] flex-row items-center gap-2.5 py-2.5",
        !first && "border-t border-border",
      )}
    >
      {children}
    </View>
  )
}

function stepQuantity(value: string, direction: 1 | -1) {
  try {
    const next = addExactDecimals(value.trim() || "0", String(direction))
    return compareExactDecimals(next, "0") < 0 ? "0" : next
  } catch {
    return direction === 1 ? "1" : "0"
  }
}

/** Opening stock: one stepper, or a quantity per choice with a total. */
export function ClassicOpeningStock({ model }: { model: CatalogSetupModel }) {
  const colors = useColors()
  const { choices, draft, update } = useDrafts(model)
  const unit = model.unitName.trim().toLowerCase() || "units"
  const setSingle = (value: string) => {
    model.setShowOpeningStock(Boolean(value.trim()))
    model.setOpeningStock(value)
  }
  const stepButton = (direction: 1 | -1) => (
    <Pressable
      accessibilityLabel={direction === 1 ? "One more" : "One less"}
      accessibilityRole="button"
      disabled={model.locked}
      haptic
      onPress={() => setSingle(stepQuantity(model.openingStock, direction))}
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
  const total = choices.reduce(
    (sum, choice) => sum + (Number(draft(choice.key).quantity) || 0),
    0,
  )
  return (
    <View className="gap-3.5">
      <Lead>
        How many do you have right now? Leave it blank if you have not counted
        yet.
      </Lead>
      {model.showAdvanced ? (
        <>
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.accent,
              borderRadius: 18,
              flexDirection: "row",
              justifyContent: "space-between",
              padding: 16,
            }}
          >
            <View>
              <NativeText
                style={{
                  color: colors.accentForeground,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                Total in stock
              </NativeText>
              <NativeText
                style={{
                  color: colors.accentForeground,
                  fontSize: 15,
                  fontWeight: "800",
                }}
              >
                {`${total} ${unit}`}
              </NativeText>
            </View>
            <NativeText
              style={{
                color: colors.accentForeground,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {`${choices.length} ${choices.length === 1 ? "choice" : "choices"}`}
            </NativeText>
          </View>
          <Section title="Per choice" trailing={unit} />
          <Card rows>
            {choices.map((choice, index) => (
              <Row key={choice.key} first={index === 0}>
                <Text
                  numberOfLines={1}
                  className="min-w-0 flex-1 text-sm font-bold text-foreground"
                >
                  {choice.name}
                </Text>
                <MiniInput
                  accessibilityLabel={`Opening stock for ${choice.name}`}
                  editable={!model.locked}
                  onChangeText={(value) =>
                    update(choice.key, { quantity: value })
                  }
                  placeholder="Not counted"
                  value={draft(choice.key).quantity}
                />
              </Row>
            ))}
          </Card>
        </>
      ) : (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.accent,
            borderRadius: 18,
            flexDirection: "row",
            justifyContent: "space-between",
            padding: 16,
          }}
        >
          <View className="min-w-0 shrink">
            <NativeText
              style={{
                color: colors.accentForeground,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              In stock now
            </NativeText>
            <NativeText
              numberOfLines={1}
              style={{
                color: colors.accentForeground,
                fontSize: 15,
                fontWeight: "800",
              }}
            >
              {model.unitName.trim() || "Main units"}
            </NativeText>
          </View>
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
              accessibilityLabel={`Opening stock in ${unit}`}
              editable={!model.locked}
              keyboardType="decimal-pad"
              maxFontSizeMultiplier={1.3}
              onChangeText={setSingle}
              placeholder="—"
              placeholderTextColor={colors.mutedForeground}
              selectTextOnFocus
              style={{
                color: colors.foreground,
                fontSize: 18,
                fontVariant: ["tabular-nums"],
                fontWeight: "800",
                minWidth: 48,
                padding: 0,
                textAlign: "center",
              }}
              value={model.openingStock}
            />
            {stepButton(1)}
          </View>
        </View>
      )}
      <StatusBanner
        icon="Info"
        tone="primary"
        message="Saved as opening stock when you save the product. Later changes go through Stock in or a count."
      />
    </View>
  )
}

/** SKU and barcode for the item, or for each choice. */
export function ClassicCodes({ model }: { model: CatalogSetupModel }) {
  const { choices, draft, update } = useDrafts(model)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected =
    choices.find((choice) => choice.key === selectedKey) ?? choices[0]
  if (!selected)
    return <Lead>Finish your customer choices to add their codes.</Lead>
  const current = draft(selected.key)
  const generate = () => {
    const base =
      model.name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, "")
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.slice(0, 4))
        .slice(0, 2)
        .join("-") || "ITEM"
    const suffix =
      choices.length > 1
        ? `-${selected.name
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 3)}`
        : ""
    update(selected.key, { sku: `${base}${suffix}`.slice(0, 120) })
  }
  return (
    <View className="gap-3.5">
      <Lead>
        Your own reference and the code printed on the pack. Both are optional.
      </Lead>
      <Card>
        {choices.length > 1 ? (
          <Text className="text-xs font-bold text-muted-foreground">
            {selected.name}
          </Text>
        ) : null}
        <View className="flex-row items-end gap-2">
          <View className="min-w-0 flex-1">
            <FormField
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!model.locked}
              label="SKU"
              maxLength={120}
              onChangeText={(value) => update(selected.key, { sku: value })}
              placeholder="e.g. EGG-CRATE"
              value={current.sku}
              variant="green-gate"
            />
          </View>
          <Pressable
            accessibilityLabel="Generate SKU"
            accessibilityRole="button"
            className="min-h-[50px] flex-row items-center gap-1.5 rounded-[14px] bg-accent px-3.5"
            disabled={model.locked}
            haptic
            onPress={generate}
          >
            <Icon
              className="size-[15px] text-accent-foreground"
              name="Sparkles"
            />
            <Text className="text-[13px] font-extrabold text-accent-foreground">
              Generate
            </Text>
          </Pressable>
        </View>
        <BarcodeField
          key={selected.key}
          editable={!model.locked}
          label="Barcode"
          maxLength={120}
          onChangeText={(value) => update(selected.key, { barcode: value })}
          placeholder="Scan or type"
          value={current.barcode}
        />
      </Card>
      {choices.length > 1 ? (
        <>
          <Section title="Per choice" trailing="Tap to edit" />
          <Card rows>
            {choices.map((choice, index) => {
              const on = choice.key === selected.key
              return (
                <Pressable
                  key={choice.key}
                  accessibilityLabel={`Edit codes for ${choice.name}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  className={cn(
                    "-mx-3.5 min-h-[52px] flex-row items-center gap-2.5 px-3.5 py-2.5",
                    index > 0 && "border-t border-border",
                    on && "bg-accent",
                  )}
                  haptic
                  onPress={() => setSelectedKey(choice.key)}
                >
                  <Text
                    numberOfLines={1}
                    className="min-w-0 flex-1 text-sm font-bold text-foreground"
                  >
                    {choice.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {draft(choice.key).sku || "No SKU"}
                  </Text>
                </Pressable>
              )
            })}
          </Card>
        </>
      ) : null}
      <StatusBanner
        icon="Info"
        tone="primary"
        message="Scanning a barcode in New sale adds this product straight away."
      />
    </View>
  )
}

/** Stores it is sold in, then a price per choice; unit prices stay below. */
export function ClassicPricing({ model }: { model: CatalogSetupModel }) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const { choices, draft, update } = useDrafts(model)
  const [advanced, setAdvanced] = useState(false)
  const symbol =
    formatMinorMoney(0, model.currencyCode).replace(/[\d.,\s]/g, "") ||
    model.currencyCode
  const unit = model.unitName.trim().toLowerCase() || "unit"
  const soldIn = (storeId: string) =>
    choices.some((choice) => draft(choice.key).storeIds.includes(storeId))
  const setStore = (storeId: string, on: boolean) => {
    for (const choice of choices) {
      const ids = draft(choice.key).storeIds.filter((id) => id !== storeId)
      update(choice.key, { storeIds: on ? [...ids, storeId] : ids })
    }
  }
  return (
    <View className="gap-3.5">
      <Lead>
        Where it is sold and for how much. Each Store can sell it or not.
      </Lead>
      {model.stores.length ? (
        <>
          <Section title="Sold in" />
          <Card rows>
            {model.stores.map((store, index) => {
              const on = soldIn(store.id)
              return (
                <Row key={store.id} first={index === 0}>
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: palette.mint,
                      borderRadius: 11,
                      height: 36,
                      justifyContent: "center",
                      width: 36,
                    }}
                  >
                    <Icon
                      className="size-[17px]"
                      color={palette.mintForeground}
                      name="Store"
                    />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-bold text-foreground">
                      {store.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {on
                        ? "Customers can order it here"
                        : "Hidden in this Store"}
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel={`Sell in ${store.name}`}
                    checked={on}
                    disabled={model.locked}
                    onCheckedChange={(checked) => setStore(store.id, checked)}
                  />
                </Row>
              )
            })}
          </Card>
        </>
      ) : null}
      <Section
        title={`Price per ${unit}`}
        trailing={
          choices.length > 1 ? `${choices.length} choices` : "One price"
        }
      />
      <Card rows>
        {model.showAdvanced ? (
          choices.map((choice, index) => (
            <Row key={choice.key} first={index === 0}>
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 text-sm font-bold text-foreground"
              >
                {choice.name}
              </Text>
              <MiniInput
                accessibilityLabel={`Price for ${choice.name}`}
                editable={!model.locked}
                onChangeText={(value) => update(choice.key, { price: value })}
                placeholder={model.price || "0"}
                prefix={symbol}
                value={draft(choice.key).price}
              />
            </Row>
          ))
        ) : (
          <Row first>
            <Text className="min-w-0 flex-1 text-sm font-bold text-foreground">
              {model.name.trim() || "This product"}
            </Text>
            <MiniInput
              accessibilityLabel="Selling price"
              editable={!model.locked}
              onChangeText={model.setPrice}
              placeholder="0"
              prefix={symbol}
              value={model.price}
            />
          </Row>
        )}
      </Card>
      {model.additionalUnits.length ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-[52px] flex-row items-center gap-3 rounded-[18px] bg-card px-3.5 shadow-sm active:opacity-70"
          haptic
          onPress={() => setAdvanced((current) => !current)}
        >
          <Text className="min-w-0 flex-1 text-sm font-bold text-foreground">
            Prices for other selling units
          </Text>
          <Icon
            className="size-[18px] text-muted-foreground"
            name={advanced ? "ChevronDown" : "ChevronRight"}
          />
        </Pressable>
      ) : null}
      {advanced ? (
        <CatalogSetupPricing
          model={model}
          market={false}
          onLayout={() => undefined}
          onPageChange={() => undefined}
        />
      ) : null}
    </View>
  )
}

const DESCRIPTION_DETAILS = [
  "Fresh daily",
  "Delivery available",
  "Wholesale price",
  "Made locally",
]

/** Description with a counter and quick details. */
export function ClassicDescription({ model }: { model: CatalogSetupModel }) {
  const set = (value: string) => {
    model.setShowDescription(Boolean(value.trim()))
    model.setDescription(value.slice(0, 2000))
  }
  return (
    <View className="gap-3.5">
      <Lead>What customers will receive. Keep it short and specific.</Lead>
      <Card>
        <FormField
          label="Description"
          maxLength={2000}
          multiline
          onChangeText={set}
          placeholder={model.formGuidance.description.placeholder}
          textAlignVertical="top"
          value={model.description}
          variant="green-gate"
        />
        <Text className="text-right text-[11.5px] tabular-nums text-muted-foreground">
          {`${model.description.length} / 2000`}
        </Text>
      </Card>
      <Section title="Add a detail" />
      <View className="flex-row flex-wrap gap-1.5">
        {DESCRIPTION_DETAILS.map((detail) => (
          <Pressable
            key={detail}
            accessibilityLabel={`Add ${detail}`}
            accessibilityRole="button"
            className="min-h-9 flex-row items-center gap-1 rounded-full bg-muted px-3"
            disabled={model.locked}
            haptic
            onPress={() =>
              set(
                `${model.description.trim() ? `${model.description.trim()} ` : ""}${detail}.`,
              )
            }
          >
            <Icon className="size-[13px] text-foreground" name="Plus" />
            <Text className="text-[12.5px] font-bold text-foreground">
              {detail}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}
