import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { PublicPaymentLink } from "./payment-format"
import { linkScopedKey, newOperationId } from "./report-storage"
import { trpcErrorCode } from "./send-payment-report"

export type CustomerFunds = RouterOutputs["businessBanking"]["customerFunds"]
export type AppliedCredit =
  RouterOutputs["businessBanking"]["applyCustomerCredit"]

const decimalMinor = /^(0|[1-9]\d{0,14})$/

/** Exact server decimal string → safe integer minor units, or null. Never a lossy Number(). */
export function parseMinor(value: unknown) {
  if (typeof value !== "string" || !decimalMinor.test(value)) return null
  const minor = Number(value)
  return Number.isSafeInteger(minor) ? minor : null
}

/**
 * The server's sign-in address for this link, only when it is a same-origin login page whose
 * return is a same-origin path. Anything else is dropped rather than followed.
 */
export function safeVerificationUrl(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return null
  try {
    const base = "https://payment.invalid"
    const url = new URL(value, base)
    const next = url.searchParams.get("next")
    if (
      url.origin !== base ||
      url.pathname !== "/login" ||
      !next ||
      !next.startsWith("/") ||
      next.startsWith("//") ||
      new URL(next, base).origin !== base
    )
      return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

/** The exact apply request, kept so a lost response retries the same key and payload. */
export type CreditRequest = {
  clientCommandId: string
  expectedRevision: string
  expectedOrderTotalMinor: string
  expectedOrderPaidMinor: string
  amountMinor: string
}

export type StoredCreditCommand = {
  v: 1
  /** The payment attempt shown when the customer applied credit. */
  paymentAttemptId: string | null
  request: CreditRequest
  /**
   * The server's answer; null while the outcome is unknown. Read back from browser storage it is
   * only recovery metadata: it is never shown as money applied without a current server read.
   */
  result: { id: string; appliedMinor: string } | null
}

/**
 * The funds read the page may show: a current, successful read for an enabled link view. Cached
 * data from before a refetch, a failed refetch, a sign-in change or a disabled view is never
 * shown, so another customer's earlier balance can't stay on screen.
 */
export function provenFunds(input: {
  enabled: boolean
  status: "pending" | "error" | "success"
  fetchStatus: "fetching" | "paused" | "idle"
  data: CustomerFunds | undefined
}) {
  return input.enabled &&
    input.status === "success" &&
    input.fetchStatus === "idle"
    ? input.data
    : undefined
}

/** Whether the current proof lets this customer add refund bank details, or must sign in first. */
export function refundIdentity(
  funds: CustomerFunds | undefined,
): { kind: "verified" } | { kind: "verify"; url: string } | { kind: "none" } {
  if (funds?.status === "VERIFIED" || funds?.status === "UNLINKED")
    return { kind: "verified" }
  if (funds?.status === "VERIFICATION_REQUIRED") {
    const url = safeVerificationUrl(funds.verificationUrl)
    if (url) return { kind: "verify", url }
  }
  return { kind: "none" }
}

export type CreditOffer =
  /** Nothing to show: loading, failed, unlinked, known zero, or a link not taking payments. */
  | { kind: "none" }
  | { kind: "verify"; url: string }
  | { kind: "unavailable" }
  | {
      kind: "available"
      availableMinor: number
      /** What this order and this payment can take now; 0 shows the credit without applying it. */
      applyMinor: number
      snapshot: Omit<CreditRequest, "clientCommandId" | "amountMinor">
    }

/**
 * What the customer can see and do with held credit. Unverified readers see only a sign-in,
 * never an amount. Available credit already excludes refund holds on the server. Pass only
 * provenFunds(): anything else is no read.
 */
export function creditOffer(input: {
  funds: CustomerFunds | undefined
  link: Pick<
    PublicPaymentLink,
    "state" | "currencyCode" | "amountPrefilledMinor"
  >
}): CreditOffer {
  const { funds, link } = input
  if (!funds || link.state !== "active") return { kind: "none" }
  if (funds.status === "VERIFICATION_REQUIRED") {
    const url = safeVerificationUrl(funds.verificationUrl)
    return url ? { kind: "verify", url } : { kind: "none" }
  }
  if (funds.status === "UNLINKED") return { kind: "none" }
  if (funds.status === "UNAVAILABLE") return { kind: "unavailable" }
  const available = parseMinor(funds.availableMinor)
  const total = parseMinor(funds.orderTotalMinor)
  const paid = parseMinor(funds.orderPaidMinor)
  if (
    available === null ||
    total === null ||
    paid === null ||
    !decimalMinor.test(funds.accountRevision) ||
    funds.currencyCode !== link.currencyCode
  )
    return { kind: "unavailable" }
  if (!funds.showCredit || available <= 0) return { kind: "none" }
  return {
    kind: "available",
    availableMinor: available,
    // The server also caps credit by what is left of this payment attempt.
    applyMinor: Math.max(
      0,
      Math.min(available, total - paid, link.amountPrefilledMinor),
    ),
    snapshot: {
      expectedRevision: funds.accountRevision,
      expectedOrderTotalMinor: funds.orderTotalMinor,
      expectedOrderPaidMinor: funds.orderPaidMinor,
    },
  }
}

export function sameSnapshot(
  a: Omit<CreditRequest, "clientCommandId" | "amountMinor">,
  b: Omit<CreditRequest, "clientCommandId" | "amountMinor">,
) {
  return (
    a.expectedRevision === b.expectedRevision &&
    a.expectedOrderTotalMinor === b.expectedOrderTotalMinor &&
    a.expectedOrderPaidMinor === b.expectedOrderPaidMinor
  )
}

export function newCreditCommand(input: {
  paymentAttemptId: string | null
  snapshot: Omit<CreditRequest, "clientCommandId" | "amountMinor">
  amountMinor: number
}): StoredCreditCommand {
  return {
    v: 1,
    paymentAttemptId: input.paymentAttemptId,
    request: {
      clientCommandId: newOperationId("cc"),
      ...input.snapshot,
      amountMinor: String(input.amountMinor),
    },
    result: null,
  }
}

const operationId = /^[a-zA-Z0-9_-]{8,120}$/
const recordId = /^[a-zA-Z0-9_-]{1,128}$/
const positiveMinor = /^[1-9]\d{0,14}$/

export function parseCreditCommand(
  raw: string | null,
): StoredCreditCommand | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    const request = value.request as Record<string, unknown> | null
    const result = value.result as Record<string, unknown> | null
    if (
      value.v !== 1 ||
      (value.paymentAttemptId !== null &&
        (typeof value.paymentAttemptId !== "string" ||
          !recordId.test(value.paymentAttemptId))) ||
      !request ||
      typeof request !== "object" ||
      typeof request.clientCommandId !== "string" ||
      !operationId.test(request.clientCommandId) ||
      typeof request.expectedRevision !== "string" ||
      !decimalMinor.test(request.expectedRevision) ||
      typeof request.expectedOrderTotalMinor !== "string" ||
      !positiveMinor.test(request.expectedOrderTotalMinor) ||
      typeof request.expectedOrderPaidMinor !== "string" ||
      !decimalMinor.test(request.expectedOrderPaidMinor) ||
      typeof request.amountMinor !== "string" ||
      !positiveMinor.test(request.amountMinor) ||
      Object.keys(request).length !== 5 ||
      (result !== null &&
        (!result ||
          typeof result !== "object" ||
          typeof result.id !== "string" ||
          !recordId.test(result.id) ||
          typeof result.appliedMinor !== "string" ||
          !positiveMinor.test(result.appliedMinor)))
    )
      return null
    return {
      v: 1,
      paymentAttemptId: value.paymentAttemptId as string | null,
      request: {
        clientCommandId: request.clientCommandId,
        expectedRevision: request.expectedRevision,
        expectedOrderTotalMinor: request.expectedOrderTotalMinor,
        expectedOrderPaidMinor: request.expectedOrderPaidMinor,
        amountMinor: request.amountMinor,
      },
      result: result
        ? {
            id: result.id as string,
            appliedMinor: result.appliedMinor as string,
          }
        : null,
    }
  } catch {
    return null
  }
}

