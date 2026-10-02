import { expect, test } from "bun:test"
import {
  financePurchasePaymentReversalSchema,
  financePurchasePaymentSchema,
  financeSupplierAllocationReleaseSchema,
  financeSupplierAllocationSchema,
} from "../../../../../api/src/schemas/finance-purchases"
import {
  preparePurchasePayment,
  preparePurchasePaymentReversal,
  prepareSupplierAdvanceAllocation,
  prepareSupplierAllocationRelease,
} from "./supplier-purchase-settlement-state"

test("native supplier purchase settlement payloads match the strict finance API contracts", () => {
  const clientCommandId = "native-settlement-contract"
  const payment = {
    ...preparePurchasePayment({
      bookId: "book-1",
      billId: "bill-1",
      amount: "12.34",
      outstandingMinor: "2000",
      moneyAccountId: "cash-1",
      description: "Part payment",
      reference: "ref-1",
      date: "2026-10-02",
      minimumAt: "2026-10-01T00:00:00.000Z",
      today: "2026-10-02",
    }),
    clientCommandId,
  }
  expect(financePurchasePaymentSchema.parse(payment)).toEqual(payment)

  const paymentReversal = {
    ...preparePurchasePaymentReversal({
      bookId: "book-1",
      paymentId: "payment-1",
      reason: "Duplicate payment",
      date: "2026-10-02",
      paymentAt: "2026-10-02T10:00:00.000Z",
      latestBillEntryAt: "2026-10-01T10:00:00.000Z",
      today: "2026-10-02",
    }),
    clientCommandId,
  }
  expect(financePurchasePaymentReversalSchema.parse(paymentReversal)).toEqual(
    paymentReversal,
  )

  const allocation = {
    ...prepareSupplierAdvanceAllocation({
      bookId: "book-1",
      billId: "bill-1",
      advanceEntryId: "advance-1",
      amount: "8.00",
      availableMinor: "1000",
      outstandingMinor: "900",
      description: "Apply supplier advance",
      date: "2026-10-02",
      latestBillEntryAt: "2026-10-01T10:00:00.000Z",
      advanceEffectiveAt: "2026-10-01T12:00:00.000Z",
      latestAdvanceSettlementAt: "2026-10-01T15:00:00.000Z",
      today: "2026-10-02",
    }),
    clientCommandId,
  }
  expect(financeSupplierAllocationSchema.parse(allocation)).toEqual(allocation)

  const release = {
    ...prepareSupplierAllocationRelease({
      bookId: "book-1",
      allocationId: "allocation-1",
      amount: "2.50",
      unreleasedMinor: "300",
      reason: "Return to supplier advance",
      date: "2026-10-02",
      allocationAt: "2026-10-01T10:00:00.000Z",
      latestBillEntryAt: "2026-10-01T11:00:00.000Z",
      latestAdvanceSettlementAt: "2026-10-01T12:00:00.000Z",
      today: "2026-10-02",
    }),
    clientCommandId,
  }
  expect(financeSupplierAllocationReleaseSchema.parse(release)).toEqual(release)
})
