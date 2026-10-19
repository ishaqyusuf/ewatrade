import type {
  AdvancedOptionGroup,
  AdvancedUnitDraft,
  AdvancedVariantDraft,
} from "@/components/catalog-item/catalog-form-types"
import { catalogChoiceDraftIdentity } from "@/lib/catalog-choice-drafts"
import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import {
  buildCatalogVariantCombinations,
  catalogUnitFactorToRelation,
} from "@ewatrade/utils"
import { minorToMajorInput } from "@ewatrade/utils/currency"

export type SavedCatalogItem = NonNullable<RouterOutputs["catalog"]["getItem"]>
type SavedVariant = SavedCatalogItem["variants"][number]
type SavedOffering = SavedVariant["offerings"][number]
export type CatalogUpdateInput = RouterInputs["catalog"]["updateItem"]

type AuthorizationPolicy =
  | "after_required_payment"
  | "manual_release"
  | "on_order_confirmation"

/** The form state the catalog sheet holds, rebuilt from a saved item. */
export type CatalogEditFormState = {
  kind: "product" | "service"
  name: string
  description: string
  unitName: string
  price: string
  usage: "FOR_SALE" | "INTERNAL_USE" | "BOTH"
  category: string
  sku: string
  barcode: string
  showAdvanced: boolean
  canonicalTransactionScale: number
  optionGroups: AdvancedOptionGroup[]
  variantDrafts: Record<string, AdvancedVariantDraft>
  additionalUnits: AdvancedUnitDraft[]
  quoteRequired: boolean
  trackServiceWork: boolean
  serviceAuthorization: AuthorizationPolicy
  serviceGuidance: string
  serviceQuantityScale: number
  /** On-hand stock in the main unit across this item's balances. */
  onHandQuantity: string
}

const live = <T extends { status: string }>(rows: T[]) =>
  rows.filter((row) => row.status !== "archived")

function priceText(offering: SavedOffering | undefined) {
  return offering?.fixedPriceMinor === null || offering === undefined
    ? ""
    : minorToMajorInput(offering.fixedPriceMinor)
}

function authorization(value: string | undefined): AuthorizationPolicy {
  if (value === "AFTER_REQUIRED_PAYMENT") return "after_required_payment"
  if (value === "MANUAL_RELEASE") return "manual_release"
  return "on_order_confirmation"
}

/** Keys mirror the form's own normalization so combinations line up. */
function normalizedGroups(groups: AdvancedOptionGroup[]) {
  return groups.map((group, groupIndex) => ({
    id: group.id,
    key: `group-${groupIndex + 1}`,
    name: group.name.trim(),
    values: group.values
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((label, valueIndex) => ({ key: `value-${valueIndex + 1}`, label })),
  }))
}

