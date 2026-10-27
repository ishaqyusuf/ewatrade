import { expect, test } from "bun:test"
import type { PublicPaymentLink, PublicReportStatus } from "./payment-format"
import { outcomeNextStep, resolvePaymentView } from "./payment-view"

function link(over: Partial<PublicPaymentLink> = {}): PublicPaymentLink {
  return {
    businessName: "Jawdah Poultry QA",
    customerName: "Ishaq Yusuf",
    orderNumber: "ORD-059",
    orderStatus: "CONFIRMED",
    state: "active",
    amountRequestedMinor: 200_000,
    amountPrefilledMinor: 150_000,
    totalMinor: 200_000,
    paidMinor: 50_000,
    balanceMinor: 150_000,
    currencyCode: "NGN",
    allowPartial: true,
    receiptAllowed: true,
    expiresAt: new Date("2026-10-28T09:00:00Z"),
    bank: {
      name: "GTBank",
      accountNumber: "0012345678",
      accountHolder: "EwaTrade ManualQA",
    },
    items: [
      {
        name: "Inspection visit",
        kind: "SERVICE",
        quantity: "1",
        totalMinor: 200_000,
      },
    ],
    preview: {
      title: "Payment for Jawdah Poultry QA",
      description: "",
      robots: "noindex, nofollow, noarchive",
    },
    ...over,
  } as PublicPaymentLink
}

function status(over: Partial<PublicReportStatus>): PublicReportStatus {
  return {
    reportId: "report-1",
    revision: 2,
    status: "CONFIRMED",
    claimedAmountMinor: 40_000,
    receivedAmountMinor: 40_000,
    totalMinor: 200_000,
    paidMinor: 90_000,
    balanceMinor: 110_000,
    currencyCode: "NGN",
    state: "partially_paid",
    statusSocketUrl: null,
    ...over,
  } as PublicReportStatus
}

function resolve(
  current: PublicPaymentLink,
  report: PublicReportStatus | undefined,
) {
  return resolvePaymentView({
    link: current,
    linkError: null,
    hasReportToken: Boolean(report),
    status: report,
    statusPending: false,
    statusError: null,
  })
}

function money(value: PublicPaymentLink) {
  return {
    totalMinor: value.totalMinor,
    paidMinor: value.paidMinor,
    balanceMinor: value.balanceMinor,
    amountPrefilledMinor: value.amountPrefilledMinor,
  }
}

test("a part payment shows the decided report's balance before the link is read again", () => {
  // The link was read before the 400 was confirmed: 500 paid, 1,500 left.
  const view = resolve(link(), status({}))
  if (view.kind !== "link") throw new Error(`unexpected ${view.kind}`)
  expect(view.outcome?.state).toBe("partially_paid")
  expect(money(view.link)).toEqual({
    totalMinor: 200_000,
    paidMinor: 90_000,
    balanceMinor: 110_000,
    amountPrefilledMinor: 110_000,
  })
  expect(
    outcomeNextStep("partially_paid", {
      linkState: view.link.state,
      balanceMinor: view.link.balanceMinor,
    }),
  ).toBe("pay_remaining")
})

test("a final payment shows nothing left before the link is read again", () => {
  // The link was read before the last 1,100 was confirmed: 900 paid, 1,100 left.
  const stale = link({
    amountPrefilledMinor: 110_000,
    paidMinor: 90_000,
    balanceMinor: 110_000,
  })
  const view = resolve(
    stale,
    status({
      state: "paid",
      claimedAmountMinor: 110_000,
      receivedAmountMinor: 110_000,
      paidMinor: 200_000,
      balanceMinor: 0,
    }),
  )
  if (view.kind !== "link") throw new Error(`unexpected ${view.kind}`)
  expect(money(view.link)).toEqual({
    totalMinor: 200_000,
    paidMinor: 200_000,
    balanceMinor: 0,
    amountPrefilledMinor: 0,
  })
  // The link still decides whether it takes payments; no balance offers no payment action.
  expect(view.link.state).toBe("active")
  expect(
    outcomeNextStep("paid", {
      linkState: view.link.state,
      balanceMinor: view.link.balanceMinor,
    }),
  ).toBeNull()
})

