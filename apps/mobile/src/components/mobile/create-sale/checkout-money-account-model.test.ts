import { expect, test } from "bun:test"
import {
  type CheckoutAccountRead,
  type CheckoutMoneyAccount,
  checkoutAccountForSubmit,
  checkoutAccountUnavailableReason,
  eligibleCheckoutAccounts,
  resolveCheckoutAccount,
} from "./checkout-money-account-model"

const account = (
  id: string,
  methods: string[],
  paused = false,
): CheckoutMoneyAccount => ({
  id,
  name: `Account ${id}`,
  purpose: "CASH",
  paymentMethods: methods,
  paused,
})
const drawer = account("drawer", ["cash"])
const float = account("float", ["cash"])
const bank = account("bank", ["bank_transfer", "pos"])
const pausedPos = account("pos", ["pos"], true)
const ready = (accounts: CheckoutMoneyAccount[]): CheckoutAccountRead => ({
  status: "ready",
  book: { id: "book", currencyCode: "NGN" },
  accounts,
})
const base = {
  receivedMinor: 1000,
  method: "cash",
  offline: false,
  owner: "actor|business|store",
  choice: null,
}

test("only unpaused accounts that accept the method are eligible", () => {
  expect(
    eligibleCheckoutAccounts([drawer, bank, pausedPos], "pos").map((a) => a.id),
  ).toEqual(["bank"])
  expect(checkoutAccountUnavailableReason(pausedPos, "POS")).toBe("Paused")
  expect(checkoutAccountUnavailableReason(drawer, "Transfer")).toBe(
    "Doesn't take Transfer",
  )
})

test("payment pending needs no account and sends none", () => {
  const state = resolveCheckoutAccount({
    ...base,
    receivedMinor: 0,
    read: { status: "loading" },
  })
  expect(state).toEqual({ kind: "not_needed" })
  expect(checkoutAccountForSubmit(state)).toEqual({ ok: true, id: undefined })
})

test("a sole eligible account is preselected; several require a choice", () => {
  const sole = resolveCheckoutAccount({ ...base, read: ready([drawer, bank]) })
  expect(sole).toMatchObject({ kind: "selected", sole: true })
  expect(checkoutAccountForSubmit(sole)).toEqual({ ok: true, id: "drawer" })
  const several = resolveCheckoutAccount({
    ...base,
    read: ready([drawer, float, bank]),
  })
  expect(several.kind).toBe("choose")
  expect(checkoutAccountForSubmit(several)).toEqual({ ok: false })
})

test("a choice that stops being eligible asks again, never swaps", () => {
  const choice = { owner: base.owner, id: "float", name: "Account float" }
  // Method changes to Transfer: the cash float no longer fits, bank is sole.
  const changed = resolveCheckoutAccount({
    ...base,
    method: "bank_transfer",
    choice,
    read: ready([drawer, float, bank]),
  })
  expect(changed).toEqual({
    kind: "choose_again",
    eligible: [bank],
    previousName: "Account float",
    cached: false,
  })
  const paused = resolveCheckoutAccount({
    ...base,
    choice,
    read: ready([drawer, { ...float, paused: true }]),
  })
  expect(paused.kind).toBe("choose_again")
  expect(checkoutAccountForSubmit(paused)).toEqual({ ok: false })
})

test("another owner's choice is ignored", () => {
  const state = resolveCheckoutAccount({
    ...base,
    choice: { owner: "other|business|store", id: "float", name: "x" },
    read: ready([drawer, float]),
  })
  expect(state.kind).toBe("choose")
})

test("reads that aren't fresh and ready never produce a destination", () => {
  for (const status of ["loading", "denied", "error"] as const)
    expect(resolveCheckoutAccount({ ...base, read: { status } }).kind).toBe(
      status,
    )
  expect(
    resolveCheckoutAccount({ ...base, offline: true, read: ready([drawer]) })
      .kind,
  ).toBe("offline_unavailable")
  // A live read never stands in for a saved snapshot offline.
  expect(
    resolveCheckoutAccount({
      ...base,
      read: { status: "ready", book: null, accounts: [drawer] },
    }),
  ).toEqual({ kind: "none", accounts: [], cached: false })
})

test("offline uses only the saved snapshot, labelled as cached", () => {
  const snapshot = {
    book: { id: "book", currencyCode: "NGN" },
    accounts: [drawer, float],
  }
  const choose = resolveCheckoutAccount({
    ...base,
    offline: true,
    read: { status: "error" },
    offlineSnapshot: snapshot,
  })
  expect(choose).toMatchObject({ kind: "choose", cached: true })
  const chosen = resolveCheckoutAccount({
    ...base,
    offline: true,
    read: { status: "loading" },
    offlineSnapshot: snapshot,
    choice: { owner: base.owner, id: "float", name: "Account float" },
  })
  expect(chosen).toMatchObject({ kind: "selected", cached: true })
  expect(checkoutAccountForSubmit(chosen)).toEqual({ ok: true, id: "float" })
  // Online ignores any snapshot.
  expect(
    resolveCheckoutAccount({
      ...base,
      read: { status: "loading" },
      offlineSnapshot: snapshot,
    }).kind,
  ).toBe("loading")
})
