import { describe, expect, test } from "bun:test"
import {
  type PaymentAlertMember,
  maskPaymentAlertDestination,
  paymentAlertCanReview,
  paymentAlertDestination,
  paymentAlertRecipients,
} from "./manual-payment-alert-rules"

const member = (
  changes: Partial<PaymentAlertMember> = {},
): PaymentAlertMember => ({
  userId: "staff-a",
  role: "MANAGER",
  status: "ACTIVE",
  staffAccessMode: "SCOPED",
  staffStoreAssignments: [{ storeId: "store-a", status: "ACTIVE" }],
  user: {
    name: "Aisha",
    email: "aisha@example.test",
    emailVerified: true,
    phone: "+2348180000000",
    phoneVerifiedAt: new Date(),
  },
  ...changes,
})
describe("bank payment alert staff authority", () => {
  test("current scope and role determine access, not selection", () => {
    expect(paymentAlertCanReview(member(), "store-a")).toBe(true)
    expect(paymentAlertCanReview(member(), "store-b")).toBe(false)
    expect(
      paymentAlertCanReview(member({ status: "SUSPENDED" }), "store-a"),
    ).toBe(false)
    expect(paymentAlertCanReview(member({ role: "VIEWER" }), "store-a")).toBe(
      false,
    )
    expect(
      paymentAlertCanReview(
        member({ role: "OWNER", staffStoreAssignments: [] }),
        "store-b",
      ),
    ).toBe(true)
    expect(paymentAlertCanReview(member({ staffStoreAssignments: [] }))).toBe(
      false,
    )
  })
  test("verified valid contact required independently per channel", () => {
    const row = member()
    expect(paymentAlertDestination(row, "email")).toBe("aisha@example.test")
    expect(paymentAlertDestination(row, "whatsapp")).toBe("+2348180000000")
    expect(
      paymentAlertDestination(
        { ...row, user: { ...row.user, emailVerified: false } },
        "email",
      ),
    ).toBeNull()
    expect(
      paymentAlertDestination(
        { ...row, user: { ...row.user, phoneVerifiedAt: null } },
        "whatsapp",
      ),
    ).toBeNull()
    expect(
      paymentAlertDestination(
        { ...row, user: { ...row.user, phone: "08180000000" } },
        "whatsapp",
      ),
    ).toBeNull()
    expect(
      paymentAlertDestination(
        { ...row, user: { ...row.user, email: "a@x.test\nBcc:victim@x.test" } },
        "email",
      ),
    ).toBeNull()
  })
  test("one missing or unauthorized staff blocks the whole group", () => {
    const selection = {
      recipientUserIds: ["staff-a", "staff-b"],
      channel: "email" as const,
      expectedRevision: 0,
    }
    expect(() =>
      paymentAlertRecipients([member()], selection, "store-a"),
    ).toThrow("access")
    const second = member({ userId: "staff-b" })
    expect(
      paymentAlertRecipients([member(), second], selection, "store-a"),
    ).toHaveLength(2)
    expect(() =>
      paymentAlertRecipients(
        [
          member(),
          { ...second, user: { ...second.user, emailVerified: false } },
        ],
        selection,
      ),
    ).toThrow("verified")
    expect(() =>
      paymentAlertRecipients([member()], {
        ...selection,
        recipientUserIds: ["staff-a", "staff-a"],
      }),
    ).toThrow("different")
    expect(() =>
      paymentAlertRecipients([], { ...selection, recipientUserIds: [] }),
    ).toThrow("Choose")
  })
  test("UI contacts are masked and never invented", () => {
    expect(maskPaymentAlertDestination("aisha@example.test", "email")).toBe(
      "a•••@example.test",
    )
    expect(maskPaymentAlertDestination("+2348180000000", "whatsapp")).toBe(
      "•••• 0000",
    )
    expect(maskPaymentAlertDestination(null, "email")).toBeNull()
  })
})
