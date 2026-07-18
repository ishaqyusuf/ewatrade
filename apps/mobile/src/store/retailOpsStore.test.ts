import { beforeAll, beforeEach, describe, expect, test } from "bun:test"

type RetailOpsStoreModule = typeof import("./retailOpsStore")
type SubscriptionStoreModule = typeof import("./subscriptionStore")

let useRetailOpsStore: RetailOpsStoreModule["useRetailOpsStore"]
let migrateRetailOpsPersistedState: RetailOpsStoreModule["migrateRetailOpsPersistedState"]
let useSubscriptionStore: SubscriptionStoreModule["useSubscriptionStore"]

function installLocalStorageShim() {
  const storage = new Map<string, string>()
  ;(
    globalThis as typeof globalThis & {
      window: {
        localStorage: {
          getItem: (key: string) => string | null
          removeItem: (key: string) => void
          setItem: (key: string, value: string) => void
        }
      }
    }
  ).window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => {
        storage.delete(key)
      },
      setItem: (key, value) => {
        storage.set(key, value)
      },
    },
  }
}

function resetRetailOpsStore() {
  useRetailOpsStore.setState({
    closeouts: [],
    customers: [],
    hasHydrated: true,
    isOfflineMode: false,
    lastSyncSummary: undefined,
    offlineDeviceId: "device-smoke",
    products: [],
    repSessions: [],
    sales: [],
    shareLinks: [],
    staff: [],
    stockMovements: [],
    syncEvents: [],
  })
}

function resetSubscriptionStore() {
  useSubscriptionStore.setState({
    hasHydrated: true,
    subscriptions: {},
  })
}

function expectEventTypes(types: string[], expectedTypes: string[]) {
  for (const expectedType of expectedTypes) {
    expect(types).toContain(expectedType)
  }
}

