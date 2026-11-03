import { ActionButton } from "@/components/mobile/action-button"
import { BarcodeField } from "@/components/mobile/barcode-field"
import { FormField } from "@/components/mobile/form-field"
import { RowDivider } from "@/components/mobile/green-till/kit"
import { MoneyField } from "@/components/mobile/money-field"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"
import { majorToMinor } from "@ewatrade/utils/currency"
import { type ReactNode, useState } from "react"
import { Alert } from "react-native"
import {
  MAX_OPTION_GROUPS,
  type ProductDraft,
  type VariantGroup,
  type VariantRow,
  type VariantsState,
  addGroup,
  addValue,
  addVariant,
  missingVariants,
  optionNameIssue,
  optionValueIssue,
  removeGroup,
  removeValue,
  removeVariant,
  renameGroup,
  updateVariant,
  variantIssue,
  variantLabel,
  variantUnits,
} from "./general-product-variants-model"

type EditorProps = {
  draft: ProductDraft
  state: VariantsState
  currencyCode: string
  disabled: boolean
  onChange: (state: VariantsState) => void
}

const money = (text: string, currencyCode: string) => {
  const minor = majorToMinor(text)
  return minor === null ? null : formatMinorMoney(minor, currencyCode)
}

function rowSummary(
  row: VariantRow,
  draft: ProductDraft,
  currencyCode: string,
) {
  const prices = variantUnits(draft).map((unitName, index) => {
    const amount = money(
      index === 0 ? row.price : (row.packPrices[unitName] ?? ""),
      currencyCode,
    )
    return amount ? `${amount} / ${unitName}` : `${unitName} price needed`
  })
  const counts = variantUnits(draft).flatMap((unitName) => {
    const quantity = row.stock[unitName]?.trim()
    return quantity ? [`${quantity} ${unitName}`] : []
  })
  const details = [
    counts.length
      ? `Stock ${counts.join(" + ")}`
      : "Opening stock not supplied",
    row.sku.trim() ? `SKU ${row.sku.trim()}` : null,
    row.barcode.trim() ? "Barcode" : null,
  ].filter(Boolean)
  return { prices: prices.join(" · "), details: details.join(" · ") }
}

/**
 * Removing an option merges the variants it told apart, so the owner
 * confirms first; an option with no values goes straight away.
 */
function confirmRemoveGroup(
  state: VariantsState,
  group: VariantGroup,
  onChange: (state: VariantsState) => void,
) {
  const next = removeGroup(state, group.id)
  if (!group.values.length) return onChange(next)
  const name = group.name.trim() || "this option"
  const merged = state.rows.length - next.rows.length
  Alert.alert(
    `Remove ${name}?`,
    merged > 0
      ? `Its values come off every variant. Variants go from ${state.rows.length} to ${next.rows.length}, and the price, stock and codes of the ${merged} merged ${merged === 1 ? "variant are" : "variants are"} dropped.`
      : "Its values come off every variant.",
    [
      { style: "cancel", text: "Keep option" },
      { onPress: () => onChange(next), style: "destructive", text: "Remove" },
    ],
  )
}

