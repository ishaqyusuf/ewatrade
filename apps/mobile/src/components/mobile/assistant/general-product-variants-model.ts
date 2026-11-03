import { isCatalogVariantQuantityReady } from "@/lib/catalog-variant-readiness"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { productCreateVariants } from "@ewatrade/assistant/general/product-create"
import { setupNameEqual } from "@ewatrade/assistant/setup/variants"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import {
  type CatalogVariantDraft,
  type CatalogVariantManagerProps,
  catalogVariantDraftIssue,
} from "../catalog-setup/catalog-variant-model"

export type ProductDraft = Extract<GeneralAction, { action: "product_create" }>
type Variant = NonNullable<ProductDraft["variants"]>[number]
type Selection = Variant["selections"][number]

/** Limits of the draft schema and of Setup's Catalog mapping. */
export const MAX_OPTION_GROUPS = 3
export const MAX_OPTION_VALUES = 12
export const MAX_VARIANTS = 36
/** Setup creates every unit with two decimal places (setup-commit TRANSACTION_SCALE). */
const STOCK_SCALE = 2

export type VariantGroup = { id: string; name: string; values: string[] }
export type VariantRow = {
  id: string
  selections: Selection[]
  /** Price per main unit, as typed. */
  price: string
  /** Price per pack, as typed, by pack name. */
  packPrices: Record<string, string>
  /** Packs whose price is still the server's suggestion, by pack name. */
  derived: Record<string, string>
  /** Opening stock counted in each unit, as typed, by unit name. */
  stock: Record<string, string>
  sku: string
  barcode: string
}
export type VariantsState = { groups: VariantGroup[]; rows: VariantRow[] }

let sequence = 0
const nextId = (prefix: string) => `${prefix}-${++sequence}`
const same = setupNameEqual

export function variantLabel(row: VariantRow, productName: string) {
  return row.selections.map((entry) => entry.value).join(" / ") || productName
}

function find<T>(record: Record<string, T>, name: string) {
  const key = Object.keys(record).find((entry) => same(entry, name))
  return key === undefined ? undefined : record[key]
}

/** Editable rows for a draft: one per variant the draft would create. */
export function variantsFromDraft(draft: ProductDraft): VariantsState {
  const groups = (draft.options ?? []).map((group) => ({
    id: nextId("group"),
    name: group.name,
    values: [...group.values],
  }))
  const hasRows =
    groups.length > 0 ||
    (draft.sellingUnits?.length ?? 0) > 0 ||
    (draft.variants?.length ?? 0) > 0
  if (!hasRows) return { groups, rows: [] }
  // Typed and model-drafted unit names may differ in case; key by the unit's own name.
  const unitName = (name: string) =>
    variantUnits(draft).find((unit) => same(unit, name)) ?? name
  const rows = productCreateVariants(draft).map((row) => {
    const original = draft.variants?.find(
      (variant) =>
        variant.selections.length === row.selections.length &&
        row.selections.every((selection) =>
          variant.selections.some(
            (entry) =>
              same(entry.optionName, selection.optionName) &&
              same(entry.value, selection.value),
          ),
        ),
    )
    const stock: Record<string, string> = {}
    if (original?.stockByUnit?.length)
      for (const part of original.stockByUnit)
        stock[unitName(part.unitName)] = part.quantity
    else if (original?.openingStock !== undefined)
      stock[draft.canonicalUnitName] = original.openingStock
    // An unprepared pack-only draft still holds its one total at the top.
    else if (!original && !groups.length && draft.openingStock !== undefined)
      stock[draft.canonicalUnitName] = draft.openingStock
    return {
      id: nextId("variant"),
      selections: row.selections,
      price: minorToMajorInput(row.priceMinor),
      packPrices: Object.fromEntries(
        row.sellingUnits.map((pack) => [
          pack.name,
          minorToMajorInput(pack.priceMinor),
        ]),
      ),
      derived: Object.fromEntries(
        (original?.sellingUnitPrices ?? []).flatMap((price) =>
          price.derivedFromUnit
            ? [[unitName(price.unitName), price.derivedFromUnit]]
            : [],
        ),
      ),
      stock,
      sku: original?.sku ?? "",
      barcode: original?.barcode ?? "",
    }
  })
  return { groups, rows }
}

