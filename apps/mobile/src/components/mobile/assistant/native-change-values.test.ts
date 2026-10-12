import { expect, test } from "bun:test"
import {
  fieldChoice,
  nativeChangeCandidate,
  textPatch,
} from "./native-change-values"

test("price edits use exact minor units and refuse invalid amounts", () => {
  const draft = {
    action: "product_price_update" as const,
    offeringId: "offering-rice-50kg",
    priceMinor: 5_000_000,
    reason: "Supplier increase",
  }
  expect(nativeChangeCandidate(draft, { price: "52,000.50" })).toEqual({
    ok: true,
    payload: { ...draft, priceMinor: 5_200_050 },
  })
  expect(nativeChangeCandidate(draft, { price: "abc" })).toEqual({
    ok: false,
    error: "Enter a valid price.",
  })
  // A blank reason is refused before review, as on the dashboard.
  expect(
    nativeChangeCandidate({ ...draft, reason: " " }, { price: "52000" }).ok,
  ).toBe(false)
})

test("kept, cleared and set details stay distinct", () => {
  expect(fieldChoice(undefined)).toBe("keep")
  expect(fieldChoice(null)).toBe("clear")
  expect(fieldChoice("Grains")).toBe("set")
  expect(textPatch("  ")).toBeNull()
  const kept = nativeChangeCandidate({
    action: "product_details_update",
    catalogItemId: "item-rice",
    description: null,
  })
  expect(kept).toEqual({
    ok: true,
    payload: {
      action: "product_details_update",
      catalogItemId: "item-rice",
      description: null,
    },
  })
  // Nothing changed is refused rather than sent as an empty update.
  expect(
    nativeChangeCandidate({
      action: "product_identifiers_update",
      offeringId: "offering-rice-50kg",
    }),
  ).toEqual({ ok: false, error: "Change at least one identifier." })
})

test("order metadata needs a real delivery time when one is set", () => {
  const draft = {
    action: "order_metadata_update" as const,
    orderId: "order-1042",
    reason: "Customer asked to move delivery",
    patch: { deliveryDueAt: "2026-10-14T09:00:00.000Z" },
  }
  expect(nativeChangeCandidate(draft, { deliveryDueAt: null })).toEqual({
    ok: false,
    error: "Choose a delivery date and time.",
  })
  expect(
    nativeChangeCandidate(draft, {
      deliveryDueAt: new Date("2026-10-15T10:30:00.000Z"),
    }),
  ).toEqual({
    ok: true,
    payload: {
      ...draft,
      patch: { deliveryDueAt: "2026-10-15T10:30:00.000Z" },
    },
  })
  // Clearing keeps null; keeping every field is refused.
  expect(
    nativeChangeCandidate({ ...draft, patch: { deliveryDueAt: null } }).ok,
  ).toBe(true)
  expect(nativeChangeCandidate({ ...draft, patch: {} })).toEqual({
    ok: false,
    error: "Choose at least one field to change.",
  })
})

test("cancellation needs a reason and never carries refund fields", () => {
  expect(
    nativeChangeCandidate({
      action: "order_cancel",
      orderId: "order-1042",
      reason: "",
    }).ok,
  ).toBe(false)
  const injected = nativeChangeCandidate({
    action: "order_cancel",
    orderId: "order-1042",
    reason: "Duplicate order",
    refundMinor: 500,
  } as never)
  expect(injected.ok).toBe(false)
})