const KEY_PREFIX = "ewatrade.payment-credit."
// Denied/full storage must still keep the same key for retries during this visit.
const visitCommands = new Map<string, StoredCreditCommand>()

function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function readCreditCommand(linkToken: string) {
  const key = linkScopedKey(KEY_PREFIX, linkToken)
  if (visitCommands.has(key)) return visitCommands.get(key) ?? null
  try {
    const command = parseCreditCommand(storage()?.getItem(key) ?? null)
    if (command) visitCommands.set(key, command)
    return command
  } catch {
    return null
  }
}

export function writeCreditCommand(
  linkToken: string,
  command: StoredCreditCommand,
) {
  const key = linkScopedKey(KEY_PREFIX, linkToken)
  visitCommands.set(key, command)
  try {
    storage()?.setItem(key, JSON.stringify(command))
  } catch {
    /* Private mode or a full quota: this visit still retries the same request. */
  }
}

export function clearCreditCommand(linkToken: string) {
  const key = linkScopedKey(KEY_PREFIX, linkToken)
  visitCommands.delete(key)
  try {
    storage()?.removeItem(key)
  } catch {
    /* Nothing to clear. */
  }
}

/** The saved request for the payment attempt on screen; an older attempt's request is not it. */
export function currentCreditCommand(
  command: StoredCreditCommand | null,
  paymentAttemptId: string | null,
) {
  return command && command.paymentAttemptId === paymentAttemptId
    ? command
    : null
}

