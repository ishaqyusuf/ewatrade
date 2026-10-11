import { afterAll, beforeAll, expect, test } from "bun:test"
import type { GeneralTransactionContext } from "./general-actions"
import { productLineReturn } from "./general-product-return"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import { generalCapabilityEnabled } from "./general-rollout"
const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "r".repeat(32)
})
afterAll(() => {
  if (previousKey === undefined) Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
})
const payload = { action: "product_line_return" as const, orderLineId: "line", quantity: "1", disposition: "restock" as const, reason: "Customer return" }
function context(order: unknown, role = "OWNER") {
  const reads: unknown[] = []
  return { reads, ctx: {
    session: { user: { id: "actor" } },
    tenantContext: {
      tenant: { id: "tenant", dataClassification: "QA" }, membership: { role },
      activeStore: { id: "store" }, stores: [{ id: "store" }],
      staffAccess: { status: "ACTIVE", mode: "LEGACY" },
    },
    db: {
      store: { findFirst: async () => ({ salesRepOrderVisibility: "OWN_SALES" }) },
      commercialOrderLine: { findFirst: async (args: unknown) => { reads.push(args); return order === null ? null : { order } } },
    },
  } as unknown as GeneralTransactionContext }
}
test("return stays unavailable before acceptance", () => {
  expect(generalCapabilityEnabled(capabilityForAction("product_line_return"))).toBe(false)
})
test("foreign or invisible return line is refused before financial reads", async () => {
  const fixture = context(null, "CASHIER")
  await expect(productLineReturn.validate(fixture.ctx, payload)).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(fixture.reads).toEqual([{ where: { id: "line", order: { tenantId: "tenant", storeId: "store", createdByUserId: "actor" } }, select: expect.any(Object) }])
})
test("clinical quote, pickup and delivery sources cannot use generic return", async () => {
  for (const order of [
    { acceptedCommerceQuoteVersion: { quote: { sourceType: "PRESCRIPTION_REQUEST" } } },
    { prescriptionPickupFulfillment: { orderId: "order" } },
    { prescriptionDeliveryAssignment: { orderId: "order" } },
  ]) {
    const fixture = context(order)
    await expect(productLineReturn.validate(fixture.ctx, payload)).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(fixture.reads).toHaveLength(1)
  }
})
