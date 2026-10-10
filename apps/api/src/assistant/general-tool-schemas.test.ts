import { afterAll, beforeAll, expect, test } from "bun:test"
import { asSchema } from "ai"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"

const env = {
  enabled: process.env.ASSISTANT_GENERAL_ENABLED,
  key: process.env.ASSISTANT_APPROVAL_SIGNING_KEY,
}
beforeAll(() => {
  process.env.ASSISTANT_GENERAL_ENABLED = "true"
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "k".repeat(32)
})
afterAll(() => {
  process.env.ASSISTANT_GENERAL_ENABLED = env.enabled
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = env.key
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
