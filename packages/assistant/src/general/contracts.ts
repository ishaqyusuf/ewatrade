import { productLineFulfillAction } from "./product-fulfillment"
import { serviceAuthorizeAction, serviceFulfillAction } from "./service-fulfillment"
import { orderCancelAction, orderMetadataAction, orderReplaceAction } from "./order-amendment"
export { orderCancelAction, orderMetadataAction, orderReplaceAction } from "./order-amendment"
import { closeoutCreateAction, closeoutFinalizeAction } from "./closeout"
import { stockTransferDispatchAction, stockTransferReceiveAction, stockTransferCancelAction } from "./stock-transfer"
import { z } from "zod"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { normalizeStockCategoryName } from "@ewatrade/utils/inventory-categories"
import {
  unitConfigurationDraftAction,
  unitConfigurationPublishAction,
} from "./unit-configuration"
import { stockAdjustmentAction, stockCorrectionAction } from "./stock-adjustment"
const id = z.string().trim().min(1).max(128)
const name = z.string().trim().min(1).max(160)
const money = z.number().int().min(0).max(100_000_000)
const quantity = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
  .refine((v) => Number(v) > 0, "Quantity must be positive")
export const generalActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("customer_create"),
      name,
      phone: z.string().trim().max(40).optional(),
      email: z.string().email().max(254).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("product_create"),
      name,
      canonicalUnitName: z.string().trim().min(1).max(80),
      priceMinor: money,
    })
    .strict(),
  z
    .object({
      action: z.literal("order_create"),
      initialPayment: z
        .object({
          amountMinor: money.refine(
            (value) => value > 0,
            "Payment must be positive",
          ),
          method: z.enum(["bank_transfer", "card", "cash", "other", "pos"]),
          note: z.string().trim().max(500).optional(),
        })
        .strict()
        .optional(),
      customerId: id.optional(),
      notes: z.string().trim().max(2000).optional(),
      lines: z
        .array(
          z
            .object({
              offeringId: id,
              quantity,
              expectedConfigurationVersionId: id.optional(),
              expectedFixedPriceMinor: money.optional(),
              enteredTotalMinor: money.refine((value) => value > 0).optional(),
            })
            .strict()
            .refine(
              (line) =>
                (line.expectedFixedPriceMinor !== undefined) !==
                (line.enteredTotalMinor !== undefined),
              "Choose a fixed price snapshot or an explicit item total.",
            ),
        )
        .min(1)
        .max(30),
    })
    .strict(),
  z
    .object({
      action: z.literal("payment_record"),
      orderId: id,
      amountMinor: money.refine((v) => v > 0),
      method: z.enum(["bank_transfer", "card", "cash", "other", "pos"]),
      note: z.string().trim().max(500).optional(),
    })
    .strict(),
  // Omitted fields stay unchanged; null clears phone or email.
  z
    .object({
      action: z.literal("customer_update"),
      customerId: id,
      name: name.optional(),
      phone: z.string().trim().min(3).max(40).nullable().optional(),
      email: z.string().email().max(254).nullable().optional(),
    })
    .strict()
    .refine(
      (input) =>
        input.name !== undefined ||
        input.phone !== undefined ||
        input.email !== undefined,
      "Change at least one detail.",
    ),
  z
    .object({
      action: z.literal("product_price_update"),
      offeringId: id,
      priceMinor: money,
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("product_details_update"),
      catalogItemId: id,
      name: name.optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      category: z.string().trim().max(120).nullable().optional(),
    })
    .strict()
    .refine(
      (v) =>
        v.name !== undefined ||
        v.description !== undefined ||
        v.category !== undefined,
      "Change at least one detail.",
    ),
  z
    .object({
      action: z.literal("product_identifiers_update"),
      offeringId: id,
      sku: z.string().trim().max(120).nullable().optional(),
      barcode: z.string().trim().max(120).nullable().optional(),
    })
    .strict()
    .refine(
      (v) => v.sku !== undefined || v.barcode !== undefined,
      "Change at least one identifier.",
    ),
  z
    .object({
      action: z.literal("product_availability_update"),
      offeringId: id,
      isAvailable: z.boolean(),
    })
    .strict(),
  unitConfigurationDraftAction,
  unitConfigurationPublishAction,
  z
    .object({
      action: z.literal("stock_receive"),
      balanceSourceId: id,
      enteredInventoryUnitId: id,
      enteredQuantity: quantity,
      reason: z.string().trim().min(1).max(500),
      source: z.string().trim().min(1).max(80),
      supplierName: name.optional(),
      categories: z
        .array(
          z
            .object({
              name: z
                .string()
                .max(160)
                .refine((value) => {
                  try {
                    normalizeStockCategoryName(value)
                    return true
                  } catch {
                    return false
                  }
                }, "Use 1–80 visible characters for a category."),
            })
            .strict(),
        )
        .min(1)
        .max(10)
        .optional(),
      effectiveAt: z.string().datetime().optional(),
      unitCostMinor: money.optional(),
    })
    .strict()
    .refine(
      (value) =>
        value.reason.length +
          (value.supplierName ? value.supplierName.length + 11 : 0) <=
        500,
      "Keep the reason and supplier name within 500 characters.",
    ),
  z
    .object({
      action: z.literal("stock_count_create"),
      reason: z.string().trim().min(1).max(500),
      lines: z
        .array(
          z
            .object({
              balanceSourceId: id,
              entries: z
                .array(
                  z
                    .object({
                      enteredInventoryUnitId: id,
                      enteredQuantity: z
                        .string()
                        .regex(/^\d{1,12}(\.\d{1,6})?$/),
                    })
                    .strict(),
                )
                .min(1)
                .max(48),
            })
            .strict(),
        )
        .min(1)
        .max(500),
    })
    .strict()
    .refine(
      (value) =>
        new Set(value.lines.map((line) => line.balanceSourceId)).size ===
        value.lines.length,
      "Choose each counted stock source once.",
    ),
  z
    .object({
      action: z.literal("stock_count_finalize"),
      stockCountId: id,
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  stockAdjustmentAction,
  stockCorrectionAction,
  stockTransferDispatchAction,
  stockTransferReceiveAction,
  stockTransferCancelAction,
  productLineFulfillAction,
  serviceAuthorizeAction,
  serviceFulfillAction,
  orderCancelAction,
  orderMetadataAction,
  orderReplaceAction,
  closeoutCreateAction,
  closeoutFinalizeAction,
])
export const generalOrderActionSchema = generalActionSchema.options[2]
export type GeneralAction = z.infer<typeof generalActionSchema>
export type GeneralActionName = GeneralAction["action"]
export const generalReceiptSchema = z
  .object({
    kind: z.enum([
      "customer",
      "product",
      "order",
      "payment",
      "inventory",
      "stock_count",
      "stock_transfer",
      "inventory_closeout",
    ]),
    recordId: id,
    orderId: id.optional(),
    catalogItemId: id.optional(),
    title: z.string(),
    detail: z.string(),
  })
  .strict()
