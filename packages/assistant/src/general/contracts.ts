import { serviceWorkEditorActionSchema } from "./service-work-editor"
import { serviceWorkLifecycleReceipt } from "./service-work"
import { serviceWorkCompletionReceipt } from "./service-work-completion"
import { quoteDecisionAction, quoteDecisionReceipt } from "./quote-decision"
import { serviceWorkRecordReceipt } from "./service-work-records"
export {
  serviceWorkEditorActionSchema,
  serviceWorkEditorInput,
  serviceWorkEditorContextSchema,
} from "./service-work-editor"
export type {
  ServiceWorkEditorAction,
  ServiceWorkEditorContext,
} from "./service-work-editor"
export { serviceWorkLifecycleDraftInstructions } from "./service-work"
export { serviceWorkRecordDraftInstructions } from "./service-work-records"
export { serviceWorkCompletionDraftInstructions } from "./service-work-completion"
import { serviceIntakeAction } from "./service-intake"
import { staffStatusAction } from "./staff-status"
import { staffAccessAction } from "./staff-access"
export {
  staffAccessAction,
  staffAccessDraftInstructions,
  staffAccessReviewInput,
  staffAccessReadInput,
  staffAccessTargetSchema,
} from "./staff-access"
export type { GeneralStaffAccessAction } from "./staff-access"
export {
  staffStatusAction,
  staffStatusDraftInstructions,
  staffStatusReviewInput,
  staffStatusReadInput,
  staffStatusTargetSchema,
} from "./staff-status"
export type { GeneralStaffStatusAction } from "./staff-status"
export { serviceIntakeDraftInstructions } from "./service-intake"
import { cashCountAction } from "./cash-count"
export {
  cashCountAction,
  cashCountDraftInstructions,
  generalCashCountLookupInput,
  generalCashCountReadInput,
  generalCashCountHistoryInput,
  generalDayCloseInput,
} from "./cash-count"
export type { GeneralCashCountAction } from "./cash-count"
export {
  cashCountTargetSchema,
  dayCloseTargetSchema,
} from "./cash-count-target"
export type { CashCountTarget, DayCloseTarget } from "./cash-count-target"
import { generalAnswerTargetSchema } from "./answer-target"
import { staffInvitationAction } from "./staff-invitation"
export { staffInvitationDraftInstructions } from "./staff-invitation"
export {
  generalAnswerTargetSchema,
  staffMemberTargetSchema,
  staffInvitationTargetSchema,
} from "./answer-target"
export { staffDirectoryTargetSchema } from "./staff-directory-target"
export { staffHistoryTargetSchema } from "./staff-history-target"
import { purchasePaymentReverseAction } from "./purchase-payment-reversal"
import { purchaseRecognitionReverseAction } from "./purchase-recognition-reversal"
import { purchaseRecordAction } from "./purchase-recording"
import { supplierAllocationReleaseAction } from "./supplier-allocation-release"
import { supplierEntryReverseAction } from "./supplier-entry-reversal"
import { supplierOpeningAction } from "./supplier-opening"
import {
  purchasePaymentAction,
  supplierAdvanceAction,
  supplierAdvanceAllocateAction,
} from "./supplier-settlement"
export { supplierSettlementDraftInstructions } from "./supplier-settlement"
import { purchaseRecognitionAction } from "./purchase-recognition"
export { purchaseRecognitionDraftInstructions } from "./purchase-recognition"
import { billPaymentReverseAction, expenseVoidAction } from "./bill-correction"
import { billPaymentAction } from "./bill-payment"
import {
  customerAllocationReleaseAction,
  customerCreditApplyAction,
} from "./customer-credit"
import { customerReceiptAction } from "./customer-receipt"
import { expenseAction } from "./expense"
import { heldCreditRefundAction } from "./held-credit-refund"
import { moneyMovementAction } from "./money-movement"
import {
  orderCancelAction,
  orderMetadataAction,
  orderReplaceAction,
} from "./order-amendment"
import { orderAttachmentAddAction } from "./order-attachment"
import {
  productBatchFulfillAction,
  productLineFulfillAction,
} from "./product-fulfillment"
import { productLineReturnAction } from "./product-return"
import { purchaseRegistrationAction } from "./purchase-registration"
import {
  serviceAuthorizeAction,
  serviceFulfillAction,
} from "./service-fulfillment"
import { supplierCreateAction } from "./supplier-create"
export {
  orderCancelAction,
  orderMetadataAction,
  orderReplaceAction,
} from "./order-amendment"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { normalizeStockCategoryName } from "@ewatrade/utils/inventory-categories"
import { z } from "zod"
import { closeoutCreateAction, closeoutFinalizeAction } from "./closeout"
import { productCreateAction, productCreateSummary } from "./product-create"
import {
  stockAdjustmentAction,
  stockCorrectionAction,
} from "./stock-adjustment"
import {
  stockTransferCancelAction,
  stockTransferDispatchAction,
  stockTransferReceiveAction,
} from "./stock-transfer"
import {
  unitConfigurationDraftAction,
  unitConfigurationPublishAction,
} from "./unit-configuration"
const id = z.string().trim().min(1).max(128)
const name = z.string().trim().min(1).max(160)
const money = z.number().int().min(0).max(100_000_000)
const quantity = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
  .refine((v) => Number(v) > 0, "Quantity must be positive")
