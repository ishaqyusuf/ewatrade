import { expect, test } from "bun:test"
import { createCallerFactory, createTRPCRouter } from "../init"
import { catalogCategoriesRouter } from "./catalog-categories"

const router = createTRPCRouter({
  catalog: createTRPCRouter({ categories: catalogCategoriesRouter }),
})
function caller({
  role = "OWNER",
  classification = "LIVE",
  user = true,
  qa = false,
  onAudit = () => {},
}: {
  role?: string
  classification?: string
  user?: boolean
  qa?: boolean
  onAudit?: () => void
} = {}) {
  return createCallerFactory(router)({
    db: {
      $transaction: () => {
        throw new Error("Database must not be reached")
      },
      session: { findUnique: async () => ({ qaAuthorizationId: "qa-test" }) },
      qaAccessAuditEvent: {
        create: async () => {
          onAudit()
          return {}
        },
      },
    },
    session: user
      ? {
          session: { id: "session-test", token: "token-test" },
          user: { id: "actor-test" },
        }
      : null,
    tenantContext: {
      tenant: {
        id: "tenant-test",
        dataClassification: classification,
        qaPurgeStartedAt: null,
      },
      membership: { id: "membership-test", role },
      activeStore: { id: "store-test" },
      stores: [{ id: "store-test" }, { id: "store-other" }],
    },
    qaSessionScope: qa
      ? {
          tenantId: "tenant-test",
          membershipId: "membership-test",
          storeId: "store-test",
        }
      : null,
  } as never)
}
test("category suggestions require an authenticated manager", async () => {
  await expect(
    caller({ user: false }).catalog.categories.suggest({ title: "Eggs" }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  await expect(
    caller({ role: "STAFF" }).catalog.categories.suggest({ title: "Eggs" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})
test("category suggestion input rejects client authority and invalid title", async () => {
  for (const input of [
    { title: "E" },
    { title: "x".repeat(161) },
    { title: "Eggs", model: "gpt-4.1" },
    { title: "Eggs", tenantId: "other" },
    { title: "Eggs", categories: [] },
  ]) {
    await expect(
      caller().catalog.categories.suggest(input),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  }
})
test("foreign Store and QA Store override are denied", async () => {
  await expect(
    caller().catalog.categories.suggest({
      title: "Eggs",
      storeId: "foreign-store",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(
    caller({ qa: true }).catalog.categories.suggest({
      title: "Eggs",
      storeId: "store-other",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})
test("QA category suggestions use local reference data without a live provider or audit", async () => {
  let audits = 0
  const result = await caller({
    classification: "QA",
    qa: true,
    onAudit: () => {
      audits += 1
    },
  }).catalog.categories.suggest({ title: "Eggs" })
  expect(result.status).toBe("ready")
  expect(result.suggestions.length).toBeGreaterThan(0)
  expect(
    result.suggestions.every((entry) => entry.key.startsWith("shopify:")),
  ).toBe(true)
  expect(audits).toBe(0)
})

test("taxonomy tree and attributes are authenticated, bounded and reject invented identities", async () => {
  await expect(
    caller({ user: false }).catalog.categories.browse({}),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  const page = await caller().catalog.categories.browse({})
  expect(page.categories.length).toBe(26)
  await expect(
    caller().catalog.categories.browse({ parentId: "shopify:made-up" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    caller().catalog.categories.attributes({ categoryKey: "shopify:made-up" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(
    (
      await caller().catalog.categories.attributes({
        categoryKey: "shopify:el-4-8-5-2",
      })
    ).attributes.length,
  ).toBeLessThanOrEqual(12)
})
