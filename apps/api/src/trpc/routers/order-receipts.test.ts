import { expect, test } from "bun:test"
import { defaultReceiptSettings } from "@ewatrade/order-receipts"
import { createCallerFactory } from "../init"
import { ordersRouter } from "./orders"

const createCaller = createCallerFactory(ordersRouter)
function context(role: string) {
  let effects = 0
  const db = new Proxy(
    {},
    {
      get() {
        effects++
        throw new Error("Database must not be reached")
      },
    },
  )
  return {
    effects: () => effects,
    ctx: {
      db,
      requestId: "receipt-test",
      session: {
        session: { id: "session", token: "test-token" },
        user: { id: "actor" },
      },
      tenantContext: {
        tenant: { id: "tenant", qaPurgeStartedAt: null },
        membership: { id: "membership", role },
        stores: [{ id: "store" }],
        activeStore: { id: "store" },
      },
    },
  }
}
test("receipt settings writes are restricted to Owners and Admins", async () => {
  for (const role of ["CASHIER", "OPERATOR", "SUPPORT", "MEMBER", "MANAGER"]) {
    const state = context(role)
    await expect(
      createCaller(state.ctx as never).saveReceiptSettings({
        storeId: "store",
        scope: "business",
        settings: defaultReceiptSettings,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(state.effects()).toBe(0)
  }
})
test("exports reject foreign Store, duplicate IDs and client supplied Tenant/settings before source reads", async () => {
  const state = context("OWNER")
  const caller = createCaller(state.ctx as never)
  await expect(
    caller.prepareReceipts({ storeId: "foreign", orderIds: ["order"] }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(
    caller.prepareReceipts({ storeId: "store", orderIds: ["order", "order"] }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    caller.prepareReceipts({
      storeId: "store",
      orderIds: ["order"],
      tenantId: "caller",
      settings: defaultReceiptSettings,
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(state.effects()).toBe(0)
})
