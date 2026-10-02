import { expect, test } from "bun:test"
import { assertPurchaseCleanupScope } from "./purchase-recognition-cleanup-scope"
const run = "66fc9be3-f7ff-4db5-a20c-ede35084d629"
const input = {
  run,
  tenantId: "qa",
  actorUserId: "owner",
  bookId: "book",
  items: ["goods"],
}
const source = {
  tenant: {
    id: "qa",
    slug: `supplier-recognition-${run}`,
    dataClassification: "QA",
  },
  book: { id: "book", tenantId: "qa" },
  user: { id: "owner", email: `supplier-recognition-${run}@example.invalid` },
  items: [{ id: "goods", tenantId: "qa" }],
  foreignMemberships: 0,
}
test("allows only the exact run-owned QA tenant, book, user and goods", () => {
  expect(() => assertPurchaseCleanupScope(input, source)).not.toThrow()
})
test("foreign books, users, goods and real-data tenants cannot authorize cleanup", () => {
  for (const changed of [
    { ...source, tenant: { ...source.tenant, dataClassification: "REAL" } },
    { ...source, tenant: { ...source.tenant, slug: "another-run" } },
    { ...source, book: { ...source.book, tenantId: "foreign" } },
    { ...source, user: { ...source.user, email: "real-owner@example.com" } },
    { ...source, items: [{ id: "goods", tenantId: "foreign" }] },
    { ...source, items: [] },
    { ...source, foreignMemberships: 1 },
  ])
    expect(() => assertPurchaseCleanupScope(input, changed)).toThrow(
      "Refusing cleanup",
    )
})
test("missing run/tenant authority and duplicate identities fail closed", () => {
  for (const changed of [
    { ...input, run: "" },
    { ...input, tenantId: undefined },
    { ...input, items: ["goods", "goods"] },
  ])
    expect(() => assertPurchaseCleanupScope(changed, source)).toThrow(
      "Refusing cleanup",
    )
  expect(() =>
    assertPurchaseCleanupScope(
      { run, items: [] },
      {
        tenant: null,
        book: null,
        user: null,
        items: [],
        foreignMemberships: 0,
      },
    ),
  ).not.toThrow()
})
