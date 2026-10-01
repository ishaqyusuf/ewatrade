import { expect, test } from "bun:test"
import {
  completeStorePurchase,
  restoreMappedStorePurchases,
} from "./store-purchase-reconciliation"

test("does not finish or refresh a purchase the server could not verify", async () => {
  const calls: string[] = []
  await expect(
    completeStorePurchase({
      verify: async () => {
        calls.push("verify")
        throw new Error("server unavailable")
      },
      finish: async () => {
        calls.push("finish")
      },
      refresh: async () => {
        calls.push("refresh")
      },
    }),
  ).rejects.toThrow("server unavailable")
  expect(calls).toEqual(["verify"])
})

test("refreshes verified access even when store finalization needs a retry", async () => {
  const calls: string[] = []
  const result = await completeStorePurchase({
    verify: async () => {
      calls.push("verify")
    },
    finish: async () => {
      calls.push("finish")
      throw new Error("store unavailable")
    },
    refresh: async () => {
      calls.push("refresh")
    },
  })
  expect(result).toEqual({ storeFinished: false, refreshed: true })
  expect(calls).toEqual(["verify", "finish", "refresh"])
})

test("does not confuse a failed cache refresh with failed store verification", async () => {
  const result = await completeStorePurchase({
    verify: async () => undefined,
    finish: async () => undefined,
    refresh: async () => {
      throw new Error("cache unavailable")
    },
  })
  expect(result).toEqual({ storeFinished: true, refreshed: false })
})

test("restore refuses store history when the fresh server catalog is unavailable", async () => {
  const calls: string[] = []
  const outcome = await restoreMappedStorePurchases({
    store: "play_store",
    loadProducts: async () => {
      calls.push("catalog")
      return null
    },
    listPurchases: async () => {
      calls.push("store")
      return [{ productId: "growth", purchaseState: "purchased" }]
    },
    reconcile: async () => {
      calls.push("reconcile")
    },
  })
  expect(outcome).toBe("catalog_unavailable")
  expect(calls).toEqual(["catalog"])
})

test("restore verifies only purchases mapped to the current store", async () => {
  const calls: string[] = []
  const products = [
    { store: "play_store", productId: "growth" },
    { store: "app_store", productId: "pro" },
  ]
  const outcome = await restoreMappedStorePurchases({
    store: "play_store",
    loadProducts: async () => {
      calls.push("catalog")
      return products
    },
    listPurchases: async () => {
      calls.push("store")
      return [
        { productId: "growth", purchaseState: "pending" },
        { productId: "pro", purchaseState: "purchased" },
        { productId: "growth", purchaseState: "purchased" },
      ]
    },
    reconcile: async (purchase, mapped) => {
      calls.push(`reconcile:${purchase.productId}`)
      expect(mapped).toBe(products)
    },
  })
  expect(outcome).toBe("restored")
  expect(calls).toEqual(["catalog", "store", "reconcile:growth"])
})

test("restore reports an unmapped catalog before reading store history", async () => {
  let storeRead = false
  const outcome = await restoreMappedStorePurchases({
    store: "play_store",
    loadProducts: async () => [{ store: "app_store", productId: "growth" }],
    listPurchases: async () => {
      storeRead = true
      return []
    },
    reconcile: async () => undefined,
  })
  expect(outcome).toBe("unmapped")
  expect(storeRead).toBe(false)
})
