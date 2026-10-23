import { OPERATING_CURRENCY_CODES } from "@ewatrade/utils"
import { findCountry } from "@ewatrade/utils/countries"
import { z } from "zod"
import { generalActionSchema } from "../../general/contracts"
import { productCreateAction } from "../../general/product-create"
import { simpleExpenseAction } from "../../general/simple-expense"
import { simpleSaleAction } from "../../general/simple-sale"
import {
  statedAmountPattern,
  statedAmountToMinor,
} from "../../general/stated-money"

export const whatsAppFlowKinds = [
  "registration",
  "sale",
  "customer",
  "product",
  "expense",
  "stock_receive",
] as const
export type WhatsAppFlowKind = (typeof whatsAppFlowKinds)[number]
const id = z.string().trim().min(1).max(128)
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().min(1).max(max).optional(),
  )
const optionalId = optionalText(128)
const money = (max: number, zero = false) =>
  z
    .string()
    .trim()
    .regex(
      statedAmountPattern,
      "Use an amount with at most two decimal places.",
    )
    .transform((v) => Number(statedAmountToMinor(v)))
    .pipe(
      z
        .number()
        .int()
        .min(zero ? 0 : 1)
        .max(max),
    )
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
const envelope = { form_version: z.literal("1") }

/** Keep canonical validation/defaults without requiring a structurally identical pipe input. */
const canonicalAction = <S extends z.ZodType>(schema: S) =>
  (value: unknown, context: z.RefinementCtx): z.output<S> => {
    const parsed = schema.safeParse(value)
    if (parsed.success) return parsed.data
    for (const issue of parsed.error.issues) context.addIssue({ ...issue })
    return z.NEVER
  }

const registration = z
  .object({
    ...envelope,
    form_kind: z.literal("registration"),
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    businessName: z.string().trim().min(1).max(120),
    ageBand: z.enum(["AGE_13_TO_15", "AGE_16_TO_17", "ADULT"]),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => Boolean(findCountry(v)), "Choose a supported country."),
    currencyCode: z.enum(OPERATING_CURRENCY_CODES),
    acceptedTerms: z.literal(true),
    acknowledgedPrivacyNotice: z.literal(true),
  })
  .strict()
const sale = z
  .object({
    ...envelope,
    form_kind: z.literal("sale"),
    checkedAmount: z.literal(true),
    description: z.string().trim().min(1).max(200),
    customerChoice: z.enum(["walk_in", "existing", "new"]),
    customerId: optionalId,
    customerName: optionalText(160),
    received: money(100_000_000),
    method: z.enum(["cash", "bank_transfer"]),
    moneyAccountId: id,
    paymentStatus: z.enum(["full", "partial"]),
    total: z.preprocess(
      (v) => (v === "" ? undefined : v),
      money(100_000_000).optional(),
    ),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.customerChoice === "existing" && !v.customerId)
      ctx.addIssue({
        code: "custom",
        path: ["customerId"],
        message: "Choose the exact Customer.",
      })
    if (v.customerChoice === "new" && !v.customerName)
      ctx.addIssue({
        code: "custom",
        path: ["customerName"],
        message: "Enter the Customer name.",
      })
    if (
      (v.paymentStatus === "partial" &&
        (v.total === undefined || v.total <= v.received)) ||
      (v.paymentStatus === "full" &&
        v.total !== undefined &&
        v.total !== v.received)
    )
      ctx.addIssue({
        code: "custom",
        path: ["total"],
        message:
          "The full total must match the payment status and received amount.",
      })
    if (
      (v.customerChoice !== "existing" && v.customerId) ||
      (v.customerChoice !== "new" && v.customerName)
    )
      ctx.addIssue({
        code: "custom",
        path: ["customerChoice"],
        message: "Use one Customer choice.",
      })
  })
  .transform((v) => ({
    action: "sale_record" as const,
    description: v.description,
    receivedMinor: v.received,
    moneyAccountId: v.moneyAccountId,
    method: v.method,
    partial: v.paymentStatus === "partial",
    totalMinor: v.total ?? v.received,
    ...(v.customerChoice === "existing"
      ? { customerId: v.customerId }
      : { customerChoice: v.customerChoice, customerName: v.customerName }),
  }))
  .transform(canonicalAction(simpleSaleAction))
