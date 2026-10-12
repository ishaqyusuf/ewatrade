import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { commercialOrderOfferingResolver } from "./commercial-order-offering-resolution"
import { saleEligibleCatalogItem } from "./product-usage"

test("lazy batches retain exact predicates, full relation data and separate eligibility", async () => {
  const queries: unknown[] = []
  const draft = {
    id: "draft",
    variant: {
      selections: [{ group: { key: "size" }, value: { key: "small" } }],
    },
  }
  const active = { id: "active", serviceOffering: { workPolicy: "TRACKED" } }
  const tx = {
    sellableOffering: {
      findMany: async (args: { where: { status: unknown } }) => {
        queries.push(args)
        return args.where.status === "ACTIVE" ? [active] : [active, draft]
      },
    },
  } as unknown as Prisma.TransactionClient
  const ordinary = { offeringId: "draft" }
  const progressive = {
    ...ordinary,
    progressiveAvailabilityAttestationId: "attestation",
  }
  const resolver = commercialOrderOfferingResolver(tx, {
    tenantId: "tenant",
    storeId: "store",
    lines: [ordinary, progressive, { offeringId: "active" }, ordinary],
  })
  expect(queries).toHaveLength(0)
  expect(Object.is(await resolver(progressive), draft)).toBe(true)
  expect(await resolver(ordinary)).toBeNull()
  expect(Object.is(await resolver({ offeringId: "active" }), active)).toBe(true)
  expect(Object.is(await resolver(progressive), draft)).toBe(true)
  expect(queries).toHaveLength(2)
  const include = {
    catalogItem: { select: { id: true, name: true } },
    productUnitOffering: { include: { inventoryUnit: true } },
    serviceOffering: true,
    storeAvailability: { where: { storeId: "store" } },
    variant: {
      include: { selections: { include: { group: true, value: true } } },
    },
  }
  expect(queries).toEqual([
    {
      include,
      where: {
        id: { in: ["draft"] },
        catalogItem: saleEligibleCatalogItem,
        status: { in: ["ACTIVE", "DRAFT"] },
        tenantId: "tenant",
      },
    },
    {
      include,
      where: {
        id: { in: ["draft", "active"] },
        catalogItem: saleEligibleCatalogItem,
        status: "ACTIVE",
        tenantId: "tenant",
      },
    },
  ])
})

test("resolver data cannot leak into a later command or foreign scope", async () => {
  const queries: Array<{ where: unknown; include: unknown }> = []
  const tx = {
    sellableOffering: {
      findMany: async (args: { where: unknown; include: unknown }) => {
        queries.push(args)
        return queries.length === 1 ? [{ id: "id" }] : []
      },
    },
  } as unknown as Prisma.TransactionClient
  const line = { offeringId: "id" }
  const lines = [line]
  const first = commercialOrderOfferingResolver(tx, {
    tenantId: "tenant",
    storeId: "store",
    lines,
  })
  const later = commercialOrderOfferingResolver(tx, {
    tenantId: "foreign",
    storeId: "other-store",
    lines,
  })
  expect(await first(line)).toMatchObject({ id: "id" })
  expect(await later(line)).toBeNull()
  expect(queries[1]).toMatchObject({
    where: { tenantId: "foreign" },
    include: { storeAvailability: { where: { storeId: "other-store" } } },
  })
})

test("batch read failures propagate without trying other modes or returning cached success", async () => {
  const failure = Error("read failed")
  let reads = 0
  const tx = {
    sellableOffering: {
      findMany: async () => {
        reads++
        throw failure
      },
    },
  } as unknown as Prisma.TransactionClient
  const line = { offeringId: "id" }
  const resolver = commercialOrderOfferingResolver(tx, {
    tenantId: "tenant",
    storeId: "store",
    lines: [line],
  })
  await expect(resolver(line)).rejects.toBe(failure)
  await expect(resolver(line)).rejects.toBe(failure)
  expect(reads).toBe(1)
})
