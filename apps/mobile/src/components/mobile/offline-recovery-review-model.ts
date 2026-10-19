import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type OfflineConflictRow = RouterOutputs["offline"]["conflicts"][number]

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Transfer",
  card: "Card",
  cash: "Cash",
  other: "Other",
  pos: "POS",
}

/**
 * Who may decide a held record from a paused or suspended rep: a current
 * Owner or Admin who is not the record's author. Managers can only read it.
 */
export function recoveryDecisionAccess({
  role,
  viewerId,
  authorId,
}: {
  role: string | undefined
  viewerId: string | undefined
  authorId: string | undefined
}): { canDecide: true } | { canDecide: false; reason: string } {
  const normalized = role?.toUpperCase()
  if (normalized !== "OWNER" && normalized !== "ADMIN")
    return {
      canDecide: false,
      reason: "Only an owner or admin can approve or reject held records.",
    }
  if (viewerId && authorId && viewerId === authorId)
    return {
      canDecide: false,
      reason: "You can't decide a record you recorded yourself.",
    }
  return { canDecide: true }
}

/** A decision reason is required (1–500 characters after trimming). */
export function recoveryReasonError(reason: string) {
  const trimmed = reason.trim()
  if (!trimmed) return "Add a reason for this decision."
  if (trimmed.length > 500) return "Keep the reason under 500 characters."
  return null
}

/**
 * The projected type doesn't yet declare enteredTotalMinor, though the order
 * schema allows it; read it only when it is really a number.
 */
function enteredTotalMinor(line: object) {
  return "enteredTotalMinor" in line &&
    typeof line.enteredTotalMinor === "number"
    ? line.enteredTotalMinor
    : undefined
}

function lastSix(id: string) {
  return id.length > 6 ? `…${id.slice(-6)}` : id
}

/**
 * Exactly what the held record says, for a management decision. Facts that
 * the projection can't prove come back null; the card then shows assisted
 * recovery guidance instead of guessing.
 */
export function recoverySummary(row: OfflineConflictRow) {
  const envelope = row.recoveryEnvelope
  const payload = envelope?.payload
  const payment = payload?.initialPayment
  return {
    // Rejection needs only the exact held envelope; approval also needs the
    // original active Store (otherwise it is assisted recovery).
    decidable: Boolean(row.recovery && envelope),
    canApprove: Boolean(
      row.recovery &&
        envelope &&
        row.recoveryOrigin?.store &&
        row.recoveryOrigin.store.status === "ACTIVE",
    ),
    author: row.actor
      ? row.actor.displayName || row.actor.name || row.actor.email
      : null,
    authorId: row.actor?.id,
    store: row.recoveryOrigin?.store?.name ?? null,
    storeInactive: row.recoveryOrigin?.store
      ? row.recoveryOrigin.store.status !== "ACTIVE"
      : false,
    currencyCode: row.recoveryOrigin?.store?.currencyCode ?? null,
    device: row.recoveryOrigin?.device
      ? [
          row.recoveryOrigin.device.deviceName,
          row.recoveryOrigin.device.platform,
        ]
          .filter(Boolean)
          .join(" · ") || "Registered phone"
      : null,
    /** The phone's own clock: a claim, never proof of when the sale happened. */
    claimedAt: envelope ? new Date(envelope.createdAtClient) : null,
    receivedAt: row.recovery ? new Date(row.recovery.receivedAt) : null,
    accessChangedAt: row.recovery
      ? new Date(row.recovery.accessChangedAt)
      : null,
    lineCount: payload?.lines.length ?? 0,
    /** Every line exactly as held; unknown catalog names stay references. */
    lines: (payload?.lines ?? []).map((line) =>
      "custom" in line
        ? {
            kind:
              line.custom === "quick_sale" ? "Quick sale" : "Additional cost",
            label: line.description?.trim() || "No description",
            quantity: null,
            amountMinor: line.amountMinor,
          }
        : {
            kind:
              enteredTotalMinor(line) !== undefined
                ? "Catalog item · entered total"
                : line.approvedQuotePriceMinor !== undefined
                  ? "Catalog item · quoted price"
                  : "Catalog item · unit price",
            label: `Item ${lastSix(line.offeringId)}`,
            quantity: line.quantity,
            // An entered total is the line total; quoted and fixed prices are
            // per unit. Each is shown under its own label.
            amountMinor:
              enteredTotalMinor(line) ??
              line.approvedQuotePriceMinor ??
              line.expectedFixedPriceMinor ??
              null,
          },
    ),
    customer: payload?.customerName ?? null,
    payment: payment
      ? {
          amountMinor: payment.amountMinor,
          method: METHOD_LABEL[payment.method] ?? payment.method,
          // Current label for the exact held account id; id fallback only
          // when the label can't be proven.
          account: payment.moneyAccountId
            ? row.recoveryOrigin?.moneyAccount?.id === payment.moneyAccountId
              ? row.recoveryOrigin.moneyAccount.name
              : `Account ${lastSix(payment.moneyAccountId)}`
            : null,
        }
      : null,
    fulfillNow: payload?.fulfillNow === true,
    envelope,
  }
}