const customer = z
  .object({
    ...envelope,
    form_kind: z.literal("customer"),
    name: z.string().trim().min(1).max(160),
    phone: optionalText(40),
    email: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.email().max(254).optional(),
    ),
  })
  .strict()
  .transform((v) => ({
    action: "customer_create" as const,
    name: v.name,
    phone: v.phone,
    email: v.email,
  }))
  .transform(canonicalAction(generalActionSchema))
const product = z
  .object({
    ...envelope,
    form_kind: z.literal("product"),
    name: z.string().trim().min(1).max(160),
    canonicalUnitName: z.string().trim().min(1).max(80),
    price: money(100_000_000, true),
    openingStock: z.preprocess(
      (v) => (v === "" ? undefined : v),
      quantity.optional(),
    ),
  })
  .strict()
  .transform((v) => ({
    action: "product_create" as const,
    name: v.name,
    canonicalUnitName: v.canonicalUnitName,
    priceMinor: v.price,
    openingStock: v.openingStock,
  }))
  .transform(canonicalAction(productCreateAction))
const expense = z
  .object({
    ...envelope,
    form_kind: z.literal("expense"),
    checkedAmount: z.literal(true),
    amount: money(100_000_000_000_000),
    description: z.string().trim().min(1).max(200),
    expenseCategoryId: id,
    bookId: id,
    paymentStatus: z.enum(["paid", "unpaid"]),
    moneyAccountId: optionalId,
    effectiveDate: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.iso.date().optional(),
    ),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.paymentStatus === "paid" && !v.moneyAccountId)
      ctx.addIssue({
        code: "custom",
        path: ["moneyAccountId"],
        message: "Choose the account used.",
      })
    if (v.paymentStatus === "unpaid" && v.moneyAccountId)
      ctx.addIssue({
        code: "custom",
        path: ["moneyAccountId"],
        message: "An unpaid expense has no payment account.",
      })
  })
  .transform((v) => ({
    action: "expense_record_simple" as const,
    amountMinor: v.amount,
    description: v.description,
    expenseCategoryId: v.expenseCategoryId,
    bookId: v.bookId,
    paid: v.paymentStatus === "paid",
    moneyAccountId: v.moneyAccountId,
    effectiveAt: v.effectiveDate
      ? `${v.effectiveDate}T00:00:00.000Z`
      : undefined,
  }))
  .transform(canonicalAction(simpleExpenseAction))
const stockReceive = z
  .object({
    ...envelope,
    form_kind: z.literal("stock_receive"),
    balanceSourceId: id,
    enteredInventoryUnitId: id,
    enteredQuantity: quantity.refine(
      (v) => Number(v) > 0,
      "Quantity must be positive.",
    ),
    reason: z.string().trim().min(1).max(500),
    source: z.string().trim().min(1).max(80),
    supplierName: optionalText(160),
    unitCost: z.preprocess(
      (v) => (v === "" ? undefined : v),
      money(100_000_000, true).optional(),
    ),
  })
  .strict()
  .transform((v) => ({
    action: "stock_receive" as const,
    balanceSourceId: v.balanceSourceId,
    enteredInventoryUnitId: v.enteredInventoryUnitId,
    enteredQuantity: v.enteredQuantity,
    reason: v.reason,
    source: v.source,
    supplierName: v.supplierName,
    unitCostMinor: v.unitCost,
  }))

  .transform(canonicalAction(generalActionSchema))

export const whatsAppFlowSubmissionSchemas = {
  registration,
  sale,
  customer,
  product,
  expense,
  stock_receive: stockReceive,
}
/** Parsing makes a draft, never proof, authorization, approval or a write. */
export function parseWhatsAppFlowSubmission(
  kind: WhatsAppFlowKind,
  value: unknown,
) {
  return whatsAppFlowSubmissionSchemas[kind].safeParse(value)
}
export type WhatsAppRegistrationFlowSubmission = z.output<typeof registration>
export const whatsAppFlowReviewBoundary = (kind: WhatsAppFlowKind) =>
  kind === "registration"
    ? "email_proof"
    : kind === "stock_receive"
      ? "app_review"
      : "explicit_confirmation"
