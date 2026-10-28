import { afterEach, expect, test } from "bun:test"
import { TRPCClientError } from "@trpc/client"
import {
  type CustomerFunds,
  appliedCredit,
  clearCreditCommand,
  creditAwaitsLink,
  creditOffer,
  currentCreditCommand,
  newCreditCommand,
  parseCreditCommand,
  parseMinor,
  provenFunds,
  readCreditCommand,
  refundIdentity,
  safeVerificationUrl,
  sendCreditCommand,
  writeCreditCommand,
} from "./customer-credit-model"

const link = {
  state: "active" as const,
  currencyCode: "NGN",
  amountPrefilledMinor: 500_000,
}
type VerifiedFunds = Extract<CustomerFunds, { status: "VERIFIED" }>
const verified = (patch: Partial<VerifiedFunds> = {}): CustomerFunds => ({
  status: "VERIFIED",
  accountId: "acct_1",
  customerId: "cust_1",
  currencyCode: "NGN",
  accountRevision: "7",
  availableMinor: "300000",
  reservedMinor: "500000",
  showCredit: true,
  orderId: "order_1",
  orderTotalMinor: "1500000",
  orderPaidMinor: "0",
  verificationUrl: "/login?next=%2Fp%2Fabc",
  ...patch,
})
const unverified: CustomerFunds = {
  status: "VERIFICATION_REQUIRED",
  verificationUrl: "/login?next=%2Fp%2Fabc",
}
const unlinked: CustomerFunds = {
  status: "UNLINKED",
  verificationUrl: "/login?next=%2Fp",
}
const unavailable: CustomerFunds = {
  status: "UNAVAILABLE",
  verificationUrl: "/x",
}

afterEach(() => clearCreditCommand("link-token"))

test("server decimal strings parse exactly or not at all", () => {
  expect(parseMinor("0")).toBe(0)
  expect(parseMinor("300000")).toBe(300_000)
  for (const bad of ["", "01", "-1", "1.5", "1e5", "9999999999999999", 5])
    expect(parseMinor(bad)).toBeNull()
})

test("only a same-origin login with a same-origin return is followed", () => {
  expect(safeVerificationUrl("/login?next=%2Fp%2Fabc")).toBe(
    "/login?next=%2Fp%2Fabc",
  )
  for (const bad of [
    "https://evil.example/login?next=/p",
    "//evil.example/login?next=/p",
    "/login",
    "/login?next=https%3A%2F%2Fevil.example",
    "/login?next=%2F%2Fevil.example",
    "/account?next=%2Fp",
    null,
  ])
    expect(safeVerificationUrl(bad)).toBeNull()
})

test("an unverified, unlinked or unknown read never shows an amount", () => {
  expect(creditOffer({ funds: undefined, link })).toEqual({ kind: "none" })
  expect(creditOffer({ funds: unverified, link })).toEqual({
    kind: "verify",
    url: "/login?next=%2Fp%2Fabc",
  })
  expect(creditOffer({ funds: unlinked, link })).toEqual({ kind: "none" })
  expect(creditOffer({ funds: unavailable, link })).toEqual({
    kind: "unavailable",
  })
  expect(
    creditOffer({ funds: verified({ currencyCode: "USD" }), link }).kind,
  ).toBe("unavailable")
  expect(
    creditOffer({ funds: verified({ availableMinor: "1.5" }), link }).kind,
  ).toBe("unavailable")
})

test("known zero hides credit; a closed link offers nothing", () => {
  expect(
    creditOffer({
      funds: verified({ availableMinor: "0", showCredit: false }),
      link,
    }),
  ).toEqual({ kind: "none" })
  expect(
    creditOffer({ funds: verified(), link: { ...link, state: "expired" } }),
  ).toEqual({ kind: "none" })
})

test("the offer binds the server snapshot and caps the amount", () => {
  expect(creditOffer({ funds: verified(), link })).toEqual({
    kind: "available",
    availableMinor: 300_000,
    applyMinor: 300_000,
    snapshot: {
      expectedRevision: "7",
      expectedOrderTotalMinor: "1500000",
      expectedOrderPaidMinor: "0",
    },
  })
  const more = creditOffer({
    funds: verified({ availableMinor: "2000000" }),
    link,
  })
  expect(more.kind === "available" && more.applyMinor).toBe(500_000)
})

test("a credit request is saved with its key and survives a reload", () => {
  const command = newCreditCommand({
    paymentAttemptId: "attempt_1",
    snapshot: {
      expectedRevision: "7",
      expectedOrderTotalMinor: "1500000",
      expectedOrderPaidMinor: "0",
    },
    amountMinor: 300_000,
  })
  expect(command.request.clientCommandId).toMatch(/^cc_[a-f0-9]{32}$/)
  expect(command.request.amountMinor).toBe("300000")
  writeCreditCommand("link-token", command)
  expect(readCreditCommand("link-token")).toEqual(command)
  expect(parseCreditCommand(JSON.stringify(command))).toEqual(command)
  // No account or customer identity is kept or sent.
  expect(JSON.stringify(command)).not.toMatch(
    /acct_|cust_|accountId|customerId/,
  )
  expect(
    parseCreditCommand(
      JSON.stringify({
        ...command,
        request: { ...command.request, accountId: "acct_1" },
      }),
    ),
  ).toBeNull()
  expect(
    parseCreditCommand(JSON.stringify({ ...command, result: undefined })),
  ).toBeNull()
})

