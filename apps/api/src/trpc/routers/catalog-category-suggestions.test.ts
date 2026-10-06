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
test("the real nested tRPC path blocks and audits QA live AI calls", async () => {
  let audits = 0
  await expect(
    caller({
      classification: "QA",
      qa: true,
      onAudit: () => {
        audits += 1
      },
    }).catalog.categories.suggest({ title: "Eggs" }),
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  expect(audits).toBe(1)
})
