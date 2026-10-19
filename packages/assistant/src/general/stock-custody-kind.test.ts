import { expect, test } from "bun:test"
import {
  type CustodySource,
  custodyMoveKind,
} from "@ewatrade/assistant/general/stock-custody"

test("shared custody mapping retains exact assignment and former-holder return identities", () => {
  const store: CustodySource = { custodyType: "STORE", custodyReferenceId: "" }
  const staff: CustodySource = {
    custodyType: "STAFF",
    custodyReferenceId: "former-saved-user",
  }
  expect(
    custodyMoveKind(store, { type: "staff", userId: "selected-user" }),
  ).toEqual({ kind: "assignment", staffUserId: "selected-user" })
  expect(custodyMoveKind(staff, { type: "store" })).toEqual({
    kind: "return",
    staffUserId: "former-saved-user",
  })
  expect(store).toEqual({ custodyType: "STORE", custodyReferenceId: "" })
  expect(staff).toEqual({
    custodyType: "STAFF",
    custodyReferenceId: "former-saved-user",
  })
})

test("every no-op, staff-to-staff and unsupported custody path retains its exact existing refusal", () => {
  expect(
    custodyMoveKind(
      { custodyType: "STORE", custodyReferenceId: "" },
      { type: "store" },
    ),
  ).toEqual({ refused: "This stock is already in Store custody." })
  const staff: CustodySource = {
    custodyType: "STAFF",
    custodyReferenceId: "saved-user",
  }
  expect(
    custodyMoveKind(staff, { type: "staff", userId: "saved-user" }),
  ).toEqual({ refused: "This stock is already with that staff member." })
  expect(
    custodyMoveKind(staff, { type: "staff", userId: "another-user" }),
  ).toEqual({
    refused:
      "Stock moves between staff only through the Store: return it first, then assign it.",
  })
  const unsupported: CustodySource[] = [
    { custodyType: "SESSION", custodyReferenceId: "saved-session" },
    { custodyType: "TRANSIT", custodyReferenceId: "saved-transfer" },
  ]
  for (const source of unsupported) {
    expect(custodyMoveKind(source, { type: "store" })).toEqual({
      refused:
        "Session and transit stock move through their own closeout and transfer steps.",
    })
    expect(
      custodyMoveKind(source, { type: "staff", userId: "selected-user" }),
    ).toEqual({
      refused:
        "Session and transit stock move through their own closeout and transfer steps.",
    })
  }
})
