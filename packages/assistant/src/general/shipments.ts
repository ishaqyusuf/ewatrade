import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const currencyCode = z.string().regex(/^[A-Z]{3}$/)
// Exact decimals stay strings; the shipment command re-parses them at its own scale.
const decimal = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
const quantity = decimal.refine(
  (value) => Number(value) > 0,
  "Quantity must be positive.",
)

/** Intent only: Store, actor, rate date and command identity are server-owned. */
export const shipmentCreateAction = z
  .object({
    action: z.literal("shipment_create"),
    bookId: id,
    supplierId: id,
    name: z.string().trim().min(1).max(160),
    reference: z.string().trim().max(160).optional(),
    freightAmount: decimal,
    freightCurrencyCode: currencyCode,
    rates: z
      .array(z.object({ currencyCode, rate: decimal }).strict())
      .max(10),
    /** Set by the server when the draft is prepared; the date the rates were stated. */
    ratesAt: z.iso.datetime().optional(),
    lines: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(200),
            proposedName: z.string().trim().min(1).max(160).optional(),
            balanceSourceId: id.optional(),
            enteredInventoryUnitId: id.optional(),
            expectedQuantity: quantity,
            sourceCurrencyCode: currencyCode,
            sourceUnitPrice: decimal,
          })
          .strict()
          .refine(
            (line) =>
              Boolean(line.balanceSourceId) ===
              Boolean(line.enteredInventoryUnitId),
            "Choose both the stock item and its unit.",
          ),
      )
      .min(1)
      .max(10),
  })
  .strict()

export const shipmentReceiveAction = z
  .object({
    action: z.literal("shipment_receive"),
    bookId: id,
    shipmentId: id,
    /** Set by the server when the draft is prepared. */
    receivedAt: z.iso.datetime().optional(),
    lines: z
      .array(z.object({ lineId: id, quantity }).strict())
      .min(1)
      .max(10),
  })
  .strict()
  .refine(
    (value) => new Set(value.lines.map((l) => l.lineId)).size === value.lines.length,
    "Receive each line once per arrival.",
  )

export const shipmentCostAdjustAction = z
  .object({
    action: z.literal("shipment_cost_adjust"),
    bookId: id,
    shipmentId: id,
    lineId: id,
    amountMinor: z
      .string()
      .regex(/^-?\d{1,15}$/)
      .refine((value) => BigInt(value) !== BigInt(0), "Enter a non-zero cost."),
    reason: z.string().trim().min(1).max(400),
  })
  .strict()

export type ShipmentCreateAction = z.infer<typeof shipmentCreateAction>
export type ShipmentReceiveAction = z.infer<typeof shipmentReceiveAction>
export type ShipmentCostAdjustAction = z.infer<typeof shipmentCostAdjustAction>

export const shipmentDraftInstructions =
  " For incoming shipments, resolve the supplier and Book with readSuppliers, open shipments and their lines with readShipments, and goods already in stock with readInventoryBalances. Never ask for internal IDs or JSON. shipment_create needs every line's quantity, price and currency, the freight amount and currency, and a naira rate for each foreign currency the owner states; ask for any missing rate in one short question and never assume one. Map a line to an existing stock item when it clearly matches; otherwise name it as a new item, which is mapped in the app before it can be received. Confirming expects the shipment; nothing is added to stock until it arrives. shipment_receive records what arrived (1–10 lines, each at most what is still expected): stock goes up and one unpaid supplier bill is posted at landed cost; no payment is recorded. shipment_cost_adjust adds (or removes) a stated cost on one line's still-expected quantity with the owner's reason; received quantity and past sales keep their cost. Selling prices are changed separately with product_price_update. Do not execute or confirm from model text."
