import { expect, test } from "bun:test"
import { refundCustomerNotice, refundDetailsDraft } from "./refund-notice-model"

const completed = {
  status: "COMPLETED",
  amountMinor: "500000",
  currencyCode: "NGN",
  customerName: " Amina Bello ",
  completedAt: new Date("2026-10-28T10:00:00.000Z"),
  refundEntryId: "entry-refund",
  outgoingReference: " RF26300QX91 ",
}

test("a saved completed refund gives a message from its saved result only", () => {
  const text = refundCustomerNotice(completed)
  expect(text).toBe(
    "Hi Amina Bello, your ₦5,000 refund has been returned to your bank account. Bank reference: RF26300QX91.",
  )
  expect(text).not.toContain("entry-refund")
  expect(
    refundCustomerNotice({
      ...completed,
      amountMinor: "500001",
      customerName: " ",
    }),
  ).toBe(
    "Your ₦5,000.01 refund has been returned to your bank account. Bank reference: RF26300QX91.",
  )
})

test("no message until the server has recorded the completed return", () => {
  for (const status of ["REQUESTED", "RESERVED", "CANCELLED", "completed"])
    expect(refundCustomerNotice({ ...completed, status })).toBeNull()
  expect(refundCustomerNotice({ ...completed, completedAt: null })).toBeNull()
  expect(refundCustomerNotice({ ...completed, refundEntryId: null })).toBeNull()
  expect(
    refundCustomerNotice({ ...completed, outgoingReference: "  " }),
  ).toBeNull()
  expect(refundCustomerNotice({ ...completed, amountMinor: "0" })).toBeNull()
})

const asked = {
  status: "REQUESTED",
  reviewState: "NEEDS_DETAILS",
  reviewNote: " Please confirm the account holder's name. ",
  amountMinor: "500000",
  currencyCode: "NGN",
  customerName: "Amina Bello",
}

test("a details draft uses the saved review note only while details are needed", () => {
  expect(refundDetailsDraft(asked)).toBe(
    "Hi Amina Bello, before we can return your ₦5,000 refund, we need a few more details: Please confirm the account holder's name.",
  )
  expect(refundDetailsDraft({ ...asked, reviewNote: "  " })).toBeNull()
  expect(refundDetailsDraft({ ...asked, reviewNote: null })).toBeNull()
  expect(refundDetailsDraft({ ...asked, reviewState: "REQUESTED" })).toBeNull()
  expect(refundDetailsDraft({ ...asked, status: "RESERVED" })).toBeNull()
})
