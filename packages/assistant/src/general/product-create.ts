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
 * will be saved: one row per option combination with its unit and pack
 * prices, and stock counted in the main unit.
 */
export function productCreateDraft(
  action: ProductCreateAction,
): ProductCreateAction {
  if (isSimpleProductCreate(action)) return action
  const rows = setupProductVariants(productCreatePayload(action))
  const shared = !action.options?.length
  return {
    ...action,
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

/** Card lines: the product, then one line per option with prices and stock. */
export function productCreateSummary(
  action: ProductCreateAction,
  money: (minor: number) => string,
) {
  const unit = action.canonicalUnitName
  const stockText = (quantity: string | undefined) =>
    quantity === undefined ? "no opening stock" : `stock ${quantity} ${unit}`
  if (isSimpleProductCreate(action))
    return [
      `${action.name} · ${action.priceMinor === undefined ? "price needed" : `${money(action.priceMinor)} per ${unit}`}`,
      action.openingStock === undefined ? null : stockText(action.openingStock),
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
  ].join("\n")
}
