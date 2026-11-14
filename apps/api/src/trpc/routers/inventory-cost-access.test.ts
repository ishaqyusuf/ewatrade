import { expect, test } from "bun:test"
import { createCallerFactory } from "../init"
import { canSeeStockCost, inventoryRouter } from "./inventory"

// Stock cost is Finance data: owners and admins see it; managers and scoped
// staff get the same stock rows with cost snapshots blanked.
const createCaller = createCallerFactory(inventoryRouter)

const row = {
  balanceSourceId: "balance",
  currencyCodeSnapshot: "NGN",
  totalCostMinorSnapshot: "120000",
  unitCostMinorSnapshot: 1200,
}

function context(role: string, staffAccess?: unknown) {
  const movement = {
    ...row,
    id: "movement",
    balanceSource: {
      custodyReferenceId: "",
      custodyType: "STORE",
      product: { catalogItem: { name: "Eggs" } },
      store: { name: "Shop" },
      variant: { name: "Large" },
    },
    configurationVersionId: "config",
    enteredInventoryUnit: { name: "Egg" },
    enteredInventoryUnitId: "unit",
    enteredQuantity: { toFixed: () => "100" },
    previousOnHandQuantity: { toFixed: () => "0" },
    resultingOnHandQuantity: { toFixed: () => "100" },
    reversalOfMovement: null,
    reversalOfMovementId: null,
    reversals: [],
    signedCanonicalEffect: { toFixed: () => "100" },
    totalCostMinorSnapshot: { toFixed: () => "120000" },
    transactionScaleSnapshot: 0,
    unitFactorSnapshot: { toFixed: () => "1" },
  }
  const db = {
    stockOperation: {
      findFirst: async () => ({
        actorUserId: "actor",
        categories: [],
        clientOperationId: "client",
        correctionOfOperationId: null,
        corrections: [],
        createdAt: new Date(0),
        effectiveAt: new Date(0),
        id: "operation",
        linkedOperation: null,
        linkedOperations: [],
        movements: [movement],
        reason: "Stock in",
        source: "dashboard_inventory",
        storeId: "store",
        type: "RECEIPT",
      }),
    },
  }
  return {
    db,
    requestId: "request-test",
    session: {
      session: { id: "session-1", token: "session-token" },
      user: { id: "actor" },
    },
    tenantContext: {
      tenant: { id: "tenant", qaPurgeStartedAt: null },
      membership: { id: "membership-1", role },
      stores: [{ id: "store" }],
      activeStore: { id: "store" },
      staffAccess,
    },
  }
}

test("only owners and admins can see stock cost", () => {
  const tenant = (role: string, staffAccess?: unknown) =>
    context(role, staffAccess).tenantContext as never
  expect(canSeeStockCost(tenant("OWNER"))).toBe(true)
  expect(canSeeStockCost(tenant("admin"))).toBe(true)
  expect(canSeeStockCost(tenant("MANAGER"))).toBe(false)
  expect(
    canSeeStockCost(
      tenant("OPERATOR", { mode: "SCOPED", businessRole: "OPERATOR" }),
    ),
  ).toBe(false)
  expect(
    canSeeStockCost(tenant("OWNER", { mode: "SCOPED", businessRole: "ADMIN" })),
  ).toBe(true)
})

test("a manager's stock change audit has no cost; the owner's keeps it", async () => {
  const read = async (role: string) =>
    createCaller(context(role) as never).operationAudit({
      operationId: "operation",
    })
  const manager = await read("MANAGER")
  expect(manager?.movements[0]).toMatchObject({
    totalCostMinorSnapshot: null,
    unitCostMinorSnapshot: null,
  })
  const owner = await read("OWNER")
  expect(owner?.movements[0]).toMatchObject({
    totalCostMinorSnapshot: "120000",
    unitCostMinorSnapshot: 1200,
  })
})
