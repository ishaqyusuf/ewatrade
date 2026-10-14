import { expect, test } from "bun:test"
import {
  businessEventCatalog,
  parseBusinessEventPayload,
  presentBusinessEventPayload,
} from "./registry"

test("an original order snapshot keeps customer and event status separate from future current status", () => {
  const event = presentBusinessEventPayload(
    "order.recorded",
    {
      orderId: "order",
      orderNumber: "ORD-009",
      customerLabel: null,
      amount: { minor: "90000", currencyCode: "NGN" },
      status: "CONFIRMED",
    },
    "Ishaq Yusuf",
  )
  expect(event.summary).toBe("Ishaq Yusuf recorded order ORD-009")
  expect(event.detail).toBe("Walk-in")
  expect(event.statusAtEvent).toEqual({ domain: "order", value: "CONFIRMED" })
  expect(event.amount?.minor).toBe("90000")
})

test("invitation events reject secrets and refer to the exact subject without copying email or names", () => {
  const invitation = {
    invitationId: "invite",
    commandId: "invitation-command",
    membershipId: "cashier",
    role: "CASHIER",
  }
  expect(() =>
    parseBusinessEventPayload("staff.invited", {
      ...invitation,
      inviteUrl: "secret",
    }),
  ).toThrow()
  expect(() =>
    parseBusinessEventPayload("staff.invited", {
      ...invitation,
      email: "person@example.com",
    }),
  ).toThrow()
  const event = presentBusinessEventPayload(
    "staff.invited",
    invitation,
    "Amina",
  )
  expect(event.subject?.id).toBe("cashier")
  expect(event.target).toEqual({
    kind: "staff_invitation",
    id: "invitation-command",
  })
  expect(
    presentBusinessEventPayload(
      "staff.invited",
      { ...invitation, commandId: null },
      "Amina",
    ).target,
  ).toEqual({ kind: "staff_member", id: "cashier" })
})

test("recorded cash transfer retains exact money and cannot claim provider completion", () => {
  const event = presentBusinessEventPayload(
    "finance.movement_recorded",
    {
      movementId: "move",
      bookId: "book",
      movementKind: "TRANSFER",
      amount: { minor: "9007199254740993", currencyCode: "USD" },
      fromAccountLabel: "Shop cash",
      toAccountLabel: "Bank",
    },
    "Amina",
  )
  expect(event.summary).toBe("Amina recorded a transfer")
  expect(event.detail).toBe("Shop cash → Bank")
  expect(event.amount?.minor).toBe("9007199254740993")
  expect(() =>
    parseBusinessEventPayload("finance.movement_recorded", {
      movementId: "move",
      bookId: "book",
      movementKind: "COMPLETED",
      amount: { minor: "10", currencyCode: "NGN" },
      fromAccountLabel: null,
      toAccountLabel: "Bank",
    }),
  ).toThrow()
})

test("type catalog does not imply recording or email activation from a schema alone", () => {
  const catalog = businessEventCatalog()
  expect(catalog.every((item) => item.availability === "planned")).toBe(true)
  expect(
    catalog.every((item) => !item.supports.inApp && !item.supports.email),
  ).toBe(true)
  expect(
    businessEventCatalog({ "order.recorded": "recorded" }).find(
      (item) => item.type === "order.recorded",
    )?.supports,
  ).toEqual({ inApp: true, email: false })
  expect(() =>
    businessEventCatalog({ "import.completed": "recorded" }),
  ).toThrow()
  expect(() => parseBusinessEventPayload("import.completed", {})).toThrow()
})

test("payment presentation keeps exact magnitudes while refunds display money out", () => {
  for (const minor of ["0", "15000", "9007199254740993"]) {
    const payload = {
      orderId: "order",
      orderNumber: "ORD-039",
      paymentId: "payment",
      method: "BANK_TRANSFER",
      amount: { minor, currencyCode: "NGN" },
    }
    const payment = presentBusinessEventPayload(
      "payment.recorded",
      payload,
      "Cashier",
    )
    const refund = presentBusinessEventPayload(
      "payment.refund_recorded",
      payload,
      "Cashier",
    )
    expect(payment.amount?.minor).toBe(minor)
    expect(refund.amount?.minor).toBe((-BigInt(minor)).toString())
    expect(payment.detail).toBe("Bank transfer")
    expect(refund.detail).toBe("Bank transfer")
    expect(
      parseBusinessEventPayload("payment.refund_recorded", payload),
    ).toMatchObject({ amount: { minor } })
    expect(payload.amount.minor).toBe(minor)
  }
  expect(
    presentBusinessEventPayload(
      "payment.recorded",
      {
        orderId: "order",
        orderNumber: "ORD-039",
        paymentId: "payment",
        method: "Cash",
        amount: { minor: "1", currencyCode: "NGN" },
      },
      "Cashier",
    ).detail,
  ).toBe("Cash")
})