function emptyRow(selections: Selection[]): VariantRow {
  return {
    id: nextId("variant"),
    selections,
    price: "",
    packPrices: {},
    derived: {},
    stock: {},
    sku: "",
    barcode: "",
  }
}

/** Every option combination, in the Catalog grid's order. */
export function variantCombinations(groups: VariantGroup[]) {
  let combinations: Selection[][] = [[]]
  for (const group of groups)
    combinations = combinations.flatMap((combination) =>
      group.values.map((value) => [
        ...combination,
        { optionName: group.name, value },
      ]),
    )
  return combinations
}

const sameSelections = (left: Selection[], right: Selection[]) =>
  left.length === right.length &&
  left.every((entry) =>
    right.some(
      (other) =>
        same(entry.optionName, other.optionName) &&
        same(entry.value, other.value),
    ),
  )

/** Combinations the owner removed or never drafted; they can be added back. */
export function missingVariants(state: VariantsState) {
  if (!state.groups.length) return []
  return variantCombinations(state.groups).filter(
    (combination) =>
      !state.rows.some((row) => sameSelections(row.selections, combination)),
  )
}

/** Why a new option name or value cannot be added; null when it can. */
export function optionNameIssue(
  state: VariantsState,
  name: string,
  groupId?: string,
) {
  const trimmed = name.trim()
  if (!trimmed) return "Enter an option name."
  if (trimmed.length > 60) return "Keep option names within 60 characters."
  if (
    state.groups.some(
      (group) => group.id !== groupId && same(group.name, trimmed),
    )
  )
    return "Give each option a different name."
  return null
}

export function optionValueIssue(
  state: VariantsState,
  groupId: string | null,
  value: string,
) {
  const trimmed = value.trim()
  const group = state.groups.find((entry) => entry.id === groupId)
  if (!trimmed) return "Enter a value."
  if (trimmed.length > 60) return "Keep values within 60 characters."
  if (group?.values.some((entry) => same(entry, trimmed)))
    return `${group.name} already has ${trimmed}.`
  if (group && group.values.length >= MAX_OPTION_VALUES)
    return `An option can have up to ${MAX_OPTION_VALUES} values.`
  const added = Math.max(
    1,
    state.groups
      .filter((entry) => entry.id !== groupId)
      .reduce((total, entry) => total * entry.values.length, 1),
  )
  if (state.rows.length + (group ? added : 0) > MAX_VARIANTS)
    return `Keep it to ${MAX_VARIANTS} variants or fewer, or add the rest in Catalog.`
  return null
}

export function renameGroup(
  state: VariantsState,
  groupId: string,
  name: string,
): VariantsState {
  const group = state.groups.find((entry) => entry.id === groupId)
  if (!group) return state
  return {
    groups: state.groups.map((entry) =>
      entry.id === groupId ? { ...entry, name } : entry,
    ),
    rows: state.rows.map((row) => ({
      ...row,
      selections: row.selections.map((selection) =>
        same(selection.optionName, group.name)
          ? { ...selection, optionName: name }
          : selection,
      ),
    })),
  }
}

/** A new value adds a variant for each combination it makes. */
export function addValue(
  state: VariantsState,
  groupId: string,
  value: string,
): VariantsState {
  const trimmed = value.trim()
  const groups = state.groups.map((entry) =>
    entry.id === groupId
      ? { ...entry, values: [...entry.values, trimmed] }
      : entry,
  )
  const group = groups.find((entry) => entry.id === groupId)
  if (!group) return state
  const added = variantCombinations(groups)
    .filter((combination) =>
      combination.some(
        (entry) =>
          same(entry.optionName, group.name) && same(entry.value, trimmed),
      ),
    )
    .map(emptyRow)
  return { groups, rows: [...state.rows, ...added] }
}