export type GeneralReceipt = z.infer<typeof generalReceiptSchema>
export const generalProposalSchema = z
  .object({
    id,
    revision: z.number().int().positive(),
    payload: generalActionSchema,
    status: z.enum([
      "PENDING",
      "EXECUTING",
      "COMPLETED",
      "CANCELLED",
      "EXPIRED",
      "FAILED",
    ]),
    expiresAt: z.string().datetime(),
    receipt: generalReceiptSchema.nullable(),
    review: z.array(z.string()).optional(),
    approvalToken: z.string().optional(),
  })
  .strict()
export type GeneralProposal = z.infer<typeof generalProposalSchema>
export const generalAnswerSchema = z
  .object({
    id,
    title: z.string().max(160),
    value: z.string().max(160),
    scope: z.string().max(500),
    asOf: z.string().datetime(),
    detail: z.string().max(1000),
  })
  .strict()
export type GeneralAnswer = z.infer<typeof generalAnswerSchema>
export const generalStoredPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(16000) }).strict(),
  z
    .object({
      type: z.literal("data-general-answer"),
      data: generalAnswerSchema,
    })
    .strict(),
])
export type GeneralDataParts = {
  "general-answer": GeneralAnswer
  "general-run": { runId: string; remainingRequests: number }
  "general-proposal": { proposalId: string }
}
/** Money in assistant answers and reviews ("₦4,500.00"), exact for large values. */
export function generalMoney(
  minor: number | bigint | string,
  currencyCode: string,
) {
  const value = String(typeof minor === "number" ? Math.round(minor) : minor)
  try {
    return formatFinanceMoney(value, currencyCode || "NGN")
  } catch {
    const amount = BigInt(value)
    const absolute = amount < 0n ? -amount : amount
    return `${currencyCode} ${amount < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`
  }
}
/** A readable period for answer cards: "Sat 10 Oct" or "Mon 5 – Thu 8 Oct".
 * The end is exclusive, so a whole-day range shows its last included day. */
