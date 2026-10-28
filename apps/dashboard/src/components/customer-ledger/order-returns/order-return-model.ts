import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import type { PendingFinanceCommand } from "@ewatrade/utils/finance-command-identity"
import {
  formatFinanceMoney,
  parseFinanceMoney,
} from "@ewatrade/utils/finance-money"

/**
 * Source-aware Order return (MB-01, Banking02 v18 "Review original payment
 * sources"). Held credit goes back to its exact original allocation; only
 * money actually collected goes back as cash. The server owns every cap,
 * source and revision; this model only checks entries against them and
 * builds the exact command it will be asked to confirm.
 */

type ReturnInput = RouterInputs["customerLedger"]["returnOrderFunds"]
export type OrderReturnPayload = Omit<ReturnInput, "clientCommandId">
export type CashReturnMethod = NonNullable<ReturnInput["cashReturn"]>["method"]
export type OrderReturnReview =
  RouterOutputs["customerLedger"]["orderReturnReview"]
export type AvailableOrderReturn = Extract<
  OrderReturnReview,
  { status: "AVAILABLE" }
>

/** Retrying an unresolved return must keep the revision in its original digest. */
export function orderReturnCommandRevision(
  currentRevision: AvailableOrderReturn["accountRevision"],
  pending: Pick<PendingFinanceCommand, "operation" | "recoveryMetadata"> | null,
) {
  return pending?.operation === "returnOrderFunds"
    ? (pending.recoveryMetadata?.expectedSnapshotSequence ?? currentRevision)
    : currentRevision
}
type UnavailableReason = Extract<
  OrderReturnReview,
  { status: "UNAVAILABLE" }
>["reason"]

/** The order-level cash refund accepts a whole-number amount up to this. */
const CASH_LIMIT_MINOR = BigInt(100_000_000)

/** No customer account, book or customer: no held credit can be involved. */
const NO_CREDIT_POSSIBLE: ReadonlySet<UnavailableReason> = new Set([
  "CUSTOMER_REQUIRED",
  "FINANCE_BOOK_REQUIRED",
  "CUSTOMER_ACCOUNT_REQUIRED",
])

const UNAVAILABLE_WORDS: Record<UnavailableReason, string> = {
  CUSTOMER_REQUIRED: "This Order has no customer.",
  FINANCE_BOOK_REQUIRED: "Finance isn’t set up for this currency.",
  CUSTOMER_ACCOUNT_REQUIRED: "This customer has no balance yet.",
  CLOSED_PERIOD:
    "Finance is closed for today’s date. Reopen the period in Finance before returning this Order’s money.",
  BOOK_DATE_UNAVAILABLE:
    "Finance doesn’t accept today’s date yet. Check the book’s start date in Finance.",
  SOURCE_RECONCILIATION_REQUIRED:
    "This Order’s payment sources don’t add up. Check the customer’s statement in Finance before returning money.",
  SOURCE_LIMIT_EXCEEDED:
    "This Order used too many credit sources to return here. Use the customer’s statement in Finance.",
}

export type OrderReturnRoute =
  | { kind: "loading" }
  /** The existing refund: staff requests, no account, or known no credit. */
  | { kind: "ordinary" }
  | { kind: "error" }
  | { kind: "unavailable"; message: string }
  | { kind: "sources"; review: AvailableOrderReturn }

/**
 * Which refund the Order gets. Only a fresh Owner/Admin review that lists
 * held credit opens the source review; unknown access or a failed read never
 * counts as "no credit".
 */
export function orderReturnRoute(input: {
  /** A staff approval request keeps the existing flow. */
  ask: boolean
  /** Owner/Admin from the current tenant; null while unknown. */
  allowed: boolean | null
  status: "pending" | "error" | "success"
  /** Finance refused (role or plan): the existing refund stays. */
  forbidden: boolean
  /** False while a remounted read still shows an earlier cached answer. */
  fetchedAfterMount: boolean
  data: OrderReturnReview | undefined
}): OrderReturnRoute {
  if (input.ask || input.allowed === false) return { kind: "ordinary" }
  if (input.allowed === null) return { kind: "loading" }
  if (input.status === "error")
    return input.forbidden ? { kind: "ordinary" } : { kind: "error" }
  if (input.status === "pending" || !input.fetchedAfterMount || !input.data)
    return { kind: "loading" }
  const review = input.data
  if (review.status === "UNAVAILABLE")
    return NO_CREDIT_POSSIBLE.has(review.reason)
      ? { kind: "ordinary" }
      : { kind: "unavailable", message: UNAVAILABLE_WORDS[review.reason] }
  return review.creditSources.length
    ? { kind: "sources", review }
    : { kind: "ordinary" }
}

/** A different account revision, source or cap starts a fresh review. */
export function orderReturnIdentity(review: AvailableOrderReturn) {
  return JSON.stringify([
    review.orderId,
    review.storeId,
    review.bookId,
    review.accountId,
    review.accountRevision,
    review.currencyCode,
    review.ordinaryCashMaxMinor,
    review.creditSources.map((source) => [
      source.allocationId,
      source.remainingMinor,
    ]),
  ])
}

