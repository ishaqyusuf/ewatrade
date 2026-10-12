import { expect, test } from "bun:test"
import type { GeneralReceipt } from "@ewatrade/assistant/general/contracts"
import { currentGeneralReceipt } from "./general-legacy-receipt"

const receipt = (kind: string, title: string, detail: string) =>
  ({ kind, recordId: "r1", title, detail }) as GeneralReceipt
const detail = (value: GeneralReceipt) =>
  "detail" in value ? value.detail : undefined

test("legacy payment receipts read in the current money form", () => {
  expect(
    detail(
      currentGeneralReceipt(
        receipt(
          "payment",
          "Payment recorded",
          "NGN 300.00 · cash · remaining 100.00",
        ),
      ),
    ),
  ).toBe("₦300.00 · cash · remaining ₦100.00")
  expect(
    detail(
      currentGeneralReceipt(
        receipt(
          "payment",
          "Payment recorded",
          "NGN 4500.00 · bank transfer · remaining 0.00",
        ),
      ),
    ),
  ).toBe("₦4,500.00 · bank transfer · remaining ₦0.00")
})

test("legacy sale and price receipts read in the current money form", () => {
  expect(
    detail(
      currentGeneralReceipt(
        receipt(
          "order",
          "Order created",
          "ORD-017 · total NGN 400.00 · received 300.00 · remaining 100.00",
        ),
      ),
    ),
  ).toBe("ORD-017 · total ₦400.00 · received ₦300.00 · remaining ₦100.00")
  expect(
    detail(
      currentGeneralReceipt(
        receipt(
          "product",
          "Product price updated",
          "Quail Eggs · Tray · NGN 2400.00",
        ),
      ),
    ),
  ).toBe("Quail Eggs · Tray · ₦2,400.00")
})

test("current and unrelated receipts stay exactly as saved", () => {
  for (const value of [
    receipt(
      "payment",
      "Payment recorded",
      "₦300.00 · cash · remaining ₦100.00",
    ),
    receipt("order", "Order created", "ORD-017"),
    receipt("customer", "Customer updated", "Bola QA Test · email changed"),
    receipt("product", "Product added", "NGN 2400.00 pack · NGN 12.00"),
  ])
    expect(currentGeneralReceipt(value)).toBe(value)
})