test("a credit result restored from storage never proves application", () => {
  const command = newCreditCommand({
    paymentAttemptId: "attempt_1",
    snapshot: {
      expectedRevision: "7",
      expectedOrderTotalMinor: "1500000",
      expectedOrderPaidMinor: "0",
    },
    amountMinor: 300_000,
  })
  const restored = {
    ...command,
    result: { id: "cmd_1", appliedMinor: "300000" },
  }
  expect(
    appliedCredit({
      command: restored,
      answered: new Set(),
      attemptAppliedMinor: 0,
    }),
  ).toBeNull()
  expect(
    appliedCredit({
      command: restored,
      answered: new Set([command.request.clientCommandId]),
      attemptAppliedMinor: 0,
    }),
  ).toEqual({ minor: 300_000, source: "answer" })
  expect(
    appliedCredit({
      command: restored,
      answered: new Set(),
      attemptAppliedMinor: 200_000,
    }),
  ).toEqual({ minor: 200_000, source: "link" })
  expect(currentCreditCommand(restored, "attempt_2")).toBeNull()
})

test("credit waits for a fresh link after the last command answer", () => {
  expect(
    creditAwaitsLink({ sending: true, settledAt: null, linkUpdatedAt: 10 }),
  ).toBe(true)
  expect(
    creditAwaitsLink({ sending: false, settledAt: 10, linkUpdatedAt: 10 }),
  ).toBe(true)
  expect(
    creditAwaitsLink({ sending: false, settledAt: 10, linkUpdatedAt: 11 }),
  ).toBe(false)
})

test("failed, disabled, fetching and paused proof reads hide cached money", () => {
  const data = verified()
  for (const patch of [
    { enabled: false },
    { status: "error" as const },
    { status: "pending" as const },
    { fetchStatus: "fetching" as const },
    { fetchStatus: "paused" as const },
  ]) {
    expect(
      provenFunds({
        enabled: true,
        status: "success",
        fetchStatus: "idle",
        data,
        ...patch,
      }),
    ).toBeUndefined()
  }
  expect(
    provenFunds({
      enabled: true,
      status: "success",
      fetchStatus: "idle",
      data,
    }),
  ).toBe(data)
  expect(refundIdentity(unlinked)).toEqual({ kind: "verified" })
  expect(refundIdentity(undefined)).toEqual({ kind: "none" })
})

const trpcFailure = (code: string, message: string) =>
  TRPCClientError.from({ error: { message, code: -32000, data: { code } } })

test("a lost answer retries the same key and payload; only the server marks it applied", async () => {
  const command = newCreditCommand({
    paymentAttemptId: "attempt_1",
    snapshot: {
      expectedRevision: "7",
      expectedOrderTotalMinor: "1500000",
      expectedOrderPaidMinor: "0",
    },
    amountMinor: 300_000,
  })
  const sent: unknown[] = []
  const answers: Array<() => Promise<{ id: string; appliedMinor: string }>> = [
    () => Promise.reject(new TypeError("Failed to fetch")),
    () => Promise.reject(trpcFailure("FORBIDDEN", "Verify")),
    () => Promise.resolve({ id: "cmd_1", appliedMinor: "300000" }),
  ]
  const client = {
    businessBanking: {
      applyCustomerCredit: {
        mutate: (input: unknown) => {
          sent.push(input)
          const next = answers.shift()
          if (!next) throw new Error("unexpected request")
          return next()
        },
      },
    },
  }
  const first = await sendCreditCommand({
    client,
    token: "link-token",
    command,
  })
  expect(first.kind).toBe("unknown")
  const second = await sendCreditCommand({
    client,
    token: "link-token",
    command,
  })
  expect(second).toEqual({
    kind: "unknown",
    message: "Sign in again to check whether your credit was used.",
  })
  const third = await sendCreditCommand({
    client,
    token: "link-token",
    command,
  })
  expect(third).toEqual({
    kind: "applied",
    command: { ...command, result: { id: "cmd_1", appliedMinor: "300000" } },
  })
  expect(sent).toHaveLength(3)
  for (const input of sent)
    expect(input).toEqual({ token: "link-token", ...command.request })
})

test("a conflict preserves an unknown operation for exact-key recovery", async () => {
  const command = newCreditCommand({
    paymentAttemptId: "attempt_1",
    snapshot: {
      expectedRevision: "7",
      expectedOrderTotalMinor: "1500000",
      expectedOrderPaidMinor: "0",
    },
    amountMinor: 300_000,
  })
  const refusing = (code: string) => ({
    businessBanking: {
      applyCustomerCredit: {
        mutate: () =>
          Promise.reject(
            trpcFailure(
              code,
              "Customer funds or the Order changed. Review the credit amount again.",
            ),
          ),
      },
    },
  })
  expect(
    await sendCreditCommand({
      client: refusing("CONFLICT"),
      token: "t",
      command,
    }),
  ).toEqual({
    kind: "unknown",
    message:
      "Your credit or this order changed, so we can't tell yet whether this credit was used.",
  })
  for (const code of ["BAD_REQUEST", "INTERNAL_SERVER_ERROR", "NOT_FOUND"])
    expect(
      (await sendCreditCommand({ client: refusing(code), token: "t", command }))
        .kind,
    ).toBe("unknown")
})
