import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import type { TRPCClient } from "@trpc/client"
import { type StoredReport, newClientAttemptId } from "./report-storage"
import { fromTrpc } from "./send-payment-report"

type NextAttemptClient = {
  businessBanking: Pick<
    TRPCClient<AppRouter>["businessBanking"],
    "nextPaymentAttempt"
  >
}

export type IssuedAttempt = {
  paymentAttemptId: string
  paymentReference: string
}

/** The payment attempt a fresh link read shows. */
export type LinkAttempt = {
  paymentAttemptId: string | null
  paymentReference: string | null
}

export type NextAttemptResult =
  /** The link now shows exactly the attempt the server issued for this request. */
  | { kind: "ready"; attempt: IssuedAttempt }
  /** The link shows a newer attempt than this request got; the customer has to choose it. */
  | { kind: "changed"; attempt: IssuedAttempt }
  /** Nothing new to show. `refresh`: the link itself may have closed or expired. */
  | { kind: "error"; message: string; refresh: boolean }

const NOT_LOADED =
  "We couldn't load your new payment reference. Check your connection and try again."

/**
 * Pay remaining / Tell them again: ask for the next payment reference with the decided report's
 * proof. The clientAttemptId is saved before the request, so a lost answer or a reload replays the
 * same attempt instead of issuing a second reference. The decided report, its proof and its
 * reference stay in the record; the new attempt is kept beside them. The new form may open only
 * when a fresh link read shows the exact attempt the server returned.
 */
export async function startNextPaymentAttempt(input: {
  client: NextAttemptClient
  /** The browser's record of the decided report. */
  record: StoredReport
  /** The attempt the decided report was made against; null for reports from before references. */
  decidedAttemptId: string | null
  save: (record: StoredReport) => void
  /** A fresh read of the link (never a cached one). Throws when it can't be read. */
  readLink: () => Promise<LinkAttempt>
}): Promise<NextAttemptResult> {
  const reportToken = input.record.reportToken
  if (!reportToken)
    return { kind: "error", message: NOT_LOADED, refresh: false }
  const pending = input.record.nextAttempt ?? {
    clientAttemptId: newClientAttemptId(),
    paymentAttemptId: null,
    paymentReference: null,
  }
  input.save({ ...input.record, nextAttempt: pending })

  let issued: IssuedAttempt | null = null
  let newerExists = false
  try {
    const result = await input.client.businessBanking.nextPaymentAttempt.mutate(
      { reportToken, clientAttemptId: pending.clientAttemptId },
    )
    // A replay always returns the first answer; a different one is not this request's.
    if (
      pending.paymentAttemptId &&
      pending.paymentAttemptId !== result.paymentAttemptId
    )
      return {
        kind: "error",
        message:
          "The payment reference changed. Reload this page before you pay.",
        refresh: true,
      }
    issued = {
      paymentAttemptId: result.paymentAttemptId,
      paymentReference: result.paymentReference,
    }
    input.save({
      ...input.record,
      nextAttempt: { clientAttemptId: pending.clientAttemptId, ...issued },
    })
  } catch (error) {
    const failure = fromTrpc(error)
    newerExists =
      failure.kind === "conflict" &&
      /newer payment attempt/i.test(failure.message)
    if (!newerExists)
      return {
        kind: "error",
        message: failure.message,
        refresh: failure.kind === "unavailable" || failure.kind === "conflict",
      }
  }

  let current: LinkAttempt
  try {
    current = await input.readLink()
  } catch {
    return { kind: "error", message: NOT_LOADED, refresh: false }
  }
  if (
    issued &&
    current.paymentAttemptId === issued.paymentAttemptId &&
    current.paymentReference === issued.paymentReference
  )
    return { kind: "ready", attempt: issued }
  // Another tab or browser moved the link on: show that reference, never swap it in silently.
  if (
    current.paymentAttemptId &&
    current.paymentReference &&
    current.paymentAttemptId !== input.decidedAttemptId
  )
    return {
      kind: "changed",
      attempt: {
        paymentAttemptId: current.paymentAttemptId,
        paymentReference: current.paymentReference,
      },
    }
  return {
    kind: "error",
    message: newerExists
      ? "A newer payment reference exists. Reload this page to see it."
      : NOT_LOADED,
    refresh: false,
  }
}
