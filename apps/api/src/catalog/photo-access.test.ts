import { expect, test } from "bun:test"
import { catalogPhotoActorScope } from "./photo-access"

function context(role = "OWNER"): Parameters<typeof catalogPhotoActorScope>[0] {
  return {
    session: { user: { id: "owner" } },
    tenantContext: {
      tenant: { id: "business" },
      membership: { role },
      activeStore: { id: "one" },
      stores: [{ id: "one" }, { id: "two" }],
    },
    qaSessionScope: null,
  }
}

test("Catalog photo authority comes from the authenticated business, actor and permitted Store", () => {
  expect(catalogPhotoActorScope(context())).toEqual({
    actorUserId: "owner",
    tenantId: "business",
    storeId: "one",
  })
  expect(catalogPhotoActorScope(context("MANAGER"), "two").storeId).toBe("two")
  for (const role of ["MEMBER", "CASHIER", "OPERATOR", "unknown"])
    expect(() => catalogPhotoActorScope(context(role))).toThrow()
  expect(() =>
    catalogPhotoActorScope({ ...context(), session: null }),
  ).toThrow()
  expect(() => catalogPhotoActorScope(context(), "foreign")).toThrow()
})

test("derived QA photo access cannot select another Store in its own Tenant", () => {
  const ctx = context()
  ctx.qaSessionScope = { storeId: "one" }
  expect(catalogPhotoActorScope(ctx).storeId).toBe("one")
  expect(() => catalogPhotoActorScope(ctx, "two")).toThrow(
    "This QA session is limited to its selected Store.",
  )
})
