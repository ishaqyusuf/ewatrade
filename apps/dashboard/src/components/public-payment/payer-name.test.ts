import { expect, test } from "bun:test"
import { initialPayerName, payerNameProblem } from "./payer-name"

test("the payer field starts with the order's saved customer name", () => {
  expect(
    initialPayerName({ record: null, customerName: "  Ishaq Yusuf " }),
  ).toBe("Ishaq Yusuf")
})

test("no saved name, or a walk-in placeholder, starts the field empty", () => {
  for (const customerName of [
    null,
    "",
    "   ",
    "Walk-in",
    "walk-in customer",
    "Walk in Customer",
    "Walk-in (staff)",
  ])
    expect(initialPayerName({ record: null, customerName })).toBe("")
})

test("an unfinished report's name wins over the saved customer name", () => {
  expect(
    initialPayerName({
      record: { payerName: "Aisha Yusuf", reportToken: null },
      customerName: "Ishaq Yusuf",
    }),
  ).toBe("Aisha Yusuf")
})

test("a report that already reached the business doesn't prefill a new one", () => {
  expect(
    initialPayerName({
      record: { payerName: "Aisha Yusuf", reportToken: "proof" },
      customerName: "Ishaq Yusuf",
    }),
  ).toBe("Ishaq Yusuf")
  expect(
    initialPayerName({
      record: { payerName: "Aisha Yusuf", reportToken: "proof" },
      customerName: null,
    }),
  ).toBe("")
})

test("the name is required and limited like the server", () => {
  expect(payerNameProblem("  ")).toBe(
    "Enter your name so they can find your transfer.",
  )
  expect(payerNameProblem("x".repeat(161))).toBe("Use up to 160 characters.")
  expect(payerNameProblem("Ishaq Yusuf")).toBeNull()
})
