import { afterAll, beforeAll, expect, test } from "bun:test"
import { asSchema } from "ai"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"

const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "k".repeat(32)
})
afterAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
})

const owner = {
  session: { user: { id: "user" }, session: { id: "session" } },
  tenantContext: {
    tenant: {
      id: "tenant",
      dataClassification: "LIVE",
      retailOpsPlanId: "pro",
      currencyCode: "NGN",
    },
    membership: { id: "membership", role: "OWNER" },
    activeStore: { id: "store", name: "Shop", currencyCode: "NGN" },
    stores: [{ id: "store" }],
    staffAccess: {
      businessRole: "OWNER",
      status: "ACTIVE",
      mode: "LEGACY",
      catalogEditor: false,
      assignments: [],
    },
  },
} as unknown as GeneralContext

// DeepSeek refuses the whole request when any tool schema root is not an
// object (production 10 Oct 2026: draftAction was a bare `oneOf`).
test("every GENERAL tool sends an object-rooted JSON schema", async () => {
  const tools = createGeneralTools(
    owner,
    "conversation",
    () => {},
    () => {},
  )
  expect(Object.keys(tools)).toContain("draftAction")
  for (const [name, definition] of Object.entries(tools)) {
    const schema = (await asSchema(definition.inputSchema).jsonSchema) as {
      type?: unknown
    }
    expect({ name, type: schema.type }).toEqual({ name, type: "object" })
  }
})

test("draftAction still validates the exact action shape", async () => {
  const tools = createGeneralTools(
    owner,
    "conversation",
    () => {},
    () => {},
  )
  const schema = asSchema(tools.draftAction?.inputSchema)
  const ok = await schema.validate?.({
    action: "customer_create",
    name: "Amina",
  })
  expect(ok?.success).toBe(true)
  const bad = await schema.validate?.({ action: "customer_create" })
  expect(bad?.success).toBe(false)
})

// 12 Oct 2026: "paid 3,000 cash" was drafted as amountMinor 3000 (₦30.00).
test("draftAction takes stated sale and payment money in major units", async () => {
  const tools = createGeneralTools(
    owner,
    "conversation",
    () => {},
    () => {},
  )
  const schema = asSchema(tools.draftAction?.inputSchema)
  const line = {
    offeringId: "o",
    quantity: "2",
    expectedFixedPriceMinor: 240000,
  }
  const stated = await schema.validate?.({
    action: "order_create",
    lines: [line],
    initialPayment: { amount: "3,000", method: "cash" },
  })
  expect(stated?.success).toBe(true)
  const minor = await schema.validate?.({
    action: "order_create",
    lines: [line],
    initialPayment: { amountMinor: 3000, method: "cash" },
  })
  expect(minor?.success).toBe(false)
  const json = JSON.stringify(
    await asSchema(tools.draftAction?.inputSchema).jsonSchema,
  )
  expect(json).toContain("Never convert to kobo/cents")
})