export function generalDateRange(after?: string, before?: string) {
  const parse = (value?: string) => {
    const date = value ? new Date(value) : null
    return date && !Number.isNaN(date.getTime()) ? date : null
  }
  const start = parse(after)
  const endExclusive = parse(before)
  const midnight = (date: Date | null) =>
    !date || date.toISOString().endsWith("T00:00:00.000Z")
  const timed = !midnight(start) || !midnight(endExclusive)
  const end =
    endExclusive && !timed ? new Date(endExclusive.getTime() - 1) : endExclusive
  const show = (date: Date, month = true) =>
    date
      .toLocaleString("en-GB", {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
        ...(month ? { month: "short" } : {}),
        ...(timed ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
      })
      .replace(",", "")
      .replace(" at ", " ")
  if (start && end) {
    const sameDay =
      start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)
    if (!timed && sameDay) return show(start)
    const sameMonth =
      start.getUTCFullYear() === end.getUTCFullYear() &&
      start.getUTCMonth() === end.getUTCMonth()
    return `${show(start, timed || !sameMonth)} – ${show(end)}`
  }
  if (start) return `From ${show(start)}`
  if (end) return `Until ${show(end)}`
  return "All dates"
}
export function generalActionSummary(
  action: GeneralAction,
  currencyCode: string,
) {
  const amount = (minor: number) => generalMoney(minor, currencyCode)
  switch (action.action) {
    case "product_line_fulfill": return `Fulfil reserved product line · ${action.reason}`
    case "service_line_authorize": return `Authorize service line · ${action.reason}`
    case "service_line_fulfill": return `Record service performance · ${action.reason}`
    case "order_cancel": return `Cancel order ${action.orderId} · ${action.reason}`
    case "order_metadata_update": return `Update order details · ${action.reason}`
    case "order_replace": return `Replace order with ${action.changes.length} line change(s) · ${action.reason}`
    case "stock_transfer_dispatch":
      return `Dispatch ${action.quantity} to Store ${action.targetStoreId} · ${action.reason}`
    case "stock_transfer_receive":
      return `Receive ${action.quantity} from transfer ${action.transferId} · ${action.reason}`
    case "stock_transfer_cancel":
      return `Return remaining transfer stock · ${action.reason}`
    case "stock_adjust":
      return `${action.purpose === "waste" ? "Record waste" : "Adjust stock"} · ${action.direction} ${action.enteredQuantity} · ${action.reason}`
    case "stock_correct":
      return `Correct stock operation ${action.targetOperationId} · ${action.reason}`
    case "inventory_closeout_create":
      return `Save ${action.declarations.length} custody declaration(s)`
    case "inventory_closeout_finalize":
      return `Finalize custody closeout ${action.closeoutId}`
    case "stock_count_create":
      return `Create count for ${action.lines.length} stock source(s)`
    case "stock_count_finalize":
      return `Finalize stock count ${action.stockCountId}`
    case "stock_receive":
      return `Receive ${action.enteredQuantity} · balance ${action.balanceSourceId} · ${action.reason}`
    case "product_unit_configuration_draft":
      return `Product ${action.catalogItemId} · save a unit draft · ${action.units.length} units · publication requires separate review`
    case "product_unit_configuration_publish":
      return `Product ${action.catalogItemId} · publish the reviewed unit draft · no retroactive stock conversion`
    case "product_availability_update":
      return `Offering ${action.offeringId} · ${action.isAvailable ? "Available" : "Unavailable"} in the current Store`
    case "product_details_update":
      return `Product ${action.catalogItemId} · details update · past orders unchanged`
    case "product_identifiers_update":
      return `Offering ${action.offeringId} · identifiers update · other units unchanged`
    case "product_price_update":
      return `Offering ${action.offeringId}\nNew price: ${amount(action.priceMinor)}\nReason: ${action.reason}\nApplies wherever this offering is sold. Past orders keep their saved prices.`
    case "customer_create":
      return [action.name, action.phone, action.email]
        .filter(Boolean)
        .join(" · ")
    case "product_create":
      return `${action.name} · ${action.canonicalUnitName} · ${amount(action.priceMinor)} per unit`
    case "order_create":
      return `${action.lines.length} line${action.lines.length === 1 ? "" : "s"} on the order\n${action.customerId ? "Saved customer" : "Walk-in customer"}${action.notes ? `\n${action.notes}` : ""}${action.initialPayment ? `\nRecord received: ${amount(action.initialPayment.amountMinor)} · ${action.initialPayment.method.replaceAll("_", " ")}` : "\nNo initial payment"}`
    case "customer_update":
      return [
        `Customer ${action.customerId}`,
        action.name !== undefined ? `Name: ${action.name}` : null,
        action.phone !== undefined
          ? `Phone: ${action.phone ?? "removed"}`
          : null,
        action.email !== undefined
          ? `Email: ${action.email ?? "removed"}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    case "payment_record":
      return `${amount(action.amountMinor)} · ${action.method.replaceAll("_", " ")} · order ${action.orderId}${action.note ? `\n${action.note}` : ""}`
  }
}