export function savedItemToFormState(
  item: SavedCatalogItem,
): CatalogEditFormState {
  const units = item.product?.currentUnitConfiguration?.units ?? []
  const canonical = units.find(
    (unit) => unit.stockBehavior === "canonical_shared",
  )
  const extraUnits = units.filter((unit) => unit !== canonical)
  const variants = live(item.variants)
  const defaultVariant =
    variants.find((variant) => variant.isDefault) ?? variants[0]
  const offeringFor = (variant: SavedVariant | undefined, unitId?: string) =>
    live(variant?.offerings ?? []).find((offering) =>
      unitId ? offering.productUnit?.inventoryUnitId === unitId : true,
    )
  const mainOffering = (variant: SavedVariant | undefined) =>
    offeringFor(variant, canonical?.id)
  const defaultOffering = mainOffering(defaultVariant)

  const optionGroups: AdvancedOptionGroup[] = item.optionGroups.map(
    (group) => ({
      id: group.id,
      name: group.name,
      values: group.values.map((value) => value.label).join(", "),
    }),
  )
  const additionalUnits: AdvancedUnitDraft[] = extraUnits.map((unit) => {
    const relation = catalogUnitFactorToRelation(
      unit.factor,
      "canonical_per_unit",
    )
    return {
      id: unit.id,
      name: unit.name,
      price: priceText(offeringFor(defaultVariant, unit.id)),
      referenceId: "canonical",
      relationCount: relation.count,
      relationDirection: relation.direction,
      stockBehavior:
        unit.stockBehavior === "packaged_stock"
          ? "packaged_stock"
          : "alternate_transaction",
      transactionScale: unit.transactionScale,
    }
  })

  const labelById = new Map(
    item.optionGroups.flatMap((group) =>
      group.values.map((value) => [value.id, value.label.trim().toLowerCase()]),
    ),
  )
  const draftFor = (
    variant: SavedVariant | undefined,
  ): AdvancedVariantDraft => {
    const offering = mainOffering(variant)
    return {
      barcode: offering?.productUnit?.barcode ?? "",
      enabled: variant?.status === "active",
      orderTotal: offering?.pricingPolicy === "order_total",
      price: priceText(offering),
      quantity: "",
      quoteRequired: offering?.pricingPolicy === "quote_required",
      sku: offering?.productUnit?.sku ?? "",
      storeIds: (offering?.stores ?? [])
        .filter((store) => store.isAvailable)
        .map((store) => store.storeId),
      unitPrices: Object.fromEntries(
        extraUnits.map((unit) => [
          unit.id,
          priceText(offeringFor(variant, unit.id)),
        ]),
      ),
    }
  }
  const variantDrafts: Record<string, AdvancedVariantDraft> = {}
  if (optionGroups.length) {
    const groups = normalizedGroups(optionGroups)
    for (const combination of buildCatalogVariantCombinations(groups)) {
      const labels = combination.name
        .split(" / ")
        .map((label) => label.trim().toLowerCase())
        .sort()
        .join("|")
      const saved = variants.find(
        (variant) =>
          variant.selections
            .map((selection) => labelById.get(selection.valueId) ?? "")
            .sort()
            .join("|") === labels,
      )
      // The form keys drafts by choice identity, not the positional combination key.
      variantDrafts[
        catalogChoiceDraftIdentity(combination.selections, groups)
      ] = saved ? draftFor(saved) : { ...draftFor(undefined), enabled: false }
    }
  } else variantDrafts.default = draftFor(defaultVariant)

  const service =
    defaultOffering?.serviceWorkPolicy ??
    offeringFor(defaultVariant)?.serviceWorkPolicy
  const onHand = (item.product?.stockBalances ?? []).reduce(
    (total, balance) => total + Number(balance.onHandQuantity),
    0,
  )
  const serviceOffering =
    item.kind === "service" ? offeringFor(defaultVariant) : undefined
  return {
    kind: item.kind,
    name: item.name,
    description: item.description ?? "",
    unitName: canonical?.name ?? "",
    price: priceText(
      item.kind === "product" ? defaultOffering : serviceOffering,
    ),
    usage: item.product?.usage ?? "FOR_SALE",
    category: item.category ?? "",
    sku: defaultOffering?.productUnit?.sku ?? "",
    barcode: defaultOffering?.productUnit?.barcode ?? "",
    showAdvanced: optionGroups.length > 0,
    canonicalTransactionScale: canonical?.transactionScale ?? 2,
    optionGroups,
    variantDrafts,
    additionalUnits,
    quoteRequired: serviceOffering?.pricingPolicy === "quote_required",
    trackServiceWork: service?.workPolicy === "TRACKED",
    serviceAuthorization: authorization(service?.authorizationPolicy),
    serviceGuidance: service?.guidance ?? "",
    serviceQuantityScale: service?.quantityScale ?? 0,
    onHandQuantity: String(onHand),
  }
}

/** The ids the update API needs to recognise saved option groups and units. */
export function savedCatalogIds(item: SavedCatalogItem) {
  const units = item.product?.currentUnitConfiguration?.units ?? []
  return {
    canonicalUnitId: units.find(
      (unit) => unit.stockBehavior === "canonical_shared",
    )?.id,
    groupIds: new Set(item.optionGroups.map((group) => group.id)),
    unitIds: new Set(units.map((unit) => unit.id)),
  }
}
