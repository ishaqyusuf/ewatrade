import { expect, test } from "bun:test"
import { projectServicePayment } from "./service-payment-model"

const job = {
  summary: "ready_for_handoff" as const,
  handedOffAt: null,
  balanceDueMinor: 100_000_000,
}
const fields = {
  amount: "1.20",
  method: "cash" as const,
  reference: "Counter payment",
}

test("service payments convert valid unsigned decimals exactly within the existing limit", () => {
  for (const [amount, minor] of [
    ["0.01", 1],
    ["1.2", 120],
    ["1.23", 123],
    [" 2500.05 ", 250005],
    ["0001.20", 120],
    ["1000000.00", 100_000_000],
  ] as const)
    expect(
      projectServicePayment(job, "payment", { ...fields, amount }),
    ).toEqual({ amountMinor: minor, error: null })
})
test("malformed, signed, exponent, symbol and excessive-precision amounts refuse without normalization", () => {
  for (const amount of [
    "1.001",
    "0.001",
    "1e3",
    "1E3",
    "NaN",
    "Infinity",
    "-1",
    "-0",
    "+1",
    "₦1",
    "$1.20",
    "1,000.00",
    "1 000",
    "1..20",
    "1.",
    ".50",
    "1000000.01",
    "9007199254740991",
    "9999999999999999999999999",
  ])
    expect(
      projectServicePayment(job, "payment", { ...fields, amount }).amountMinor,
    ).toBeNull()
})
test("recorded payments still require positive amount no greater than outstanding balance", () => {
  for (const amount of ["", " ", "0", "0.00", "1.01"])
    expect(
      projectServicePayment({ ...job, balanceDueMinor: 100 }, "payment", {
        ...fields,
        amount,
      }).amountMinor,
    ).toBeNull()
  expect(
    projectServicePayment({ ...job, balanceDueMinor: 100 }, "payment", {
      ...fields,
      amount: "1.00",
    }),
  ).toEqual({ amountMinor: 100, error: null })
})
test("handoff preserves blank/zero semantics and requires exactly the outstanding balance", () => {
  for (const amount of ["", " ", "0", "0.00"])
    expect(
      projectServicePayment({ ...job, balanceDueMinor: 0 }, "handoff", {
        ...fields,
        amount,
      }),
    ).toEqual({ amountMinor: 0, error: null })
  for (const amount of ["", "0", "1.22", "1.24", "1.230"])
    expect(
      projectServicePayment({ ...job, balanceDueMinor: 123 }, "handoff", {
        ...fields,
        amount,
      }).amountMinor,
    ).toBeNull()
  expect(
    projectServicePayment({ ...job, balanceDueMinor: 123 }, "handoff", {
      ...fields,
      amount: "1.23",
    }),
  ).toEqual({ amountMinor: 123, error: null })
})
test("reference and ready/uncollected Job guards retain the owning workflow boundaries", () => {
  expect(
    projectServicePayment(job, "payment", {
      ...fields,
      reference: "x".repeat(161),
    }).amountMinor,
  ).toBeNull()
  expect(
    projectServicePayment(job, "payment", {
      ...fields,
      reference: "x".repeat(160),
    }).amountMinor,
  ).toBe(120)
  expect(
    projectServicePayment({ ...job, summary: "in_progress" }, "handoff", {
      ...fields,
      amount: "1000000",
    }).amountMinor,
  ).toBeNull()
  expect(
    projectServicePayment(
      { ...job, handedOffAt: new Date("2026-10-15T00:00:00Z") },
      "handoff",
      { ...fields, amount: "1000000" },
    ).amountMinor,
  ).toBeNull()
})
