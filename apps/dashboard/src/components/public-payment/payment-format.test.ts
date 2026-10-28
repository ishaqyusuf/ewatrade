import { expect, test } from "bun:test"
import {
  copyableAmount,
  paymentDetailsText,
  transferReference,
} from "./payment-format"

const bank = {
  name: "GTBank",
  accountNumber: "0012345678",
  accountHolder: "EwaTrade ManualQA",
}

test("links without a saved reference keep the order number as narration", () => {
  expect(transferReference({ orderNumber: "ORD-059" })).toEqual({
    label: "Narration",
    value: "ORD-059",
  })
  expect(
    transferReference({ orderNumber: "ORD-059", paymentReference: "  " }),
  ).toEqual({ label: "Narration", value: "ORD-059" })
})

test("a saved payment reference replaces the order number", () => {
  expect(
    transferReference({
      orderNumber: "ORD-059",
      paymentReference: "EWA-7K4P9D2Q",
    }),
  ).toEqual({ label: "Payment reference / narration", value: "EWA-7K4P9D2Q" })
})

test("payment details carry the exact account, amount and narration", () => {
  const link = { bank, currencyCode: "NGN", orderNumber: "ORD-059" }
  const text = paymentDetailsText({ link, amountMinor: 1_500_050 })
  const lines = text.split("\n")
  expect(lines[0]).toBe("GTBank · 0012345678 · EwaTrade ManualQA")
  expect(lines[1]).toStartWith("Amount: ")
  expect(lines[1]).toContain("15,000.50")
  expect(lines[2]).toBe("Narration: ORD-059")
})

test("payment details omit an unknown or empty amount", () => {
  const link = {
    bank,
    currencyCode: "NGN",
    orderNumber: "ORD-059",
    paymentReference: "EWA-7K4P9D2Q",
  }
  for (const amountMinor of [null, 0]) {
    expect(paymentDetailsText({ link, amountMinor })).toBe(
      "GTBank · 0012345678 · EwaTrade ManualQA\nReference: EWA-7K4P9D2Q",
    )
  }
})

test("the hero copies the exact digits a banking app accepts", () => {
  expect(copyableAmount(1_500_000)).toBe("15000")
  expect(copyableAmount(1_500_050)).toBe("15000.50")
})
