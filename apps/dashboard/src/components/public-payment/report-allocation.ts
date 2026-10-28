import { money } from "./payment-format"

/** What a customer asks for with money beyond this link's amount. Never a payout or credit. */
export type ExcessChoice = "CREDIT" | "REFUND" | "UNRESOLVED"

/**
 * The allocation proposal sent with a report, exactly as the server's prepare schema takes it.
 * Refund bank details are not stored here: only the authenticated prepare operation carries
 * ephemeral private details. An ordinary public report can ask the business for a refund
 * without attaching bank details.
 */
export type ReportAllocation = {
  allocationPreference: "ORDER_MORE" | ExcessChoice
  requestedApplyMinor: number
}

export const MAX_REPORT_MINOR = 100_000_000

export type SentAmountReview =
  | { kind: "invalid"; message: string }
  /** Within what this link asks for: an ordinary report. */
  | { kind: "ordinary" }
  /** More than this link asks for, but not more than the order still owes. */
  | { kind: "more"; applyMinor: number; leftMinor: number }
  /** More than the order still owes: the extra needs the customer's preference. */
  | { kind: "excess"; applyMinor: number; extraMinor: number }

/**
 * The amount the customer says they actually sent, against what this link asks for (due) and
 * what the order still owes (balance). It is the customer's claim; the business confirms what
 * really arrived.
 */
export function reviewSentAmount(input: {
  sentMinor: number | null
  dueMinor: number
  balanceMinor: number
  allowPartial: boolean
  currencyCode: string
}): SentAmountReview {
  const { sentMinor, dueMinor, balanceMinor } = input
  if (sentMinor === null || !Number.isSafeInteger(sentMinor) || sentMinor <= 0)
    return { kind: "invalid", message: "Enter the amount you sent." }
  if (sentMinor > MAX_REPORT_MINOR)
    return {
      kind: "invalid",
      message: `Enter up to ${money(MAX_REPORT_MINOR, input.currencyCode)}.`,
    }
  if (sentMinor < dueMinor && !input.allowPartial)
    return {
      kind: "invalid",
      message: `This business asks for ${money(dueMinor, input.currencyCode)}. Enter the amount you sent if it was more.`,
    }
  if (sentMinor <= dueMinor) return { kind: "ordinary" }
  if (sentMinor <= balanceMinor)
    return {
      kind: "more",
      applyMinor: sentMinor,
      leftMinor: balanceMinor - sentMinor,
    }
  return {
    kind: "excess",
    applyMinor: balanceMinor,
    extraMinor: sentMinor - balanceMinor,
  }
}

/**
 * The proposal for a reviewed amount. The server requires the order to take everything it still
 * owes before any extra, so the applied amount is never the customer's to lower.
 */
export function reportAllocation(
  review: SentAmountReview,
  choice: ExcessChoice | null,
): ReportAllocation | null | "choice_required" {
  if (review.kind === "more")
    return {
      allocationPreference: "ORDER_MORE",
      requestedApplyMinor: review.applyMinor,
    }
  if (review.kind !== "excess") return null
  if (!choice) return "choice_required"
  return {
    allocationPreference: choice,
    requestedApplyMinor: review.applyMinor,
  }
}

export function sameAllocation(
  a: ReportAllocation | null | undefined,
  b: ReportAllocation | null | undefined,
) {
  return (
    (a?.allocationPreference ?? null) === (b?.allocationPreference ?? null) &&
    (a?.requestedApplyMinor ?? null) === (b?.requestedApplyMinor ?? null)
  )
}

export function isReportAllocation(value: unknown): value is ReportAllocation {
  if (!value || typeof value !== "object") return false
  const allocation = value as Record<string, unknown>
  return (
    typeof allocation.allocationPreference === "string" &&
    ["ORDER_MORE", "CREDIT", "REFUND", "UNRESOLVED"].includes(
      allocation.allocationPreference,
    ) &&
    typeof allocation.requestedApplyMinor === "number" &&
    Number.isSafeInteger(allocation.requestedApplyMinor) &&
    allocation.requestedApplyMinor >= 0 &&
    allocation.requestedApplyMinor <= MAX_REPORT_MINOR &&
    Object.keys(allocation).length === 2
  )
}

export const excessChoiceLabel: Record<ExcessChoice, string> = {
  CREDIT: "Keep it as credit with them",
  REFUND: "Ask for a refund",
  UNRESOLVED: "Let them decide",
}

/** One line for the waiting page: what the report asked for, never what happened. */
export function allocationSummary(input: {
  allocationPreference: string | null
  requestedApplyMinor: string | null
  claimedAmountMinor: number
  currencyCode: string
}) {
  const apply =
    input.requestedApplyMinor !== null &&
    /^(0|[1-9]\d{0,14})$/.test(input.requestedApplyMinor)
      ? Number(input.requestedApplyMinor)
      : null
  if (!input.allocationPreference || apply === null) return null
  const extra = input.claimedAmountMinor - apply
  const applyText = money(apply, input.currencyCode)
  if (input.allocationPreference === "ORDER_MORE" || extra <= 0)
    return `You asked them to put ${applyText} toward this order.`
  const extraText = money(extra, input.currencyCode)
  if (input.allocationPreference === "CREDIT")
    return `You asked them to put ${applyText} toward this order and keep ${extraText} as your credit.`
  if (input.allocationPreference === "REFUND")
    return `You asked them to put ${applyText} toward this order and refund ${extraText}. Nothing is refunded until they confirm your transfer.`
  return `You asked them to put ${applyText} toward this order and decide about the extra ${extraText}.`
}