/**
 * Whether a bank-transfer claim must wait: while a credit request is in flight, and after it
 * settles until a link read taken after it arrives. That read's per-attempt remainder already
 * subtracts whatever the server applied, so it is right whether or not the outcome is known.
 */
export function creditAwaitsLink(input: {
  sending: boolean
  settledAt: number | null
  linkUpdatedAt: number
}) {
  return (
    input.sending ||
    (input.settledAt !== null && input.linkUpdatedAt <= input.settledAt)
  )
}

/**
 * The credit-applied note. The server's per-attempt read is the truth. A server answer received
 * during this visit may show until that read catches up; a result only read back from browser
 * storage never shows as applied.
 */
export function appliedCredit(input: {
  command: StoredCreditCommand | null
  /** clientCommandIds the server answered during this visit. */
  answered: ReadonlySet<string>
  attemptAppliedMinor: number
}): { minor: number; source: "link" | "answer" } | null {
  if (input.attemptAppliedMinor > 0)
    return { minor: input.attemptAppliedMinor, source: "link" }
  const { command } = input
  if (!command?.result || !input.answered.has(command.request.clientCommandId))
    return null
  const minor = parseMinor(command.result.appliedMinor)
  return minor && minor > 0 ? { minor, source: "answer" } : null
}

type CreditClient = {
  businessBanking: {
    applyCustomerCredit: {
      mutate: (
        input: CreditRequest & { token: string },
      ) => Promise<Pick<AppliedCredit, "id" | "appliedMinor">>
    }
  }
}

export type CreditSendResult =
  | { kind: "applied"; command: StoredCreditCommand }
  /** The request may have committed, now or on an earlier try; retry the same command. */
  | { kind: "unknown"; message: string }

/**
 * Sends exactly the saved request. Only the server's answer marks it applied. No failure proves
 * nothing was applied: a CONFLICT can also mean this key already committed under other details
 * or its saved result can't be read back, so it keeps the same key and payload like a lost answer.
 */
export async function sendCreditCommand(input: {
  client: CreditClient
  token: string
  command: StoredCreditCommand
}): Promise<CreditSendResult> {
  try {
    const result =
      await input.client.businessBanking.applyCustomerCredit.mutate({
        token: input.token,
        ...input.command.request,
      })
    return {
      kind: "applied",
      command: {
        ...input.command,
        result: { id: result.id, appliedMinor: result.appliedMinor },
      },
    }
  } catch (error) {
    const code = trpcErrorCode(error)
    return {
      kind: "unknown",
      message:
        code === "FORBIDDEN" || code === "UNAUTHORIZED"
          ? "Sign in again to check whether your credit was used."
          : code === "CONFLICT"
            ? "Your credit or this order changed, so we can't tell yet whether this credit was used."
            : "We couldn't reach the payment page. Check your connection and try again.",
    }
  }
}
