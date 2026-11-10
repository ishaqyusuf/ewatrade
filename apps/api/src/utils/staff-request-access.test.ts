import { expect, test } from "bun:test"
import type { TRPCContext } from "../trpc/init"
import { scopeStaffRequest } from "./staff-request-access"

function context() {
  return {
    tenantContext: {
      tenant: { id: "business" },
      membership: { id: "staff", role: "OPERATOR" },
      activeStore: { id: "a" },
      stores: [{ id: "a" }, { id: "b" }],
      staffAccess: {
        mode: "SCOPED",
        businessRole: "OPERATOR",
        status: "ACTIVE",
        catalogEditor: false,
        assignments: [
          { storeId: "a", role: "OPERATOR", status: "ACTIVE" },
          { storeId: "b", role: "CASHIER", status: "ACTIVE" },
        ],
      },
    },
    db: {
      commercialOrderLine: {
        findFirst: async () => ({ order: { storeId: "foreign" } }),
      },
      stockBalanceSource: { findFirst: async () => ({ storeId: "foreign" }) },
      commercialOrder: { findFirst: async () => ({ storeId: "foreign" }) },
      stockReservation: { findFirst: async () => ({ storeId: "foreign" }) },
      stockOperation: { findFirst: async () => ({ storeId: "foreign" }) },
      stockCount: { findFirst: async () => ({ storeId: "foreign" }) },
      inventoryCloseout: { findFirst: async () => ({ storeId: "foreign" }) },
      stockTransfer: {
        findFirst: async () => ({ sourceStoreId: "a", targetStoreId: "b" }),
      },
    },
  } as unknown as TRPCContext
}
test("cashiers can load receiving accounts and identify sale items at their assigned Store", async () => {
  const ctx = context()
  if (!ctx.tenantContext?.staffAccess) throw Error("Missing inert context")
  ctx.tenantContext.membership.role = "CASHIER"
  ctx.tenantContext.staffAccess.businessRole = "CASHIER"
  ctx.tenantContext.staffAccess.assignments = [
    { storeId: "a", role: "CASHIER", status: "ACTIVE" },
  ]
  for (const [path, input] of [
    ["orders.paymentAccounts", undefined],
    ["catalog.findByCode", { code: "0012345678905" }],
  ] as const) {
    expect(await scopeStaffRequest(ctx, path, "query", input)).toEqual(input)
    await expect(
      scopeStaffRequest(ctx, path, "mutation", input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      scopeStaffRequest(ctx, path, "query", { ...input, storeId: "foreign" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  }
  ctx.tenantContext.staffAccess.assignments = []
  for (const path of ["orders.paymentAccounts", "catalog.findByCode"])
    await expect(
      scopeStaffRequest(ctx, path, "query", undefined),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
})
test("omitted query scope becomes the active Store instead of all-business data", async () => {
  expect(
    await scopeStaffRequest(context(), "orders.listPage", "query", {}),
  ).toEqual({ storeId: "a" })
})
test("Catalog directory retains current assigned-Store read admission and grants no write", async () => {
  expect(
    await scopeStaffRequest(context(), "catalog.listDirectoryPage", "query", {
      limit: 25,
    }),
  ).toEqual({ limit: 25 })
  await expect(
    scopeStaffRequest(context(), "catalog.listDirectoryPage", "query", {
      storeId: "foreign",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    scopeStaffRequest(context(), "catalog.listDirectoryPage", "mutation", {}),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  const revoked = context()
  if (!revoked.tenantContext?.staffAccess) throw Error("Missing inert context")
  revoked.tenantContext.staffAccess.assignments = []
  await expect(
    scopeStaffRequest(revoked, "catalog.listDirectoryPage", "query", {}),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})
test("a role at one Store never grants stock authority at another", async () => {
  await expect(
    scopeStaffRequest(context(), "inventory.postBalanceOperation", "mutation", {
      storeId: "b",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(
    await scopeStaffRequest(context(), "orders.create", "mutation", {
      storeId: "b",
    }),
  ).toEqual({ storeId: "b" })
})
test("foreign record IDs cannot bypass Store selection", async () => {
  for (const [path, input] of [
    ["orders.get", { orderId: "foreign" }],
    ["inventory.releaseReservation", { reservationId: "foreign" }],
    ["inventory.operationAudit", { operationId: "foreign" }],
    ["inventory.finalizeStockCount", { stockCountId: "foreign" }],
    ["inventory.stockCountReview", { stockCountId: "foreign" }],
  ] as const)
    await expect(
      scopeStaffRequest(
        context(),
        path,
        path === "orders.get" ||
          path === "inventory.operationAudit" ||
          path === "inventory.stockCountReview"
          ? "query"
          : "mutation",
        input,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
})
test("transfer requires stock authority at both Stores, including saved transfer IDs", async () => {
  await expect(
    scopeStaffRequest(context(), "inventory.dispatchTransfer", "mutation", {
      sourceStoreId: "a",
      targetStoreId: "b",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    scopeStaffRequest(context(), "inventory.transitionTransfer", "mutation", {
      transferId: "saved",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})
test("transfer review checks both Stores and keeps the selected Store scope", async () => {
  await expect(
    scopeStaffRequest(context(), "inventory.transferReview", "query", {
      transferId: "saved",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  const ctx = context()
  if (ctx.tenantContext?.staffAccess)
    ctx.tenantContext.staffAccess.assignments = [
      { storeId: "a", role: "MANAGER", status: "ACTIVE" },
      { storeId: "b", role: "OPERATOR", status: "ACTIVE" },
    ]
  expect(
    await scopeStaffRequest(ctx, "inventory.transferReview", "query", {
      transferId: "saved",
    }),
  ).toEqual({ transferId: "saved", storeId: "a" })
})
test("revoked assignments, catalog writes, staff admin and unknown paths fail closed", async () => {
  const ctx = context()
  if (ctx.tenantContext?.staffAccess)
    ctx.tenantContext.staffAccess.assignments = []
  await expect(
    scopeStaffRequest(ctx, "orders.create", "mutation", {}),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  for (const path of [
    "catalog.createItem",
    "catalog.addServiceChoice",
    "retailOps.inviteStaff",
    "finance.post",
    "tenant.createStore",
    "orders.unreviewed",
  ])
    await expect(
      scopeStaffRequest(context(), path, "mutation", {}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("line IDs and nested stock sources are checked through their owning Store", async () => {
  await expect(
    scopeStaffRequest(context(), "orders.fulfillProductLine", "mutation", {
      orderLineId: "foreign",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    scopeStaffRequest(context(), "inventory.dispatchTransfer", "mutation", {
      sourceBalanceSourceId: "foreign",
      targetStoreId: "a",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    scopeStaffRequest(context(), "inventory.createStockCount", "mutation", {
      lines: [{ balanceSourceId: "foreign" }],
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("exact order-number lookup cannot bypass assigned Store boundaries", async () => {
  await expect(
    scopeStaffRequest(context(), "orders.get", "query", {
      orderNumber: "ORD-123",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("closeout reads retain manager reconciliation authority and record scope", async () => {
  await expect(
    scopeStaffRequest(context(), "inventory.closeouts", "query", {}),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  const ctx = context()
  if (ctx.tenantContext?.staffAccess)
    ctx.tenantContext.staffAccess.assignments = [
      { storeId: "a", role: "MANAGER", status: "ACTIVE" },
    ]
  expect(
    await scopeStaffRequest(ctx, "inventory.closeouts", "query", {}),
  ).toEqual({ storeId: "a" })
  await expect(
    scopeStaffRequest(ctx, "inventory.closeoutReview", "query", {
      closeoutId: "foreign",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  ctx.db.inventoryCloseout.findFirst = (async () => ({
    storeId: "a",
  })) as typeof ctx.db.inventoryCloseout.findFirst
  expect(
    await scopeStaffRequest(ctx, "inventory.closeoutReview", "query", {
      closeoutId: "saved",
    }),
  ).toEqual({ closeoutId: "saved", storeId: "a" })
})