/** Quick sale (typed price) or Additional cost; description is optional. */
export const orderCustomLine = z
  .object({
    custom: z.enum(["quick_sale", "additional_cost"]),
    amountMinor: money.refine((value) => value > 0, "Amount must be positive"),
    description: z.string().trim().max(200).optional(),
  })
  .strict()
export const generalActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("customer_create"),
      name,
      phone: z.string().trim().max(40).optional(),
      email: z.string().email().max(254).optional(),
    })
    .strict(),
  productCreateAction,
  z
    .object({
      action: z.literal("order_create"),
      initialPayment: z
        .object({
          amountMinor: money.refine(
            (value) => value > 0,
            "Payment must be positive",
          ),
          moneyAccountId: id.optional(),
          method: z.enum(["bank_transfer", "card", "cash", "other", "pos"]),
          note: z.string().trim().max(500).optional(),
        })
        .strict()
        .optional(),
      customerId: id.optional(),
      notes: z.string().trim().max(2000).optional(),
      lines: z
        .array(
          z.union([
            z
              .object({
                offeringId: id,
                quantity,
                expectedConfigurationVersionId: id.optional(),
                expectedFixedPriceMinor: money.optional(),
                enteredTotalMinor: money
                  .refine((value) => value > 0)
                  .optional(),
              })
              .strict()
              .refine(
                (line) =>
                  (line.expectedFixedPriceMinor !== undefined) !==
                  (line.enteredTotalMinor !== undefined),
                "Choose a fixed price snapshot or an explicit item total.",
              ),
            // Sold without a Catalog item: a typed amount (e.g. from a receipt).
            orderCustomLine,
          ]),
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
      moneyAccountId: id.optional(),
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
  customerReceiptAction,
  moneyMovementAction,
  expenseAction,
  billPaymentAction,
  purchaseRecordAction,
  purchaseRegistrationAction,
  purchaseRecognitionAction,
  supplierCreateAction,
  purchaseRecognitionReverseAction,
  supplierEntryReverseAction,
  supplierOpeningAction,
  purchasePaymentReverseAction,
  supplierAllocationReleaseAction,
  supplierAdvanceAction,
  supplierAdvanceAllocateAction,
  purchasePaymentAction,
  expenseVoidAction,
  billPaymentReverseAction,
  customerCreditApplyAction,
  customerAllocationReleaseAction,
  heldCreditRefundAction,
  productLineReturnAction,
  productLineFulfillAction,
  productBatchFulfillAction,
  serviceAuthorizeAction,
  serviceFulfillAction,
  orderCancelAction,
  orderMetadataAction,
  orderReplaceAction,
  orderAttachmentAddAction,
  closeoutCreateAction,
  closeoutFinalizeAction,
  staffInvitationAction,
  staffStatusAction,
  serviceIntakeAction,
  ...serviceWorkEditorActionSchema.options,
  ...quoteDecisionAction.options,
  staffAccessAction,
  cashCountAction,
])
export const generalOrderActionSchema = generalActionSchema.options[2]
export type GeneralAction = z.infer<typeof generalActionSchema>
export type GeneralActionName = GeneralAction["action"]
const generalRecordReceiptSchema = z
  .object({
    kind: z.enum([
      "finance_purchase_bill",
      "staff_invitation",
      "staff_status",
      "staff_access",
      "service_intake",
      "finance_purchase_registration",
      "finance_supplier",
      "finance_bill",
      "finance_movement",
      "finance_cash_count",
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
    bookId: id.optional(),
    orderId: id.optional(),
    catalogItemId: id.optional(),
    title: z.string(),
    detail: z.string(),
  })
  .strict()
  .refine(
    (value) =>
      ![
        "finance_movement",
        "finance_cash_count",
        "finance_bill",
        "finance_supplier",
        "finance_purchase_bill",
        "finance_purchase_registration",
      ].includes(value.kind) || Boolean(value.bookId),
    {
      message: "A finance receipt requires its Finance Book.",
      path: ["bookId"],
    },
  )
  .refine(
    (value) => value.kind !== "service_intake" || Boolean(value.orderId),
    {
      message: "A Service intake receipt requires its original Order.",
      path: ["orderId"],
    },
  )
export const generalReceiptSchema = z.union([
  generalRecordReceiptSchema,
  serviceWorkLifecycleReceipt,
  serviceWorkCompletionReceipt,
  quoteDecisionReceipt,
  serviceWorkRecordReceipt,
])
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
    target: generalAnswerTargetSchema.optional(),
  })
  .strict()
export type GeneralAnswer = z.infer<typeof generalAnswerSchema>
export const generalStoredPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(16000) }).strict(),
  // A photo or PDF the owner sent (e.g. a receipt); display data only.
  z
    .object({
      type: z.literal("data-setup-attachment"),
      data: z
        .object({
          attachmentId: z.string().max(128),
          kind: z.string().max(32),
          fileName: z.string().max(300),
          summary: z.string().max(2000),
          expired: z.boolean().optional(),
        })
        .strict(),
    })
    .strict(),
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
  /** Receipt photo or PDF sent with a user message. */
  "setup-attachment": {
    attachmentId: string
    kind: string
    fileName: string
    summary: string
    expired?: boolean
  }
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
    case "staff_access":
      return `Update staff Store access · ${action.assignments.length} Store assignment(s)`
    case "staff_status":
      return `${action.status === "suspended" ? "Suspend" : "Reactivate"} staff membership`
    case "service_job_assign":
      return "Assign saved Service work"
    case "service_job_reschedule":
      return `Revise Service promise · ${action.promisedAt} · ${action.reason}`
    case "service_job_line_transition":
      return `Update saved work · ${action.toStatus.replaceAll("_", " ")}${action.reason ? ` · ${action.reason}` : ""}`
    case "commerce_quote_approve":
      return "Approve and commercially release original quotation"
    case "commerce_quote_reject":
      return "Reject original quotation; keep version private"
    case "service_work_rework":
      return `Create linked rework · ${action.quantity} · ${action.reason}`
    case "service_work_handoff":
      return "Record customer handoff of settled Service work"
    case "service_work_note":
      return "Add internal Service work note"
    case "service_work_exception":
      return `Record open Service exception · ${action.type.replaceAll("_", " ")}`
    case "service_intake":
      return `Service intake · ${action.lines.length} service line(s)`
    case "staff_invitation":
      return action.intent.kind === "INVITE"
        ? `Invite ${action.intent.invite.email} · ${action.intent.invite.assignments.length} Store assignment(s)`
        : `${action.intent.kind === "RESEND" ? "Resend" : "Revoke"} staff invitation · ${action.intent.reason}`
    case "product_batch_fulfill":
      return `Fulfil remaining order lines · ${action.reason}`
    case "purchase_recognize":
      return `Recognize purchase ${action.stage.toLowerCase()} · ${action.reference}`
    case "purchase_record":
      return `Record received purchase · ${action.description}`
    case "purchase_register":
      return `Register purchase agreement · ${action.description}`
    case "supplier_entry_reverse":
      return `Reverse original supplier entry · ${action.reason}`
    case "purchase_recognition_reverse":
      return `Reverse original purchase fact · ${action.reason}`
    case "purchase_payment_reverse":
      return `Reverse recorded purchase payment · ${action.reason}`
    case "supplier_allocation_release":
      return `Release supplier allocation · ${action.reason}`
    case "supplier_opening":
      return `Record supplier opening ${action.kind.toLowerCase()} · ${action.description}`
    case "supplier_advance":
      return `Record supplier advance · ${action.description}`
    case "supplier_advance_allocate":
      return `Apply existing supplier advance · ${action.description}`
    case "purchase_payment":
      return `Record purchase invoice payment · ${action.description}`
    case "supplier_create":
      return `Create supplier · ${action.name} (${action.code})`
    case "expense_void":
      return `Void unpaid expense · ${action.reason}`
    case "bill_payment_reverse":
      return `Reverse recorded bill payment · ${action.reason}`
    case "bill_payment":
      return "Record payment against existing expense bill"
    case "cash_count_record":
      return `Record physical cash count · ${action.asOf} · ${action.reference}`
    case "expense_record":
      return `Record expense · ${action.payeeName} · ${action.description}`
    case "money_movement":
      return `Record ${action.kind.toLowerCase().replaceAll("_", " ")} · ${action.description}`
    case "customer_credit_apply":
      return "Apply existing customer credit"
    case "customer_allocation_release":
      return `Release customer credit allocation · ${action.reason}`
    case "customer_receipt":
      return `Record received customer funds · ${action.description}`
    case "held_credit_refund":
      return `Record returned customer funds · ${action.reason}`
    case "product_line_return":
      return `Return ${action.quantity} · ${action.disposition.replaceAll("_", " ")} · ${action.reason}`
    case "product_line_fulfill":
      return `Fulfil reserved product line · ${action.reason}`
    case "service_line_authorize":
      return `Authorize service line · ${action.reason}`
    case "service_line_fulfill":
      return `Record service performance · ${action.reason}`
    case "order_cancel":
      return `Cancel order ${action.orderId} · ${action.reason}`
    case "order_metadata_update":
      return `Update order details · ${action.reason}`
    case "order_replace":
      return `Replace order with ${action.changes.length} line change(s) · ${action.reason}`
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
      return productCreateSummary(action, amount)
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
    case "order_attachment_add":
      return `Attach file ${action.attachmentId} to order ${action.orderId}${action.note ? `\n${action.note}` : ""}`
  }
}
