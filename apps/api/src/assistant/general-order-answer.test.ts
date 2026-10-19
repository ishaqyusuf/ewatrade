import { expect, test } from "bun:test"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import {
  generalOrderAnswer,
  generalOrderPageAnswers,
  generalOrderReadAnswers,
} from "./general-order-answer"

const asOf = "2026-10-15T10:00:00.000Z"
const order = {
  id: "private-order",
  orderNumber: "ORD-1042",
  currencyCode: "NGN",
  totalMinor: "9007199254740993123",
  balanceDueMinor: "2500",
  status: "CONFIRMED",
  paymentStatus: "PARTIAL",
  customerName: "Amina",
  createdAt: "2026-10-15T09:00:00Z",
}

test("order pages save matching order identities with exact per-currency amounts and page boundaries", () => {
  const answers = generalOrderPageAnswers(
    {
      items: [
        order,
        {
          ...order,
          id: "other",
          orderNumber: "ORD-1043",
          currencyCode: "USD",
          totalMinor: "199",
        },
      ],
      nextCursor: "private-next",
    },
    {
      storeName: "Main Store",
      createdAfter: "2026-10-01T00:00:00Z",
      createdBefore: "2026-10-16T00:00:00Z",
      query: "Amina",
      queryMode: "customer",
      statuses: ["CONFIRMED"],
      ownOrders: true,
      asOf,
    },
  )
  expect(answers).toHaveLength(3)
  expect(answers[0]?.detail).toContain("More results")
  expect(answers[0]?.detail).toContain("not a business total")
  expect(answers[0]?.detail).toContain("2026-10-16T00:00:00Z (exclusive)")
  expect(answers[0]?.scope).toContain("Your orders")
  expect(answers[1]?.title).toBe("ORD-1042")
  expect(answers[1]?.value).toBe("₦90,071,992,547,409,931.23")
  expect(answers[2]?.value).toContain("1.99")
  expect(
    answers.every(
      (answer) =>
        answer.asOf === asOf && generalAnswerSchema.safeParse(answer).success,
    ),
  ).toBe(true)
  expect(JSON.stringify(answers)).not.toContain("private-next")
})

test("saved order read retains exact original line units, payment/refund timing and customer-credit distinction", () => {
  const answers = generalOrderReadAnswers(
    {
      ...order,
      lines: [
        {
          quantity: "9007199254740993.125",
          totalMinor: "125",
          snapshot: {
            catalogItemName: "Eggs",
            variantName: "Large",
            offeringName: "Crate",
            inventoryUnitName: "crates",
          },
        },
      ],
      payments: [
        {
          amountMinor: "125",
          method: "CASH",
          type: "PAYMENT",
          recordedAt: "2026-10-15T08:00:00Z",
        },
        {
          amountMinor: "25",
          method: "BANK_TRANSFER",
          type: "REFUND",
          recordedAt: "2026-10-15T09:00:00Z",
        },
        {
          amountMinor: "100",
          method: "CUSTOMER_CREDIT",
          type: "PAYMENT",
          recordedAt: "2026-10-15T09:30:00Z",
        },
      ],
    },
    "Main Store",
    asOf,
  )
  expect(answers.find((answer) => answer.title === "1. Eggs")?.value).toBe(
    "9007199254740993.125 crates",
  )
  expect(
    answers.find((answer) => answer.title === "Recorded refund")?.detail,
  ).toContain("2026-10-15T09:00:00.000Z")
  expect(
    answers.find((answer) => answer.title === "Recorded refund")?.value,
  ).toBe("₦0.25")
  expect(
    answers.find(
      (answer) => answer.title === "Recorded customer-credit application",
    )?.detail,
  ).toContain("not new money received")
  expect(
    answers.find((answer) => answer.title.includes("recorded payments"))
      ?.detail,
  ).toContain("not bank settlement")
  expect(
    answers.every(
      (answer) =>
        answer.asOf === asOf && generalAnswerSchema.safeParse(answer).success,
    ),
  ).toBe(true)
})

test("bounded detail states omitted lines/payments and missing units without inferring zero or total", () => {
  const answers = generalOrderReadAnswers(
    {
      ...order,
      lines: Array.from({ length: 11 }, () => ({
        quantity: "1.125",
        totalMinor: 25,
        snapshot: null,
      })),
      payments: Array.from({ length: 11 }, (_, index) => ({
        amountMinor: index + 1,
        method: "CASH",
        type: "PAYMENT",
        recordedAt: asOf,
      })),
    },
    "Shop",
    asOf,
  )
  expect(
    answers.find((answer) => answer.title.includes("· items"))?.detail,
  ).toContain("More original lines")
  expect(
    answers.find((answer) => answer.title.includes("recorded payments"))
      ?.detail,
  ).toContain("Only the last ten")
  expect(answers.find((answer) => answer.title.startsWith("1."))?.value).toBe(
    "1.125 unit not recorded",
  )
  expect(
    answers.filter((answer) => answer.title === "Recorded payment"),
  ).toHaveLength(10)
  expect(
    answers.every((answer) => generalAnswerSchema.safeParse(answer).success),
  ).toBe(true)
  expect(
    generalOrderAnswer({ ...order, status: "CANCELLED" }, "Shop", asOf).detail,
  ).toContain("unpaid ₦0.00")
  expect(() =>
    generalOrderAnswer(
      { ...order, totalMinor: Number.MAX_SAFE_INTEGER + 1 },
      "Shop",
      asOf,
    ),
  ).toThrow("Exact recorded amount")
})