/** Removing a value removes its variants; the last value removes the option. */
export function removeValue(
  state: VariantsState,
  groupId: string,
  value: string,
): VariantsState {
  const group = state.groups.find((entry) => entry.id === groupId)
  if (!group) return state
  if (group.values.length <= 1) return removeGroup(state, groupId)
  return {
    groups: state.groups.map((entry) =>
      entry.id === groupId
        ? { ...entry, values: entry.values.filter((item) => item !== value) }
        : entry,
    ),
    rows: state.rows.filter(
      (row) =>
        !row.selections.some(
          (entry) =>
            same(entry.optionName, group.name) && same(entry.value, value),
        ),
    ),
  }
}

/**
 * A new option starts with one value. Existing variants take that value, so
 * prices, stock and codes already typed stay with them. A single-price draft
 * becomes its first variant.
 */
export function addGroup(
  state: VariantsState,
  name: string,
  value: string,
  seed: { price: string; stock?: string; unitName: string },
): VariantsState {
  const group = {
    id: nextId("group"),
    name: name.trim(),
    values: [value.trim()],
  }
  const selection = { optionName: group.name, value: group.values[0] ?? "" }
  const rows = state.rows.length
    ? state.rows.map((row) => ({
        ...row,
        selections: [...row.selections, selection],
      }))
    : [
        {
          ...emptyRow([selection]),
          price: seed.price,
          stock: seed.stock ? { [seed.unitName]: seed.stock } : {},
        },
      ]
  return { groups: [...state.groups, group], rows }
}

/** Variants that differed only by this option merge into the first of them. */
export function removeGroup(
  state: VariantsState,
  groupId: string,
): VariantsState {
  const group = state.groups.find((entry) => entry.id === groupId)
  if (!group) return state
  const rows: VariantRow[] = []
  for (const row of state.rows) {
    const selections = row.selections.filter(
      (entry) => !same(entry.optionName, group.name),
    )
    if (!rows.some((kept) => sameSelections(kept.selections, selections)))
      rows.push({ ...row, selections })
  }
  return {
    groups: state.groups.filter((entry) => entry.id !== groupId),
    rows,
  }
}

export function addVariant(
  state: VariantsState,
  selections: Selection[],
): VariantsState {
  return { ...state, rows: [...state.rows, emptyRow(selections)] }
}

export function removeVariant(
  state: VariantsState,
  rowId: string,
): VariantsState {
  // A draft always keeps one variant; remove an option value instead.
  if (state.rows.length <= 1) return state
  return { ...state, rows: state.rows.filter((row) => row.id !== rowId) }
}

export function updateVariant(
  state: VariantsState,
  rowId: string,
  patch: Partial<VariantRow>,
): VariantsState {
  return {
    ...state,
    rows: state.rows.map((row) =>
      row.id === rowId ? { ...row, ...patch } : row,
    ),
  }
}

/** Main unit first, then each pack, as the Catalog lists them. */
export function variantUnits(draft: ProductDraft) {
  return [
    draft.canonicalUnitName,
    ...(draft.sellingUnits ?? []).map((pack) => pack.name),
  ]
}

/** The Catalog option editor's checks for one variant, plus pack counts. */
export function variantIssue(
  row: VariantRow,
  draft: ProductDraft,
  currencyCode: string,
): string | null {
  const packs = (draft.sellingUnits ?? []).map((pack) => pack.name)
  const catalogDraft: CatalogVariantDraft = {
    barcode: row.barcode,
    description: "",
    enabled: true,
    imageUrl: "",
    price: row.price,
    quantity: find(row.stock, draft.canonicalUnitName) ?? "",
    quoteRequired: false,
    sku: row.sku,
    storeIds: [],
    unitPrices: Object.fromEntries(
      packs.map((name) => [name, find(row.packPrices, name) ?? ""]),
    ),
  }
  const props: CatalogVariantManagerProps = {
    basePrice: "",
    canonicalTransactionScale: STOCK_SCALE,
    combinations: [],
    currencyCode,
    drafts: {},
    kind: "product",
    makeDefaultDraft: () => catalogDraft,
    onChangeDraft: () => {},
    stores: [],
    unitName: draft.canonicalUnitName,
    units: packs.map((name) => ({ id: name, name, price: "" })),
  }
  const issue = catalogVariantDraftIssue(catalogDraft, props)
  if (issue) return issue
  for (const name of packs) {
    const count = find(row.stock, name)?.trim()
    if (count && !isCatalogVariantQuantityReady(count, STOCK_SCALE))
      return `Enter a valid opening quantity for ${name}.`
  }
  return null
}