test("the next amount is this link's amount, up to what the report says is left", () => {
  const view = resolve(
    link({ amountRequestedMinor: 50_000, amountPrefilledMinor: 50_000 }),
    status({}),
  )
  if (view.kind !== "link") throw new Error(`unexpected ${view.kind}`)
  expect(view.link.amountPrefilledMinor).toBe(50_000)
  expect(view.link.balanceMinor).toBe(110_000)
})

test("a decided report keeps the link's identity, items and gates", () => {
  for (const state of ["active", "paid", "expired", "unavailable"] as const) {
    const current = link({ state })
    const view = resolve(current, status({}))
    if (view.kind !== "link") throw new Error(`unexpected ${view.kind}`)
    expect({ ...view.link, ...money(current) }).toEqual(current)
    expect(view.link.items).toBe(current.items)
    expect(view.link.bank).toBe(current.bank)
  }
})

test("a report not received still uses one snapshot and offers telling them again", () => {
  const view = resolve(
    link(),
    status({
      state: "not_received",
      status: "NOT_RECEIVED",
      receivedAmountMinor: null,
      paidMinor: 50_000,
      balanceMinor: 150_000,
    }),
  )
  if (view.kind !== "link") throw new Error(`unexpected ${view.kind}`)
  expect(money(view.link)).toEqual({
    totalMinor: 200_000,
    paidMinor: 50_000,
    balanceMinor: 150_000,
    amountPrefilledMinor: 150_000,
  })
  expect(
    outcomeNextStep("not_received", {
      linkState: view.link.state,
      balanceMinor: view.link.balanceMinor,
    }),
  ).toBe("tell_again")
})

test("without a decided report the page shows the link exactly as read", () => {
  const current = link()
  expect(resolve(current, undefined)).toEqual({
    kind: "link",
    link: current,
    outcome: null,
  })
  const checking = status({ state: "checking", status: "SUBMITTED" })
  const waiting = resolve(current, checking)
  expect(waiting).toEqual({ kind: "waiting", link: current, status: checking })
  if (waiting.kind === "waiting") expect(waiting.link).toBe(current)
  expect(
    resolve(current, status({ state: "checking", status: "DRAFT" })),
  ).toEqual({ kind: "unfinished", link: current })
})

test("loading, missing and failed reads are unchanged", () => {
  const base = {
    link: undefined,
    linkError: null,
    hasReportToken: false,
    status: undefined,
    statusPending: false,
    statusError: null,
  } as const
  expect(resolvePaymentView(base).kind).toBe("loading")
  expect(resolvePaymentView({ ...base, linkError: "not_found" }).kind).toBe(
    "not_found",
  )
  expect(resolvePaymentView({ ...base, linkError: "error" }).kind).toBe("error")
  const current = link()
  const withToken = { ...base, link: current, hasReportToken: true }
  expect(resolvePaymentView({ ...withToken, statusError: "error" }).kind).toBe(
    "error",
  )
  expect(resolvePaymentView({ ...withToken, statusPending: true }).kind).toBe(
    "loading",
  )
  expect(
    resolvePaymentView({ ...withToken, statusError: "not_found" }),
  ).toEqual({ kind: "link", link: current, outcome: null })
})

test("a part payment offers paying the rest; it never reopens the form by itself", () => {
  expect(
    outcomeNextStep("partially_paid", {
      linkState: "active",
      balanceMinor: 150_000,
    }),
  ).toBe("pay_remaining")
})

test("a report the business didn't find offers telling them again", () => {
  expect(
    outcomeNextStep("not_received", {
      linkState: "active",
      balanceMinor: 200_000,
    }),
  ).toBe("tell_again")
})

test("a full payment, a settled order or a closed link offers no payment action", () => {
  expect(
    outcomeNextStep("paid", { linkState: "active", balanceMinor: 150_000 }),
  ).toBeNull()
  for (const outcome of ["partially_paid", "not_received"] as const) {
    expect(
      outcomeNextStep(outcome, { linkState: "paid", balanceMinor: 0 }),
    ).toBeNull()
    expect(
      outcomeNextStep(outcome, { linkState: "active", balanceMinor: 0 }),
    ).toBeNull()
    for (const linkState of ["expired", "unavailable"] as const)
      expect(
        outcomeNextStep(outcome, { linkState, balanceMinor: 150_000 }),
      ).toBeNull()
  }
})
