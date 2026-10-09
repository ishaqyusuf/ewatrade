import { expect, test } from "bun:test"
import { toPublicError } from "@ewatrade/errors"
import { createCallerFactory } from "./init"
import { financeRouter } from "./routers/finance"
import { ordersRouter } from "./routers/orders"

function planContext(retailOpsPlanId?: "free" | "starter") {
  let effects = 0
  const db = new Proxy(
    {},
    {
      get() {
        effects++
        throw new Error("database reached")
      },
    },
  )
  return {
    effects: () => effects,
    ctx: {
      db,
      requestHeaders: new Headers(),
      requestId: "plan-gate-test",
      session: {
        session: { id: "session", token: "test-token" },
        user: { id: "owner" },
      },
      tenantContext: {
        tenant: { id: "tenant", qaPurgeStartedAt: null, retailOpsPlanId },
        membership: { id: "membership", role: "OWNER" },
        stores: [{ id: "store" }],
        activeStore: { id: "store" },
      },
    },
  }
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("Expected a rejection")
}

test("Free owners get a 403 upgrade error from finance before any database read", async () => {
  const state = planContext("free")
  const error = await rejection(
    createCallerFactory(financeRouter)(state.ctx as never).book(),
  )
  expect(error).toMatchObject({
    code: "FORBIDDEN",
    message: "Upgrade from Free to use finance.",
  })
  expect(toPublicError(error)).toMatchObject({
    code: "PLAN_UPGRADE_REQUIRED",
    message: "Upgrade from Free to use finance.",
  })
  expect(state.effects()).toBe(0)
})

test("Free owners cannot generate receipts or save receipt settings", async () => {
  const state = planContext("free")
  const caller = createCallerFactory(ordersRouter)(state.ctx as never)
  for (const call of [
    caller.prepareReceipts({ storeId: "store", orderIds: ["order"] }),
    caller.saveReceiptSettings({
      storeId: "store",
      scope: "business",
      settings: {} as never,
    }),
  ]) {
    expect(await rejection(call)).toMatchObject({
      code: "FORBIDDEN",
      message: "Upgrade from Free to generate receipts.",
    })
  }
  expect(state.effects()).toBe(0)
})

test("Starter and contexts without a resolved plan pass the finance gate", async () => {
  for (const planId of ["starter", undefined] as const) {
    const state = planContext(planId)
    const error = await rejection(
      createCallerFactory(financeRouter)(state.ctx as never).book(),
    )
    expect((error as Error).message).toContain("database reached")
  }
})
