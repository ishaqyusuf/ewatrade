import {
  findCatalogIllustration,
  recommendCatalogIllustration,
} from "@ewatrade/utils/catalog-illustrations"
import { z } from "zod"
import { productCategoryLabel } from "../product/knowledge"
import {
  prepareProductPayload,
  productPreparationNotes,
} from "../product/preparation"
import {
  type SetupProductPayload,
  setupProductPayloadSchema,
} from "../setup/contracts"
import {
  setupNameEqual,
  setupProductQuestions,
  setupProductVariants,
  setupSelectionsEqual,
} from "../setup/variants"

const setup = setupProductPayloadSchema.shape
const stock = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, "Enter a valid stock quantity.")

/**
 * A new product as the owner described it: packs (Crate = 30 Piece), options
 * (Size: Small, Big), a price per option and unit, and opening stock. Drafted
 * as soon as named; unresolved save requirements remain editable.
 */
const productCreateFields = z
  .object({
    action: z.literal("product_create"),
    name: setup.name,
    description: setup.description,
    categoryKey: setup.categoryKey,
    categoryLabel: setup.categoryLabel,
    categorySuggested: setup.categorySuggested,
    categorySuggestionName: setup.categorySuggestionName,
    reviewRequirements: setup.reviewRequirements,
    preparationVersion: setup.preparationVersion,
    variantMode: setup.variantMode,
    canonicalUnitName: z.string().trim().min(1).max(80),
    priceMinor: setup.priceMinor,
    openingStock: stock.optional(),
    sellingUnits: setup.sellingUnits,
    options: setup.options,
    variants: setup.variants,
    /** Library picture; null when the owner removed it. A photo replaces it. */
    illustrationId: setup.illustrationId,
    /** A Catalog photo the owner uploaded on this draft's card. */
    photoAssetId: z.string().trim().min(1).max(128).optional(),
  })
  .strict()

export type ProductCreateAction = z.infer<typeof productCreateFields>
export const productCreateAction = productCreateFields

/** Save requirements are separate from the shape of an editable draft. */
export function productCreateIssues(action: ProductCreateAction): string[] {
  const issues = setupProductQuestions(productCreatePayload(action)).map(
    (question) => question.question,
  )
  if (action.options?.length && action.openingStock !== undefined)
    issues.push(
      `Stock for ${action.name} is counted per option. Give stock for each option instead of one total.`,
    )
  if (
    action.categoryKey &&
    !productCategoryLabel(action.categoryKey, action.categoryLabel)
  )
    issues.push("Choose a valid product category and subcategory.")
  for (const row of productCreateVariants(action))
    for (const unit of row.sellingUnits)
      if (unit.priceMinor === undefined)
        issues.push(
          `Enter the selling price for ${row.label} per ${unit.name}.`,
        )
  return [...new Set(issues)]
}

export function productCreatePayload(
  action: ProductCreateAction,
): SetupProductPayload {
  return {
    kind: "product",
    name: action.name,
    description: action.description,
    categoryKey: action.categoryKey,
    categoryLabel: action.categoryLabel,
    categorySuggested: action.categorySuggested,
    categorySuggestionName: action.categorySuggestionName,
    reviewRequirements: action.reviewRequirements,
    preparationVersion: action.preparationVersion,
    variantMode: action.variantMode,
    unitName: action.canonicalUnitName,
    priceMinor: action.priceMinor,
    openingStock: action.openingStock,
    sellingUnits: action.sellingUnits,
    options: action.options,
    variants: action.variants,
    // Catalog keeps a photo or an illustration, never both.
    illustrationId: action.photoAssetId ? undefined : action.illustrationId,
  }
}

