import { expect, test } from "bun:test"
import { setupRunLookup } from "./setup-run-lookup"
test("reply recovery requires both the actor and the owner conversation in the active tenant and Store", () => {
  const lookup = setupRunLookup(
    { userId: "owner", tenantId: "tenant", storeId: "store" },
    "run",
  )
  expect(lookup.where).toEqual({
    id: "run",
    actorUserId: "owner",
    conversation: {
      ownerUserId: "owner",
      tenantId: "tenant",
      storeId: "store",
      purpose: "SETUP",
    },
  })
  expect(
    setupRunLookup(
      { userId: "other", tenantId: "tenant2", storeId: "store2" },
      "run",
    ).where,
  ).not.toEqual(lookup.where)
  expect(Object.keys(lookup.select).sort()).toEqual([
    "conversationId",
    "errorCode",
    "id",
    "status",
  ])
})
