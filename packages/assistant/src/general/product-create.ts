import {
  findCatalogIllustration,
  recommendCatalogIllustration,
} from "@ewatrade/utils/catalog-illustrations"
import { z } from "zod"
import {
  type SetupProductPayload,
  setupProductPayloadSchema,
} from "../setup/contracts"
import { setupProductQuestions, setupProductVariants } from "../setup/variants"

const setup = setupProductPayloadSchema.shape
const stock = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, "Enter a valid stock quantity.")

/**
 * A new product as the owner described it: packs (Crate = 30 Piece), options
 * (Size: Small, Big), a price per option and unit, and opening stock. Drafted
 * from the first message; anything missing is asked after the card shows.
 */
export const productCreateAction = z
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
  .superRefine((action, ctx) => {
    if (action.options?.length && action.openingStock !== undefined)
      ctx.addIssue({
        code: "custom",
        message: `Stock for ${action.name} is counted per option. Give stock for each option instead of one total.`,
      })
    for (const question of setupProductQuestions(productCreatePayload(action)))
      ctx.addIssue({ code: "custom", message: question.question })
  })
export type ProductCreateAction = z.infer<typeof productCreateAction>

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
  const rows = setupProductVariants(productCreatePayload(action))
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
  const rows = setupProductVariants(productCreatePayload(action)).map((row) => {
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