/** Read the explicit prices and disclosed suggestions stored in this draft. */
export function productCreateVariants(
  action: ProductCreateAction,
): ReturnType<typeof setupProductVariants> {
  return setupProductVariants(productCreatePayload(action)).map((row) => {
    const variant = action.variants?.find((candidate) =>
      setupSelectionsEqual(candidate.selections, row.selections),
    )
    return {
      ...row,
      sellingUnits: row.sellingUnits.map((pack) => ({
        ...pack,
        priceMinor:
          variant?.sellingUnitPrices?.find((price) =>
            setupNameEqual(price.unitName, pack.name),
          )?.priceMinor ??
          action.sellingUnits?.find((unit) =>
            setupNameEqual(unit.name, pack.name),
          )?.priceMinor,
      })),
    }
  })
}

/** Only name, unit, price and stock: the original single-offering create. */
export function isSimpleProductCreate(action: ProductCreateAction) {
  return (
    !action.sellingUnits?.length &&
    !action.options?.length &&
    !action.variants?.length
  )
}

/**
 * Writes every derived value into the draft so the card shows exactly what
 * will be saved: a matching library illustration unless there is a photo or
 * the owner removed it, one row per option combination with its unit and
 * pack prices, and stock counted in the main unit.
 */
export function productCreateDraft(
  input: ProductCreateAction,
  currencyCode = "",
): ProductCreateAction {
  const prepared = prepareProductPayload(
    productCreatePayload(input),
    currencyCode,
  )
  const action = {
    ...input,
    categoryKey: prepared.categoryKey,
    categoryLabel: prepared.categoryLabel,
    categorySuggested: prepared.categorySuggested,
    categorySuggestionName: prepared.categorySuggestionName,
    reviewRequirements: prepared.reviewRequirements,
    preparationVersion: prepared.preparationVersion,
    variantMode: prepared.variantMode,
    openingStock: prepared.openingStock,
    sellingUnits: prepared.sellingUnits,
    variants: prepared.variants,
  }
  const picture: Partial<ProductCreateAction> = action.photoAssetId
    ? { illustrationId: undefined }
    : action.illustrationId === undefined
      ? {
          illustrationId: recommendCatalogIllustration({
            name: action.name,
            kind: "product",
          })?.id,
        }
      : {}
  return { ...action, ...picture }
}

/** "Photo added" or "Picture: Egg tray"; null when there is neither. */
export function productCreatePicture(action: ProductCreateAction) {
  if (action.photoAssetId) return "Photo added"
  const illustration = findCatalogIllustration(action.illustrationId)
  return illustration ? `Picture: ${illustration.label}` : null
}

/** Card lines: the product, one line per option with prices and stock, then its picture. */
export function productCreateSummary(
  action: ProductCreateAction,
  money: (minor: number) => string,
) {
  const unit = action.canonicalUnitName
  const picture = productCreatePicture(action)
  const stockText = (quantity: string | undefined) =>
    quantity === undefined
      ? "opening stock not supplied"
      : `stock ${quantity} ${unit}`
  if (isSimpleProductCreate(action))
    return [
      `${action.name} · ${action.priceMinor === undefined ? "price needed" : `${money(action.priceMinor)} per ${unit}`}`,
      action.openingStock === undefined ? null : stockText(action.openingStock),
      picture,
      ...productPreparationNotes(productCreatePayload(action)),
    ]
      .filter(Boolean)
      .join("\n")
  const packs = (action.sellingUnits ?? [])
    .map((pack) => `${pack.name} = ${pack.containsQuantity} ${unit}`)
    .join(" · ")
  const rows = productCreateVariants(action).map((row) => {
    const prices = [
      row.priceMinor === undefined
        ? `${unit} price needed`
        : `${money(row.priceMinor)} per ${unit}`,
      ...row.sellingUnits.map((pack) =>
        pack.priceMinor === undefined
          ? `${pack.name} price needed`
          : `${money(pack.priceMinor)} per ${pack.name}`,
      ),
    ]
    const label = action.options?.length ? `${row.label}: ` : ""
    return `${label}${prices.join(" · ")} · ${stockText(row.openingStock)}`
  })
  return [
    `${action.name} · counted in ${unit}${packs ? ` · ${packs}` : ""}`,
    ...rows,
    ...(picture ? [picture] : []),
    ...productPreparationNotes(productCreatePayload(action)),
  ].join("\n")
}
