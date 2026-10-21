import {
  findCatalogIllustration,
  recommendCatalogIllustration,
} from "@ewatrade/utils/catalog-illustrations"
import { isExactDecimal } from "@ewatrade/utils/exact-decimal"
import { z } from "zod"
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
 * once selling prices and pack conversions are known; missing facts are asked first.
 */
const productCreateFields = z
  .object({
    action: z.literal("product_create"),
    name: setup.name,
    description: setup.description,
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
export const productCreateAction = productCreateFields.superRefine(
  (action, ctx) => {
    if (action.options?.length && action.openingStock !== undefined)
      ctx.addIssue({
        code: "custom",
        message: `Stock for ${action.name} is counted per option. Give stock for each option instead of one total.`,
      })
    for (const [index, pack] of (action.sellingUnits ?? []).entries()) {
      if (
        !isExactDecimal(pack.containsQuantity, {
          allowZero: false,
          maxScale: 6,
        })
      )
        ctx.addIssue({
          code: "custom",
          path: ["sellingUnits", index, "containsQuantity"],
          message: `How many ${action.canonicalUnitName.toLowerCase()} are in one ${pack.name.toLowerCase()} of ${action.name}?`,
        })
    }
    for (const question of setupProductQuestions(productCreatePayload(action)))
      ctx.addIssue({ code: "custom", message: question.question })
    for (const row of productCreateVariants(action)) {
      const missing = row.sellingUnits.filter(
        (pack) => pack.priceMinor === undefined,
      )
      if (missing.length)
        ctx.addIssue({
          code: "custom",
          message: `What is your selling price for ${row.label} per ${missing.map((pack) => pack.name.toLowerCase()).join(" and ")}? Do not derive an unstated pack price.`,
        })
    }
  },
)

export function productCreatePayload(
  action: ProductCreateAction,
): SetupProductPayload {
  return {
    kind: "product",
    name: action.name,
    description: action.description,
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

/** General drafts use stated pack prices; Setup's optional price derivation stays separate. */
function productCreateVariants(
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
  action: ProductCreateAction,
): ProductCreateAction {
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
  if (isSimpleProductCreate(action)) return { ...action, ...picture }
  const rows = productCreateVariants(action)
  const shared = !action.options?.length
  return {
    ...action,
    ...picture,
    openingStock: undefined,
    variants: rows.map((row) => ({
      selections: row.selections,
      priceMinor: row.priceMinor,
      sellingUnitPrices: row.sellingUnits.flatMap((unit) =>
        unit.priceMinor === undefined
          ? []
          : [{ unitName: unit.name, priceMinor: unit.priceMinor }],
      ),
      openingStock:
        row.openingStock ?? (shared ? action.openingStock : undefined),
    })),
  }
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
    quantity === undefined ? "no opening stock" : `stock ${quantity} ${unit}`
  if (isSimpleProductCreate(action))
    return [
      `${action.name} · ${action.priceMinor === undefined ? "price needed" : `${money(action.priceMinor)} per ${unit}`}`,
      action.openingStock === undefined ? null : stockText(action.openingStock),
      picture,
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
  ].join("\n")
}
