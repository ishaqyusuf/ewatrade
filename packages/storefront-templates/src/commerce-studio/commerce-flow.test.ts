import { expect, test } from "bun:test"
import {
  type BagLine,
  addBagLine,
  bagTotals,
  clearCheckoutDraft,
  readCheckoutDraft,
  writeCheckoutDraft,
} from "./commerce"

const crate: BagLine = {
  itemId: "eggs",
  offeringId: "small-crate",
  itemName: "Eggs",
  optionName: "Small",
  quantity: "4",
  priceMinor: 450000,
  currencyCode: "NGN",
  unitLabel: "Crate",
  scale: 2,
  illustrationId: "ill-egg-tray",
  photoUrl: null,
}

test("merging a bag cannot silently change purchase intent or its promised request date", () => {
  const ahead: BagLine = {
    ...crate,
    intent: "preorder",
    preferredDate: "2026-11-05",
  }
  expect(() => addBagLine([crate], ahead)).toThrow("different date or purpose")
  expect(() =>
    addBagLine([ahead], { ...ahead, preferredDate: "2026-11-06" }),
  ).toThrow("different date or purpose")
  const merged = addBagLine([ahead], { ...ahead, quantity: "0.5" })
  expect(merged[0]).toMatchObject({
    quantity: "4.5",
    intent: "preorder",
    preferredDate: "2026-11-05",
  })
  expect(bagTotals(merged).subtotal).toBe(2025000)
  expect(crate.quantity).toBe("4")
})

test("a checkout draft survives an account round trip only in its own scope and clears after submit", () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
  const draft = {
    customerName: "QA Customer",
    customerPhone: "08031234567",
    customerEmail: "qa@example.test",
    fulfilment: "delivery" as const,
    deliveryAddress: "",
    notes: "Four crates",
  }
  writeCheckoutDraft(storage, "jawdah", draft)
  expect(readCheckoutDraft(storage, "jawdah")).toEqual(draft)
  expect(readCheckoutDraft(storage, "another-store")).toBeNull()
  clearCheckoutDraft(storage, "jawdah")
  expect(readCheckoutDraft(storage, "jawdah")).toBeNull()
  expect(readCheckoutDraft(null, "jawdah")).toBeNull()
  // Fulfilment alone is still a choice worth restoring after viewing an item.
  writeCheckoutDraft(storage, "jawdah", {
    ...draft,
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    notes: "",
  })
  expect(readCheckoutDraft(storage, "jawdah")?.fulfilment).toBe("delivery")
})
