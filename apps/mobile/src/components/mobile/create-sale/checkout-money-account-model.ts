/** A row from orders.paymentAccounts (active Store currency, current Book). */
export type CheckoutMoneyAccount = {
  id: string
  name: string
  purpose: string
  paymentMethods: string[]
  paused: boolean
}

/** A deliberate choice, bound to the actor/business/Store that made it. */
export type CheckoutAccountChoice = { owner: string; id: string; name: string }

export type CheckoutAccountRead =
  | { status: "loading" }
  | { status: "denied" }
  | { status: "error" }
  | {
      status: "ready"
      book: { id: string; currencyCode: string } | null
      accounts: CheckoutMoneyAccount[]
    }

export type CheckoutAccountState =
  | { kind: "not_needed" }
  | { kind: "loading" }
  | { kind: "denied" }
  | { kind: "error" }
  | { kind: "offline_unavailable" }
  | { kind: "none"; accounts: CheckoutMoneyAccount[]; cached: boolean }
  | { kind: "choose"; eligible: CheckoutMoneyAccount[]; cached: boolean }
  | {
      kind: "choose_again"
      eligible: CheckoutMoneyAccount[]
      previousName: string
      cached: boolean
    }
  | {
      kind: "selected"
      account: CheckoutMoneyAccount
      eligible: CheckoutMoneyAccount[]
      /** Preselected only because it is the one eligible account. */
      sole: boolean
      /** From a previously checked offline snapshot; the server rechecks it. */
      cached: boolean
    }

/** Selectable for this method: not paused and configured to accept it. */
export function eligibleCheckoutAccounts(
  accounts: readonly CheckoutMoneyAccount[],
  method: string,
) {
  return accounts.filter(
    (account) => !account.paused && account.paymentMethods.includes(method),
  )
}

/** Why an account in the list can't take this payment (for the chooser). */
export function checkoutAccountUnavailableReason(
  account: CheckoutMoneyAccount,
  methodLabel: string,
) {
  if (account.paused) return "Paused"
  return `Doesn't take ${methodLabel}`
}

/**
 * Destination account for money received now. Payment pending needs none.
 * A sole eligible account may be preselected (never called a stored default);
 * with several, the user chooses. A prior choice that is no longer eligible
 * (method change, paused, removed, other owner) asks again instead of being
 * silently replaced.
 */
export function resolveCheckoutAccount({
  receivedMinor,
  method,
  offline,
  read,
  owner,
  choice,
  offlineSnapshot = null,
}: {
  receivedMinor: number
  method: string
  offline: boolean
  read: CheckoutAccountRead
  owner: string
  choice: CheckoutAccountChoice | null
  /** This owner's previously checked accounts, used only while offline. */
  offlineSnapshot?: {
    book: { id: string; currencyCode: string } | null
    accounts: CheckoutMoneyAccount[]
  } | null
}): CheckoutAccountState {
  if (receivedMinor <= 0) return { kind: "not_needed" }
  // Offline without a previously checked snapshot: never invent a destination.
  if (offline && !offlineSnapshot) return { kind: "offline_unavailable" }
  const source =
    offline && offlineSnapshot
      ? { status: "ready" as const, ...offlineSnapshot }
      : read
  if (source.status !== "ready") return { kind: source.status }
  const cached = offline
  const accounts = source.book ? source.accounts : []
  const eligible = eligibleCheckoutAccounts(accounts, method)
  const own = choice && choice.owner === owner ? choice : null
  if (own) {
    const account = eligible.find((candidate) => candidate.id === own.id)
    if (account)
      return { kind: "selected", account, eligible, sole: false, cached }
    return { kind: "choose_again", eligible, previousName: own.name, cached }
  }
  if (!eligible.length) return { kind: "none", accounts, cached }
  if (eligible.length === 1)
    return {
      kind: "selected",
      account: eligible[0],
      eligible,
      sole: true,
      cached,
    }
  return { kind: "choose", eligible, cached }
}

/** The account id to send, or null when checkout can't proceed with money. */
export function checkoutAccountForSubmit(state: CheckoutAccountState) {
  if (state.kind === "not_needed") return { ok: true as const, id: undefined }
  if (state.kind === "selected")
    return { ok: true as const, id: state.account.id }
  return { ok: false as const }
}
