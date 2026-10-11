import { createHash } from "node:crypto"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getFinancePurchaseRecognitionReview,
  getFinancePurchaseReceiptReview,
  prepareReviewedFinancePurchaseReceiptInTransaction,
  purchaseReceiptReviewDigest,
  recognizeFinancePurchaseInTransaction,
} from "@ewatrade/db/queries"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"

type Action = Extract<GeneralAction, { action: "purchase_recognize" }>
type Review =
  | Awaited<ReturnType<typeof getFinancePurchaseRecognitionReview>>
  | Awaited<ReturnType<typeof getFinancePurchaseReceiptReview>>

function sourceInput(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  return {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    bookId: payload.bookId,
    recognitionId: payload.recognitionId,
    stage: payload.stage,
    effectiveAt: new Date(payload.effectiveAt),
    reference: payload.reference,
    ...(payload.invoiceAmountMinor !== undefined
      ? { invoiceAmountMinor: payload.invoiceAmountMinor }
      : {}),
    ...(payload.dueAt !== undefined ? { dueAt: new Date(payload.dueAt) } : {}),
  }
}

async function current(ctx: GeneralTransactionContext, payload: Action) {
  const input = sourceInput(ctx, payload)
  const review =
    payload.stage === "RECEIPT"
      ? await getFinancePurchaseReceiptReview(ctx.db, {
          ...input,
          stage: "RECEIPT",
        })
      : await getFinancePurchaseRecognitionReview(ctx.db, {
          ...input,
          stage: payload.stage,
        })
  return {
    input,
    review,
    target: {
      id: review.recognitionId,
      revision: createHash("sha256")
        .update(JSON.stringify(review))
        .digest("hex"),
    },
  }
}

export function purchaseRecognitionReviewLines(review: Review) {
  const money = (value: string) => generalMoney(value, review.currencyCode)
  const control = (account: Review["debit"]) =>
    `${account.code} ${account.accountName}${account.willCreate ? " (created on confirmation)" : ""}`
  return [
    `Record ${review.stage === "INVOICE" ? "supplier invoice" : review.stage === "RECEIPT" ? "physical receipt of all agreed goods" : "ownership of agreed goods"} for ${review.description}.`,
    `Recorded supplier: ${review.supplierName}. Store: ${review.storeName}.`,
    ...review.goods.map(
      (line) =>
        `${line.description}: ${line.enteredQuantity} ${line.enteredUnitName} · ${money(line.amountMinor)} agreed cost.`,
    ),
    ...(review.stage === "RECEIPT"
      ? review.goods.flatMap((line) => [
          `${line.stock.productName} · ${line.stock.variantName}: on-hand ${line.stock.before} → ${line.stock.after} ${line.stock.balanceUnitName}; reserved ${line.stock.reserved}; available after ${line.stock.availableAfter}.`,
          `Canonical quantity ${line.valuation.quantityBefore} → ${line.valuation.quantityAfter}; exact added cost ${money(line.valuation.sourceCostMinor)}. Carrying value ${line.valuation.status === "KNOWN" ? `${money(line.valuation.valueBeforeMinor!)} → ${money(line.valuation.valueAfterMinor!)}` : `unknown (${line.valuation.unknownReason}); no opening cost invented`}.`,
          `Stock categories: ${line.categories.map((category) => `${category.name}${category.willCreate ? " (created on confirmation)" : ""}`).join(", ") || "none"}.`,
        ])
      : []),
    `Exact whole-agreement total: ${money(review.totalMinor)}. Supplier payable increases by ${money(review.payableIncreaseMinor)}.`,
    `Journal: debit ${control(review.debit)}; credit ${control(review.credit)} · ${money(review.totalMinor)} each.`,
    `Fact date: ${review.effectiveAt} (UTC). Reference: ${review.reference}.${review.dueAt ? ` Due: ${review.dueAt} (UTC).` : ""}`,
    `Previously recorded facts: ${review.priorEvents.length ? review.priorEvents.map((event) => `${event.stage} · ${event.effectiveAt} (UTC)`).join("; ") : "none"}.`,
    review.stage === "INVOICE"
      ? "This creates one purchase invoice and payable. It does not declare ownership or record physical receipt, stock or payment."
      : review.stage === "RECEIPT"
        ? "This records physical receipt of all original agreed goods at the original Store, using their exact allocated costs. It creates stock and valuation; no new supplier payable or payment. Physical receipt corrections require a supplier return source."
        : "This records ownership using the existing agreed costs. It creates no new supplier payable, physical receipt, stock or payment.",
    "No money is sent. Cost differences and split deliveries require their own source workflow.",
  ]
}

function receipt(review: Review) {
  return {
    kind: "finance_purchase_registration" as const,
    recordId: review.recognitionId,
    bookId: review.bookId,
    title:
      review.stage === "INVOICE"
        ? "Purchase invoice recognized"
        : review.stage === "RECEIPT"
          ? "Purchase goods received"
          : "Purchase ownership recognized",
    detail: `${review.supplierName} · ${generalMoney(review.totalMinor, review.currencyCode)} · ${review.stage.toLowerCase()} recorded. ${review.stage === "RECEIPT" ? "Original goods received with stock and valuation. No new payable or payment." : "No physical receipt, stock or payment recorded."}`,
  }
}

async function execute(
  ctx: GeneralTransactionContext,
  payload: Action,
  key: string,
  prepared?: Awaited<ReturnType<typeof current>>,
) {
  if (payload.stage === "RECEIPT")
    throw new Error(
      "Physical receipt requires its locked signed review preparation.",
    )
  const { input, review } = prepared ?? (await current(ctx, payload))
  await recognizeFinancePurchaseInTransaction(ctx.db, {
    ...input,
    stage: payload.stage,
    clientCommandId: key,
  })
  return receipt(review)
}

export const purchaseRecognize = {
  stale:
    "Purchase facts, costs, Book, Store or posting accounts changed. Review again.",
  unavailable: "This purchase fact cannot be recognized now.",
  async validate(ctx, payload) {
    return (await current(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { review, target } = await current(ctx, payload)
    return { target, lines: purchaseRecognitionReviewLines(review) }
  },
  async prepareExecution(ctx, payload, command) {
    if (payload.stage === "RECEIPT") {
      const {
        stage: _stage,
        dueAt: _due,
        invoiceAmountMinor: _amount,
        ...input
      } = sourceInput(ctx, payload)
      const prepared = await prepareReviewedFinancePurchaseReceiptInTransaction(
        ctx.db,
        {
          ...input,
          clientCommandId: command.clientOperationId,
          expectedReviewDigest: command.expectedReviewDigest,
        },
      )
      const review = prepared.review
      if (!review)
        throw new Error(
          "The receipt command already exists; refresh its completed proposal.",
        )
      return {
        target: {
          id: review.recognitionId,
          revision: purchaseReceiptReviewDigest(review),
        },
        execute: async (key) => {
          if (key !== command.clientOperationId)
            throw new Error("The prepared receipt command identity changed.")
          await prepared.execute()
          return receipt(review)
        },
      }
    }
    const prepared = await current(ctx, payload)
    return {
      target: prepared.target,
      execute: (key) => execute(ctx, payload, key, prepared),
    }
  },
  execute,
} satisfies GeneralActionAdapter<Action>