/** The first problem across options and variants, with the variant to open. */
export function variantsIssue(
  state: VariantsState,
  draft: ProductDraft,
  currencyCode: string,
): { message: string; rowId?: string } | null {
  for (const group of state.groups) {
    const nameIssue = optionNameIssue(state, group.name, group.id)
    if (nameIssue) return { message: nameIssue }
  }
  for (const row of state.rows) {
    const issue = variantIssue(row, draft, currencyCode)
    if (issue)
      return {
        message: `${variantLabel(row, draft.name)}: ${issue}`,
        rowId: row.id,
      }
  }
  for (const kind of ["sku", "barcode"] as const) {
    const seen = new Map<string, VariantRow>()
    for (const row of state.rows) {
      const code = row[kind].trim()
      if (!code) continue
      if (seen.has(code))
        return {
          message: `${variantLabel(row, draft.name)}: give each variant a different ${kind === "sku" ? "SKU" : "barcode"}.`,
          rowId: row.id,
        }
      seen.set(code, row)
    }
  }
  return null
}

/** The draft fields the editor owns, ready for the schema and the server. */
export function variantsPayload(
  state: VariantsState,
  draft: ProductDraft,
): Pick<
  ProductDraft,
  "options" | "variants" | "variantMode" | "priceMinor" | "openingStock"
> {
  const packs = (draft.sellingUnits ?? []).map((pack) => pack.name)
  const units = variantUnits(draft)
  return {
    options: state.groups.length
      ? state.groups.map((group) => ({
          name: group.name.trim(),
          values: group.values,
        }))
      : undefined,
    // Only the variants listed here are created, so removals stick.
    variantMode: state.groups.length ? "explicit" : undefined,
    priceMinor: undefined,
    openingStock: undefined,
    variants: state.rows.map((row) => {
      const counts = units.flatMap((unitName) => {
        const quantity = find(row.stock, unitName)?.trim()
        return quantity ? [{ unitName, quantity }] : []
      })
      // A count in a unit this product does not have yet stays as drafted;
      // the server asks for its size instead of dropping it.
      for (const [unitName, quantity] of Object.entries(row.stock))
        if (quantity.trim() && !units.some((unit) => same(unit, unitName)))
          counts.push({ unitName, quantity: quantity.trim() })
      const packCounted = counts.some(
        (count) => !same(count.unitName, draft.canonicalUnitName),
      )
      const sku = row.sku.trim()
      const barcode = row.barcode.trim()
      return {
        selections: row.selections,
        priceMinor: majorToMinor(row.price) ?? undefined,
        sellingUnitPrices: packs.flatMap((name) => {
          const priceMinor = majorToMinor(find(row.packPrices, name) ?? "")
          if (priceMinor === null) return []
          const derivedFromUnit = find(row.derived, name)
          return [
            {
              unitName: name,
              priceMinor,
              ...(derivedFromUnit ? { derivedFromUnit } : {}),
            },
          ]
        }),
        // Pack counts stay as typed; the server converts them to the main unit.
        ...(packCounted
          ? { stockByUnit: counts }
          : counts[0]
            ? { openingStock: counts[0].quantity }
            : {}),
        ...(sku ? { sku } : {}),
        ...(barcode ? { barcode } : {}),
      }
    }),
  }
}
