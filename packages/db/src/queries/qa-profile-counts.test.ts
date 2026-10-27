import { expect, mock, test } from "bun:test"
import type { QaProfile } from "@ewatrade/utils/qa-profiles"
import { loadQaProfileCounts } from "./qa-profile-counts"
import type { DbClient } from "./types"

const makeProfile = (
  reference: string,
  business: string,
  store: string,
): QaProfile => ({
  business: { id: business, name: business },
  store: { id: store, name: store },
  identity: {
    id: reference,
    name: reference,
    email: `${reference}@qa.example.test`,
  },
  membership: { role: "OWNER" },
  profileReference: reference,
})
const profiles = [
  makeProfile("one", "b1", "s1"),
  makeProfile("two", "b1", "s1"),
  makeProfile("branch", "b1", "s2"),
  makeProfile("empty", "b2", "s3"),
]
function fixture({ failCatalog = false, failOrders = false } = {}) {
  const catalog = mock(async () => {
    if (failCatalog) throw new Error("read unavailable")
    return [
      { tenantId: "b1", kind: "PRODUCT", _count: { _all: 6 } },
      { tenantId: "b1", kind: "SERVICE", _count: { _all: 2 } },
    ]
  })
  const orders = mock(async () => {
    if (failOrders) throw new Error("read unavailable")
    return [
      { tenantId: "b1", storeId: "s1", _count: { _all: 12 } },
      { tenantId: "b1", storeId: "s2", _count: { _all: 3 } },
    ]
  })
  // Only these two delegates are exercised; no client/connection is constructed.
  const db = {
    catalogItem: { groupBy: catalog },
    commercialOrder: { groupBy: orders },
  } as unknown as DbClient
  return { db, catalog, orders }
}
test("counts unique eligible businesses/Stores in two reads, with exact QA fences", async () => {
  const { db, catalog, orders } = fixture()
  const result = await loadQaProfileCounts(db, profiles, "qa.example.test")
  expect(result.get("one")).toEqual({
    catalogItems: 8,
    services: 2,
    orders: 12,
  })
  expect(result.get("two")).toEqual(result.get("one"))
  expect(result.get("branch")).toEqual({
    catalogItems: 8,
    services: 2,
    orders: 3,
  })
  expect(result.get("empty")).toEqual({
    catalogItems: 0,
    services: 0,
    orders: 0,
  })
  expect(catalog).toHaveBeenCalledTimes(1)
  expect(orders).toHaveBeenCalledTimes(1)
  const fence = {
    dataClassification: "QA",
    isActive: true,
    qaPurgeStartedAt: null,
    qaSourceDomain: "qa.example.test",
  }
  expect(catalog).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        tenantId: { in: ["b1", "b2"] },
        tenant: fence,
        systemRole: null,
        status: { not: "ARCHIVED" },
        archivedAt: null,
      },
    }),
  )
  expect(orders).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        OR: [
          { tenantId: "b1", storeId: "s1" },
          { tenantId: "b1", storeId: "s2" },
          { tenantId: "b2", storeId: "s3" },
        ],
        tenant: fence,
        store: { status: "ACTIVE" },
      },
    }),
  )
})
test("empty eligible set performs no aggregate query", async () => {
  const { db, catalog, orders } = fixture()
  expect(await loadQaProfileCounts(db, [], "qa.example.test")).toEqual(
    new Map(),
  )
  expect(catalog).not.toHaveBeenCalled()
  expect(orders).not.toHaveBeenCalled()
})
test("failed count categories are unavailable, independently of successful zero results", async () => {
  const catalogFailure = fixture({ failCatalog: true })
  expect(
    (
      await loadQaProfileCounts(catalogFailure.db, profiles, "qa.example.test")
    ).get("empty"),
  ).toEqual({ catalogItems: null, services: null, orders: 0 })
  const orderFailure = fixture({ failOrders: true })
  expect(
    (
      await loadQaProfileCounts(orderFailure.db, profiles, "qa.example.test")
    ).get("one"),
  ).toEqual({ catalogItems: 8, services: 2, orders: null })
  const both = fixture({ failCatalog: true, failOrders: true })
  expect(
    (await loadQaProfileCounts(both.db, profiles, "qa.example.test")).get(
      "one",
    ),
  ).toEqual({ catalogItems: null, services: null, orders: null })
})
