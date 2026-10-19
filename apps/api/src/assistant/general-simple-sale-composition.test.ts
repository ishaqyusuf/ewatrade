import { afterAll, beforeAll, expect, test } from "bun:test"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import { whatsAppCapabilityEnabled } from "@ewatrade/assistant/channels/policy"
import {
  type GeneralTransactionContext,
  executeSimpleSaleOrder,
  orderCreate,
} from "./general-actions"
import {
  assertGeneralAction,
  assertGeneralCompositeDependency,
} from "./general-context"

const oldKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "synthetic-simple-sale-composition-key"
})
afterAll(() => {
  if (oldKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = oldKey
})
function context(role = "OWNER") {
  const touched: string[] = []
  const ctx = {
    session: { user: { id: "actor" }, session: { id: "browser-session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "tenant",
        currencyCode: "NGN",
        dataClassification: "QA",
        retailOpsPlanId: "pro",
      },
      membership: { id: "member", role },
      activeStore: { id: "store", currencyCode: "NGN" },
      stores: [{ id: "store" }],
      staffAccess: {
        status: "ACTIVE",
        mode: "LEGACY",
        businessRole: role,
        assignments: [],
      },
    },
    db: new Proxy(
      {},
      {
        get(_target, key) {
          touched.push(String(key))
          throw Error("Unexpected domain effect")
        },
      },
    ),
  } as unknown as GeneralTransactionContext
  return { ctx, touched }
}
const order = {
  action: "order_create" as const,
  lines: [
    {
      custom: "quick_sale" as const,
      amountMinor: 12500,
      description: "Two bags of rice",
    },
  ],
  initialPayment: {
    amountMinor: 5000,
    moneyAccountId: "cash",
    method: "cash" as const,
  },
}

test("browser composite dependencies retain parent and exact current canonical authority", () => {
  const { ctx, touched } = context()
  for (const dependency of ["order_create", "payment_record"] as const) {
    expect(
      assertGeneralCompositeDependency(ctx, "sale_record", dependency),
    ).toEqual(assertGeneralAction(ctx, dependency))
  }
  expect(touched).toEqual([])
  const cashier = context("CASHIER")
  expect(() => assertGeneralAction(cashier.ctx, "order_create")).not.toThrow()
  for (const dependency of ["order_create", "payment_record"] as const)
    expect(() =>
      assertGeneralCompositeDependency(cashier.ctx, "sale_record", dependency),
    ).toThrow()
  expect(cashier.touched).toEqual([])
  const lostStore = context()
  lostStore.ctx.tenantContext.activeStore = null
  expect(() =>
    assertGeneralCompositeDependency(
      lostStore.ctx,
      "sale_record",
      "order_create",
    ),
  ).toThrow()
})

test("composition rejects unrelated dependencies and parents without broadening standalone channel policy", () => {
  const { ctx } = context()
  expect(() =>
    assertGeneralCompositeDependency(
      ctx,
      "sale_record",
      "customer_create" as never,
    ),
  ).toThrow("Unsupported sale dependency")
  expect(() =>
    assertGeneralCompositeDependency(
      ctx,
      "money_in_record" as never,
      "payment_record",
    ),
  ).toThrow("Unsupported assistant composition")
  const local = {
    APP_ENV: "local",
    NODE_ENV: "test",
    ASSISTANT_WHATSAPP_WRITES_ENABLED: "true",
  }
  expect(
    whatsAppCapabilityEnabled(capabilityForAction("sale_record"), local),
  ).toBe(true)
  for (const action of ["order_create", "payment_record"] as const)
    expect(whatsAppCapabilityEnabled(capabilityForAction(action), local)).toBe(
      false,
    )
  expect(
    whatsAppCapabilityEnabled(capabilityForAction("sale_record"), {
      ...local,
      ASSISTANT_WHATSAPP_WRITES_ENABLED: "false",
    }),
  ).toBe(false)
})

test("internal sale execution refuses non-generated order shapes before canonical effects", async () => {
  const { ctx, touched } = context()
  for (const payload of [
    { ...order, lines: [{ custom: "additional_cost", amountMinor: 12500 }] },
    { ...order, lines: [...order.lines, ...order.lines] },
    { ...order, lines: [{ offeringId: "catalog-offering", quantity: "1" }] },
    { ...order, notes: "not a simple-sale generated field" },
    { ...order, initialPayment: { ...order.initialPayment, method: "card" } },
    {
      ...order,
      initialPayment: {
        ...order.initialPayment,
        note: "injected payment note",
      },
    },
    {
      ...order,
      initialPayment: { ...order.initialPayment, moneyAccountId: undefined },
    },
    {
      ...order,
      initialPayment: { ...order.initialPayment, amountMinor: 15000 },
    },
    { ...order, initialPayment: undefined },
  ])
    await expect(
      executeSimpleSaleOrder(ctx, payload, "synthetic-key"),
    ).rejects.toThrow("Review the exact simple sale again")
  expect(touched).toEqual([])
})

test("standalone initial-payment execution and composite execution still refuse a disallowed parent actor", async () => {
  const { ctx, touched } = context("CASHIER")
  await expect(
    orderCreate.execute(ctx, order, "standalone-key"),
  ).rejects.toThrow()
  await expect(
    executeSimpleSaleOrder(ctx, order, "composite-key"),
  ).rejects.toThrow()
  expect(touched).toEqual([])
})

test("valid generated sale and ordinary browser order reach the same canonical transaction boundary", async () => {
  for (const execute of [executeSimpleSaleOrder, orderCreate.execute]) {
    const { ctx, touched } = context()
    await expect(execute(ctx, order, "synthetic-key")).rejects.toThrow(
      "Unexpected domain effect",
    )
    expect(touched.length).toBeGreaterThan(0)
    expect(ctx.requestHeaders.get("x-assistant-client")).toBe("dashboard")
    expect(ctx.session.session?.id).toBe("browser-session")
  }
})