/** Options, then one row per variant; a row opens that variant's page. */
export function GeneralProductVariantList({
  draft,
  state,
  currencyCode,
  disabled,
  onChange,
  onOpen,
  seed,
}: EditorProps & {
  onOpen: (rowId: string) => void
  /** The single price and stock a first option carries into its variant. */
  seed: { price: string; stock?: string }
}) {
  const largeTextLayout = useLargeTextLayout()
  const [adding, setAdding] = useState<string | null>(null)
  const [newValue, setNewValue] = useState("")
  const [newGroup, setNewGroup] = useState({ name: "", value: "" })
  const [problem, setProblem] = useState<string | null>(null)
  const missing = missingVariants(state)
  const closeAdd = () => {
    setAdding(null)
    setNewValue("")
    setNewGroup({ name: "", value: "" })
    setProblem(null)
  }
  const submitValue = (groupId: string) => {
    const issue = optionValueIssue(state, groupId, newValue)
    if (issue) return setProblem(issue)
    onChange(addValue(state, groupId, newValue))
    closeAdd()
  }
  const submitGroup = () => {
    const issue =
      optionNameIssue(state, newGroup.name) ??
      optionValueIssue(state, null, newGroup.value)
    if (issue) return setProblem(issue)
    onChange(
      addGroup(state, newGroup.name, newGroup.value, {
        ...seed,
        unitName: draft.canonicalUnitName,
      }),
    )
    closeAdd()
  }
  return (
    <View className="gap-3">
      <Text
        accessibilityRole="header"
        className="text-xs font-extrabold uppercase tracking-[1.2px] text-muted-foreground"
      >
        Options
      </Text>
      <View className="overflow-hidden rounded-[20px] bg-card">
        {state.groups.map((group, index) => (
          <View
            key={group.id}
            className={cn(
              "gap-3 px-3.5 py-3",
              index > 0 && "border-t border-border",
            )}
          >
            <View
              className={largeTextLayout ? "gap-2" : "flex-row items-end gap-2"}
            >
              <FormField
                containerClassName={
                  largeTextLayout ? undefined : "min-w-0 flex-1"
                }
                label="Option name"
                value={group.name}
                editable={!disabled}
                maxLength={60}
                onChangeText={(name) =>
                  onChange(renameGroup(state, group.id, name))
                }
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${group.name || "this option"} and its variants`}
                disabled={disabled}
                haptic
                className="min-h-11 items-center justify-center self-start rounded-full px-3"
                onPress={() => confirmRemoveGroup(state, group, onChange)}
              >
                <Text className="text-sm font-bold text-destructive">
                  Remove
                </Text>
              </Pressable>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {group.values.map((value) => (
                <View
                  key={value}
                  className="min-h-10 flex-row items-center rounded-full border border-border bg-background pl-3.5"
                >
                  <Text className="text-sm font-bold text-foreground">
                    {value}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${value}`}
                    disabled={disabled}
                    haptic
                    className="h-10 w-10 items-center justify-center rounded-full"
                    onPress={() =>
                      onChange(removeValue(state, group.id, value))
                    }
                  >
                    <Icon name="X" className="size-xs text-muted-foreground" />
                  </Pressable>
                </View>
              ))}
              {adding === group.id ? null : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add a ${group.name || "option"} value`}
                  disabled={disabled}
                  haptic
                  className="min-h-10 flex-row items-center gap-1.5 rounded-full border border-dashed border-border px-3.5"
                  onPress={() => {
                    closeAdd()
                    setAdding(group.id)
                  }}
                >
                  <Icon name="Plus" className="size-xs text-primary" />
                  <Text className="text-sm font-bold text-primary">
                    Add value
                  </Text>
                </Pressable>
              )}
            </View>
            {adding === group.id ? (
              <AddRow
                disabled={disabled}
                largeText={largeTextLayout}
                onCancel={closeAdd}
                onSubmit={() => submitValue(group.id)}
                problem={problem}
              >
                <FormField
                  autoFocus
                  label={`New ${group.name || "option"} value`}
                  value={newValue}
                  editable={!disabled}
                  maxLength={60}
                  returnKeyType="done"
                  onChangeText={(text) => {
                    setNewValue(text)
                    setProblem(null)
                  }}
                  onSubmitEditing={() => submitValue(group.id)}
                />
              </AddRow>
            ) : null}
          </View>
        ))}
        {adding === "group" ? (
          <View
            className={cn(
              "gap-3 px-3.5 py-3",
              state.groups.length > 0 && "border-t border-border",
            )}
          >
            <AddRow
              disabled={disabled}
              largeText={largeTextLayout}
              onCancel={closeAdd}
              onSubmit={submitGroup}
              problem={problem}
            >
              <FormField
                autoFocus
                label="Option name"
                placeholder="Size, Colour…"
                value={newGroup.name}
                editable={!disabled}
                maxLength={60}
                onChangeText={(name) => {
                  setNewGroup((current) => ({ ...current, name }))
                  setProblem(null)
                }}
              />
              <FormField
                label="First value"
                placeholder="Big, Red…"
                value={newGroup.value}
                editable={!disabled}
                maxLength={60}
                returnKeyType="done"
                onChangeText={(value) => {
                  setNewGroup((current) => ({ ...current, value }))
                  setProblem(null)
                }}
                onSubmitEditing={submitGroup}
              />
            </AddRow>
          </View>
        ) : state.groups.length < MAX_OPTION_GROUPS ? (
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            haptic
            className="min-h-[52px] flex-row items-center gap-2.5 px-3.5 py-3"
            onPress={() => {
              closeAdd()
              setAdding("group")
            }}
          >
            {state.groups.length ? <RowDivider position="top" /> : null}
            <Icon name="Plus" className="size-sm text-primary" />
            <Text className="flex-1 text-sm font-extrabold text-primary">
              {state.groups.length ? "Add option" : "Add options, such as Size"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {state.rows.length ? (
        <>
          <Text
            accessibilityRole="header"
            className="mt-2 text-xs font-extrabold uppercase tracking-[1.2px] text-muted-foreground"
          >
            {state.rows.length === 1
              ? "1 variant"
              : `${state.rows.length} variants`}
          </Text>
          <View className="overflow-hidden rounded-[20px] bg-card">
            {state.rows.map((row, index) => {
              const issue = variantIssue(row, draft, currencyCode)
              const summary = rowSummary(row, draft, currencyCode)
              const label = variantLabel(row, draft.name)
              return (
                <Pressable
                  key={row.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${label}`}
                  accessibilityHint="Opens this variant's prices, stock and codes"
                  disabled={disabled}
                  haptic
                  className={cn(
                    "min-h-16 flex-row gap-2.5 px-3.5 py-3",
                    largeTextLayout ? "items-start" : "items-center",
                  )}
                  onPress={() => onOpen(row.id)}
                >
                  {index > 0 ? <RowDivider position="top" /> : null}
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="font-bold text-foreground">{label}</Text>
                    <Text
                      className={cn(
                        "text-xs",
                        issue
                          ? "font-bold text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {issue ?? summary.prices}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {summary.details}
                    </Text>
                  </View>
                  <Icon
                    name="ChevronRight"
                    className="size-xs text-muted-foreground"
                  />
                </Pressable>
              )
            })}
            {missing.length ? (
              <View className="gap-2 border-t border-border px-3.5 py-3">
                <Text className="text-xs text-muted-foreground">
                  Not in this draft
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {missing.map((selections) => {
                    const label = selections
                      .map((entry) => entry.value)
                      .join(" / ")
                    return (
                      <Pressable
                        key={label}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${label} variant`}
                        disabled={disabled}
                        haptic
                        className="min-h-10 flex-row items-center gap-1.5 rounded-full border border-dashed border-border px-3.5"
                        onPress={() => onChange(addVariant(state, selections))}
                      >
                        <Icon name="Plus" className="size-xs text-primary" />
                        <Text className="text-sm font-bold text-primary">
                          {label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  )
}

function AddRow({
  children,
  disabled,
  largeText,
  onCancel,
  onSubmit,
  problem,
}: {
  children: ReactNode
  disabled: boolean
  largeText: boolean
  onCancel: () => void
  onSubmit: () => void
  problem: string | null
}) {
  return (
    <View className="gap-3">
      {children}
      {problem ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-sm text-destructive"
        >
          {problem}
        </Text>
      ) : null}
      <View className={largeText ? "gap-2" : "flex-row gap-2"}>
        <View className={largeText ? undefined : "flex-1"}>
          <ActionButton disabled={disabled} onPress={onSubmit}>
            Add
          </ActionButton>
        </View>
        <View className={largeText ? undefined : "flex-1"}>
          <ActionButton
            disabled={disabled}
            variant="outline"
            onPress={onCancel}
          >
            Cancel
          </ActionButton>
        </View>
      </View>
    </View>
  )
}

/** Header for an open variant; sits above the sheet's scroll so Done stays visible with the keyboard up. */
export function GeneralProductVariantHeader({
  title,
  disabled,
  onBack,
  onDone,
}: {
  title: string
  disabled: boolean
  onBack: () => void
  onDone: () => void
}) {
  const largeTextLayout = useLargeTextLayout()
  return (
    <View
      className={cn(
        "border-b border-border px-3 pb-2.5",
        largeTextLayout ? "gap-1" : "flex-row items-center gap-2",
      )}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to variants"
          haptic
          className="min-h-11 flex-row items-center gap-0.5 rounded-full px-2"
          onPress={onBack}
        >
          <Icon name="ChevronLeft" className="size-sm text-primary" />
          <Text className="text-sm font-extrabold text-primary">Variants</Text>
        </Pressable>
        {largeTextLayout ? (
          <DoneButton disabled={disabled} onPress={onDone} />
        ) : null}
      </View>
      <Text
        accessibilityRole="header"
        className={cn(
          "font-extrabold text-foreground",
          largeTextLayout
            ? "px-2 text-lg"
            : "min-w-0 flex-1 text-center text-base",
        )}
        numberOfLines={largeTextLayout ? undefined : 1}
      >
        {title}
      </Text>
      {largeTextLayout ? null : (
        <DoneButton disabled={disabled} onPress={onDone} />
      )}
    </View>
  )
}

function DoneButton({
  disabled,
  onPress,
}: {
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Done editing this variant"
      disabled={disabled}
      haptic
      className="min-h-11 items-center justify-center rounded-full bg-primary px-4"
      onPress={onPress}
    >
      <Text className="text-sm font-extrabold text-primary-foreground">
        Done
      </Text>
    </Pressable>
  )
}

/** Two fields per row at normal text sizes; large text stacks them. */
const pairs = (names: string[]) =>
  names.flatMap((name, index) =>
    index % 2 === 0 ? [names.slice(index, index + 2)] : [],
  )

/** One variant: price per unit and pack, opening stock per unit, SKU and barcode. */
export function GeneralProductVariantPage({
  draft,
  state,
  rowId,
  currencyCode,
  disabled,
  error,
  onChange,
  onRemoved,
}: EditorProps & {
  rowId: string
  error: string | null
  onRemoved: () => void
}) {
  const largeTextLayout = useLargeTextLayout()
  const row = state.rows.find((entry) => entry.id === rowId)
  if (!row) return null
  const [unit, ...packs] = variantUnits(draft)
  const patch = (value: Partial<VariantRow>) =>
    onChange(updateVariant(state, row.id, value))
  const pair = largeTextLayout ? "gap-3.5" : "flex-row gap-3"
  const half = largeTextLayout ? undefined : "min-w-0 flex-1"
  const counts = variantUnits(draft).flatMap((unitName) => {
    const quantity = row.stock[unitName]?.trim()
    return quantity ? [`${quantity} ${unitName}`] : []
  })
  return (
    <View className="gap-3.5">
      {pairs([unit, ...packs]).map((names) => (
        <View key={names.join("|")} className={pair}>
          {names.map((name) => (
            <MoneyField
              key={name}
              containerClassName={half}
              currencyCode={currencyCode}
              label={`Price per ${name}`}
              editable={!disabled}
              placeholder="0.00"
              value={name === unit ? row.price : (row.packPrices[name] ?? "")}
              helper={
                name !== unit && row.derived[name]
                  ? `Suggested from ${row.derived[name]}`
                  : undefined
              }
              onChangeValue={(price) =>
                name === unit
                  ? patch({ price })
                  : patch({
                      packPrices: { ...row.packPrices, [name]: price },
                      derived: Object.fromEntries(
                        Object.entries(row.derived).filter(
                          ([key]) => key !== name,
                        ),
                      ),
                    })
              }
            />
          ))}
        </View>
      ))}
      <Text
        accessibilityRole="header"
        className="mt-1 text-xs font-extrabold uppercase tracking-[1.2px] text-muted-foreground"
      >
        Opening stock
      </Text>
      {pairs([...packs, unit]).map((names) => (
        <View key={names.join("|")} className={pair}>
          {names.map((name) => (
            <FormField
              key={name}
              containerClassName={half}
              label={`In ${name}`}
              value={row.stock[name] ?? ""}
              editable={!disabled}
              placeholder="0"
              keyboardType="decimal-pad"
              onChangeText={(quantity) =>
                patch({ stock: { ...row.stock, [name]: quantity } })
              }
            />
          ))}
        </View>
      ))}
      <Text className="text-xs text-muted-foreground">
        {counts.length
          ? `Counted as ${counts.join(" + ")}; saved in ${unit}.`
          : "Leave blank if you have not counted it."}
      </Text>
      <Text
        accessibilityRole="header"
        className="mt-1 text-xs font-extrabold uppercase tracking-[1.2px] text-muted-foreground"
      >
        Codes
      </Text>
      <FormField
        autoCapitalize="characters"
        autoCorrect={false}
        label="SKU"
        placeholder="Optional"
        maxLength={120}
        value={row.sku}
        editable={!disabled}
        onChangeText={(sku) => patch({ sku })}
      />
      <BarcodeField
        key={row.id}
        label="Barcode"
        placeholder="Scan or type"
        maxLength={120}
        value={row.barcode}
        editable={!disabled}
        onChangeText={(barcode) => patch({ barcode })}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-sm text-destructive"
        >
          {error}
        </Text>
      ) : null}
      {state.rows.length > 1 ? (
        <ActionButton
          disabled={disabled}
          icon="Trash"
          variant="destructive"
          onPress={() => {
            onChange(removeVariant(state, row.id))
            onRemoved()
          }}
        >
          {`Remove ${variantLabel(row, draft.name)}`}
        </ActionButton>
      ) : null}
    </View>
  )
}