/** Exact minor units as an editable major amount ("3000" → "30"). */
export function minorToMajorText(minor: string) {
  const value = BigInt(minor)
  const whole = (value / BigInt(100)).toString()
  const cents = (value % BigInt(100)).toString().padStart(2, "0")
  return cents === "00" ? whole : `${whole}.${cents.replace(/0$/, "")}`
}

export type ReturnAmount =
  | { kind: "empty" }
  | { kind: "amount"; minor: string }
  | { kind: "problem"; problem: string }

/** One entered amount against the server's remaining cap for that source. */
export function returnAmount(
  entered: string,
  capMinor: string,
  currencyCode: string,
): ReturnAmount {
  if (!entered.trim()) return { kind: "empty" }
  let minor: string
  try {
    minor = parseFinanceMoney(entered.replaceAll(",", ""))
  } catch (failure) {
    return {
      kind: "problem",
      problem:
        failure instanceof Error ? failure.message : "Enter a valid amount.",
    }
  }
  if (BigInt(minor) > BigInt(capMinor))
    return {
      kind: "problem",
      problem: `At most ${formatFinanceMoney(capMinor, currencyCode)} can go back here.`,
    }
  return { kind: "amount", minor }
}

export type OrderReturnScope = Pick<
  OrderReturnPayload,
  "bookId" | "accountId" | "expectedRevision" | "orderId" | "storeId"
> &
  Pick<AvailableOrderReturn, "currencyCode">

export type OrderReturnEntry = {
  reason: string
  credit: Array<{ allocationId: string; entered: string; capMinor: string }>
  cash: {
    entered: string
    capMinor: string
    method: CashReturnMethod
    reference: string
    moneyAccountId?: string
  } | null
}

export type OrderReturnDraft =
  | {
      kind: "ready"
      payload: OrderReturnPayload
      creditMinor: string
      cashMinor: string
    }
  | {
      kind: "invalid"
      /** Keyed by allocation id, "cash" or "reason". */
      problems: Record<string, string>
      /** Nothing chosen yet: not an error to show. */
      empty: boolean
    }

/** The exact command for review, or what still needs fixing. */
export function orderReturnDraft(
  scope: OrderReturnScope,
  entry: OrderReturnEntry,
): OrderReturnDraft {
  const problems: Record<string, string> = {}
  const creditReturns: OrderReturnPayload["creditReturns"] = []
  let creditMinor = BigInt(0)
  const seen = new Set<string>()
  for (const row of entry.credit) {
    if (seen.has(row.allocationId)) {
      problems[row.allocationId] = "Choose each original credit once."
      continue
    }
    seen.add(row.allocationId)
    const amount = returnAmount(row.entered, row.capMinor, scope.currencyCode)
    if (amount.kind === "problem") problems[row.allocationId] = amount.problem
    if (amount.kind !== "amount") continue
    creditReturns.push({
      allocationId: row.allocationId,
      amountMinor: amount.minor,
    })
    creditMinor += BigInt(amount.minor)
  }
  let cashReturn: OrderReturnPayload["cashReturn"]
  if (entry.cash) {
    const amount = returnAmount(
      entry.cash.entered,
      entry.cash.capMinor,
      scope.currencyCode,
    )
    if (amount.kind === "problem") problems.cash = amount.problem
    else if (
      amount.kind === "amount" &&
      BigInt(amount.minor) > CASH_LIMIT_MINOR
    )
      problems.cash = "Record a cash return this large in Finance."
    else if (amount.kind === "amount")
      cashReturn = {
        amountMinor: Number(amount.minor),
        method: entry.cash.method,
        ...(entry.cash.reference.trim()
          ? { reference: entry.cash.reference.trim().slice(0, 160) }
          : {}),
        ...(entry.cash.moneyAccountId
          ? { moneyAccountId: entry.cash.moneyAccountId }
          : {}),
      }
  }
  const reason = entry.reason.trim()
  const empty = !creditReturns.length && !cashReturn
  if (!reason) problems.reason = "Give a reason."
  else if (reason.length > 400) problems.reason = "Keep the reason short."
  if (empty || Object.keys(problems).length)
    return { kind: "invalid", problems, empty }
  return {
    kind: "ready",
    payload: {
      bookId: scope.bookId,
      accountId: scope.accountId,
      expectedRevision: scope.expectedRevision,
      orderId: scope.orderId,
      storeId: scope.storeId,
      reason,
      creditReturns,
      ...(cashReturn ? { cashReturn } : {}),
    },
    creditMinor: creditMinor.toString(),
    cashMinor: String(cashReturn?.amountMinor ?? 0),
  }
}

/**
 * The identity a confirmation is bound to. Any change to the revision,
 * Order, sources, amounts, tender or reason clears the confirmation.
 */
export function orderReturnConfirmationKey(payload: OrderReturnPayload) {
  return JSON.stringify([
    payload.bookId,
    payload.accountId,
    payload.expectedRevision,
    payload.orderId,
    payload.storeId,
    payload.reason,
    (payload.creditReturns ?? []).map((row) => [
      row.allocationId,
      row.amountMinor,
    ]),
    payload.cashReturn
      ? [
          payload.cashReturn.amountMinor,
          payload.cashReturn.method,
          payload.cashReturn.reference ?? "",
          payload.cashReturn.moneyAccountId ?? "",
        ]
      : null,
  ])
}