describe("mobile retail ops local MVP smoke flow", () => {
  beforeAll(async () => {
    installLocalStorageShim()
    ;({ migrateRetailOpsPersistedState, useRetailOpsStore } = await import(
      "./retailOpsStore"
    ))
    ;({ useSubscriptionStore } = await import("./subscriptionStore"))
  })

  beforeEach(() => {
    resetRetailOpsStore()
    resetSubscriptionStore()
  })

  test("moves through product setup, staff, sale, customer, share-link, closeout, subscription, and sync states", () => {
    const businessId = "business-smoke"

    useRetailOpsStore.getState().setOfflineMode(true)
    useRetailOpsStore.getState().addFirstProduct({
      businessId,
      description: "Premium long-grain rice for shared product previews.",
      imageLinks: [
        "https://cdn.example.com/products/rice-side.png",
        "https://cdn.example.com/products/rice-stack.png",
      ],
      name: "Rice",
      priceMinor: 18_500,
      startingStock: 10,
      syncStatus: "pending",
      unitName: "Bag",
      variants: [
        {
          enabled: true,
          imageLinks: ["https://cdn.example.com/products/rice-half.png"],
          name: "Half bag",
          priceMinor: 9_500,
          startingStock: 0,
          variantLabel: "Size",
        },
      ],
    })

    let state = useRetailOpsStore.getState()
    const product = state.products[0]

    expect(product).toMatchObject({
      businessId,
      currentStock: 10,
      imageLinks: [
        "https://cdn.example.com/products/rice-side.png",
        "https://cdn.example.com/products/rice-stack.png",
      ],
      name: "Rice",
      syncStatus: "pending",
      unitName: "Bag",
    })
    expect(product.variants[0]).toMatchObject({
      currentStock: 0,
      enabled: true,
      imageLinks: ["https://cdn.example.com/products/rice-half.png"],
      name: "Half bag",
      priceMinor: 9_500,
      variantLabel: "Size",
    })
    expect(state.stockMovements[0]).toMatchObject({
      productId: product.id,
      quantity: 10,
      syncStatus: "pending",
      type: "opening_stock",
    })

    useRetailOpsStore.getState().clockInRepSession({
      attendantName: "Ishaq",
      businessId,
      openingInventoryLines: [
        {
          confirmedQuantity: 10,
          expectedQuantity: 10,
          productId: product.id,
          productName: product.name,
          unitName: product.unitName,
        },
      ],
      syncStatus: "pending",
    })
    useRetailOpsStore.getState().inviteStaff({
      businessId,
      email: "ATTENDANT@BUSINESS.COM",
      name: "Aisha",
    })
    const shareLink = useRetailOpsStore.getState().createShareLink({
      businessId,
      productId: product.id,
      productName: product.name,
    })
    useRetailOpsStore.getState().createSale({
      attendantName: "Ishaq",
      businessId,
      customerName: "Amina Retail",
      paymentMethod: "cash",
      productId: product.id,
      productName: product.name,
      quantity: 2,
      syncStatus: "pending",
      unitName: product.unitName,
      unitPriceMinor: product.priceMinor,
    })

    state = useRetailOpsStore.getState()

    expect(state.repSessions[0]).toMatchObject({
      attendantName: "Ishaq",
      status: "open",
      syncStatus: "pending",
    })
    expect(state.staff[0]).toMatchObject({
      email: "attendant@business.com",
      name: "Aisha",
      status: "pending",
      syncStatus: "pending",
    })
    expect(shareLink).toMatchObject({
      productId: product.id,
      productName: "Rice",
      status: "active",
      syncStatus: "pending",
    })
    expect(shareLink.url).toContain("https://storefront.ewatrade.com/products/")
    expect(state.sales[0]).toMatchObject({
      attendantName: "Ishaq",
      customerName: "Amina Retail",
      paymentMethod: "cash",
      productId: product.id,
      quantity: 2,
      syncStatus: "pending",
      totalMinor: 37_000,
    })
    expect(state.products[0].currentStock).toBe(8)
    expect(state.customers[0]).toMatchObject({
      businessId,
      name: "Amina Retail",
      saleCount: 1,
      syncStatus: "pending",
    })

    useRetailOpsStore.getState().createCloseout({
      attendantName: "Ishaq",
      businessId,
      declaredCashMinor: 37_000,
      declaredTransferMinor: 0,
      inventoryLines: [
        {
          declaredQuantity: 8,
          expectedQuantity: 8,
          productId: product.id,
          productName: product.name,
          unitName: product.unitName,
        },
      ],
      syncStatus: "pending",
    })
    useSubscriptionStore.getState().setBusinessPlan(businessId, "growth")

    state = useRetailOpsStore.getState()
    const syncEventTypes = state.syncEvents.map((event) => event.type)

    expect(state.closeouts[0]).toMatchObject({
      approvalStatus: "pending_review",
      cashVarianceMinor: 0,
      expectedCashMinor: 37_000,
      grossSalesMinor: 37_000,
      salesCount: 1,
      syncStatus: "pending",
    })
    expect(state.repSessions[0]).toMatchObject({
      status: "closed",
      syncStatus: "pending",
    })
    expectEventTypes(syncEventTypes, [
      "product_setup",
      "rep_session_opened",
      "staff_invited",
      "share_link_created",
      "sale_created",
      "customer_upsert",
      "closeout_created",
    ])
    expect(state.products[0]).toMatchObject({
      description: "Premium long-grain rice for shared product previews.",
    })
    expect(
      state.syncEvents.every(
        (event) => event.businessId === businessId && event.deviceId,
      ),
    ).toBe(true)
    expect(
      useSubscriptionStore.getState().subscriptions[businessId],
    ).toMatchObject({
      planId: "growth",
      status: "active",
    })

    useRetailOpsStore.getState().recordSyncSummary({
      appliedCount: state.syncEvents.length,
      attemptedAt: "2026-07-12T09:00:00.000Z",
      completedAt: "2026-07-12T09:01:00.000Z",
      deviceId: "device-smoke",
      failedCount: 0,
      skippedCount: 0,
      status: "completed",
      totalCount: state.syncEvents.length,
    })
    useRetailOpsStore.getState().markPendingEventsSynced(businessId)
    useRetailOpsStore.getState().setOfflineMode(false)

    state = useRetailOpsStore.getState()

    expect(state.isOfflineMode).toBe(false)
    expect(state.lastSyncSummary).toMatchObject({
      appliedCount: syncEventTypes.length,
      status: "completed",
    })
    expect(state.syncEvents.every((event) => event.status === "synced")).toBe(
      true,
    )
    expect(state.products.every((item) => item.syncStatus === "synced")).toBe(
      true,
    )
    expect(state.sales.every((sale) => sale.syncStatus === "synced")).toBe(true)
    expect(
      state.customers.every((customer) => customer.syncStatus === "synced"),
    ).toBe(true)
    expect(
      state.staff.every((staffMember) => staffMember.syncStatus === "synced"),
    ).toBe(true)
    expect(state.shareLinks.every((link) => link.syncStatus === "synced")).toBe(
      true,
    )
    expect(
      state.stockMovements.every(
        (movement) => movement.syncStatus === "synced",
      ),
    ).toBe(true)
  })

  test("normalizes stock adjustment direction for production-safe reasons", () => {
    const businessId = "business-stock-adjustment"

    useRetailOpsStore.getState().addFirstProduct({
      businessId,
      name: "Rice",
      priceMinor: 18_500,
      startingStock: 10,
      syncStatus: "synced",
      unitName: "Bag",
      variants: [],
    })

    const product = useRetailOpsStore.getState().products[0]

    useRetailOpsStore.getState().recordStockAdjustment({
      businessId,
      direction: "increase",
      productId: product.id,
      quantity: 2,
      reason: "damage",
      syncStatus: "pending",
    })

    let state = useRetailOpsStore.getState()

    expect(state.products[0].currentStock).toBe(8)
    expect(state.stockMovements[0]).toMatchObject({
      productId: product.id,
      quantity: -2,
      stockAdjustmentReason: "damage",
      type: "stock_adjustment",
    })

    useRetailOpsStore.getState().recordStockAdjustment({
      businessId,
      direction: "decrease",
      productId: product.id,
      quantity: 3,
      reason: "found_stock",
      syncStatus: "pending",
    })

    state = useRetailOpsStore.getState()

    expect(state.products[0].currentStock).toBe(11)
    expect(state.stockMovements[0]).toMatchObject({
      productId: product.id,
      quantity: 3,
      stockAdjustmentReason: "found_stock",
      type: "stock_adjustment",
    })
  })

  test("keeps Service items priced but outside inventory and offline sync", () => {
    const businessId = "business-services"

    useRetailOpsStore.getState().addFirstProduct({
      businessId,
      kind: "service",
      name: "Standard consultation",
      priceMinor: 50_000,
      startingStock: 99,
      syncStatus: "synced",
      unitName: "Standard",
      variants: [],
    })

    const service = useRetailOpsStore.getState().products[0]

    expect(service).toMatchObject({
      currentStock: 0,
      kind: "service",
      priceMinor: 50_000,
      startingStock: 0,
    })
    expect(useRetailOpsStore.getState().stockMovements).toHaveLength(0)

    useRetailOpsStore.getState().recordStockIntake({
      businessId,
      productId: service.id,
      quantity: 4,
      syncStatus: "pending",
    })
    useRetailOpsStore.getState().recordStockAdjustment({
      businessId,
      direction: "increase",
      productId: service.id,
      quantity: 3,
      reason: "correction",
      syncStatus: "pending",
    })
    useRetailOpsStore.getState().createSale({
      attendantName: "Ishaq",
      businessId,
      customerName: "Amina",
      kind: "service",
      paymentMethod: "cash",
      productId: service.id,
      productName: service.name,
      quantity: 2,
      syncStatus: "synced",
      unitName: service.unitName,
      unitPriceMinor: service.priceMinor,
    })

    const state = useRetailOpsStore.getState()

    expect(state.products[0]).toMatchObject({
      currentStock: 0,
      startingStock: 0,
    })
    expect(state.stockMovements).toHaveLength(0)
    expect(state.sales[0]).toMatchObject({
      kind: "service",
      quantity: 2,
      totalMinor: 100_000,
    })
    expect(state.sales[0]?.repSessionId).toBeUndefined()
    expect(state.syncEvents).toHaveLength(0)
  })

  test("migrates legacy persisted major-unit money into explicit minor units once", () => {
    const migrated = migrateRetailOpsPersistedState({
      closeouts: [
        {
          cashVariance: -5,
          declaredCash: 100,
          declaredTransfer: 50,
          expectedCash: 105,
          expectedTransfer: 50,
          grossSales: 155,
          transferVariance: 0,
        },
      ],
      products: [
        {
          price: 1_234.5,
          variants: [{ price: 500 }],
        },
      ],
      sales: [{ total: 2_469, unitPrice: 1_234.5 }],
    }) as {
      closeouts: Array<Record<string, number>>
      products: Array<{
        priceMinor: number
        variants: Array<{ priceMinor: number }>
      }>
      sales: Array<{ totalMinor: number; unitPriceMinor: number }>
    }

    expect(migrated.products[0]?.priceMinor).toBe(123_450)
    expect(migrated.products[0]?.variants[0]?.priceMinor).toBe(50_000)
    expect(migrated.sales[0]).toMatchObject({
      totalMinor: 246_900,
      unitPriceMinor: 123_450,
    })
    expect(migrated.closeouts[0]).toMatchObject({
      cashVarianceMinor: -500,
      declaredCashMinor: 10_000,
      grossSalesMinor: 15_500,
    })
  })
})
