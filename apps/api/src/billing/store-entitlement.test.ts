import { describe, expect, test } from "bun:test"
import {
  type VerifiedStoreEntitlement,
  projectStoreEntitlement,
} from "./store-entitlement"
import { getStoreProducts } from "./store-products"

const now = new Date("2026-09-24T12:00:00Z")
const entitlement: VerifiedStoreEntitlement = {
  provider: "app_store",
  purchaseId: "original",
  productId: "plan",
  accountToken: "account",
  purchasedAt: new Date("2026-09-01"),
  expiresAt: new Date("2026-10-01"),
  autoRenew: true,
  revoked: false,
  environment: "sandbox",
}
describe("store entitlement authority", () => {
  test("a cancelled renewal preserves already paid access until expiry", () => {
    expect(
      projectStoreEntitlement({ ...entitlement, autoRenew: false }, now),
    ).toEqual({ status: "active", cancelAtPeriodEnd: true })
  })
  test("revocation removes access even before expiry", () => {
    expect(
      projectStoreEntitlement({ ...entitlement, revoked: true }, now).status,
    ).toBe("cancelled")
  })
  test("expired receipts never grant active access", () => {
    expect(
      projectStoreEntitlement({ ...entitlement, expiresAt: now }, now).status,
    ).toBe("cancelled")
  })
  test("invalid expiry cannot grant access", () => {
    expect(() =>
      projectStoreEntitlement(
        { ...entitlement, expiresAt: new Date("invalid") },
        now,
      ),
    ).toThrow()
  })
  test("unknown plan and duplicate mappings fail closed", () => {
    expect(() =>
      getStoreProducts(
        '[{"store":"app_store","productId":"x","planId":"admin"}]',
      ),
    ).toThrow()
    const product = { store: "app_store", productId: "x", planId: "pro" }
    expect(() => getStoreProducts(JSON.stringify([product, product]))).toThrow()
  })
  test("whitespace in a product ID cannot create an unmatchable receipt mapping", () => {
    expect(() =>
      getStoreProducts(
        JSON.stringify([
          { store: "app_store", productId: " growth.ios", planId: "growth" },
        ]),
      ),
    ).toThrow()
  })
})
