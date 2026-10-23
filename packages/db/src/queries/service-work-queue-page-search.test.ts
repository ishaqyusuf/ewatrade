import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { listServiceWorkQueuePage } from "./service-work"

describe("service work queue page search", () => {
  test("searches snapshot item, variant, and offering while retaining scope", async () => {
    let findWhere: unknown
    let countWhere: unknown
    const db = {
      serviceJob: {
        findMany: async ({ where }: { where: unknown }) => {
          findWhere = where
          return []
        },
        count: async ({ where }: { where: unknown }) => {
          countWhere = where
          return 0
        },
      },
    } as unknown as PrismaClient

    await listServiceWorkQueuePage(db, {
      assigneeUserId: "user_1",
      due: "today",
      priority: "urgent",
      query: "express service",
      storeId: "store_1",
      tenantId: "tenant_1",
    })

    expect(findWhere).toMatchObject({
      currentAssigneeUserId: "user_1",
      priority: "URGENT",
      storeId: "store_1",
      tenantId: "tenant_1",
    })
    expect(countWhere).toMatchObject({
      currentAssigneeUserId: "user_1",
      priority: "URGENT",
      storeId: "store_1",
      tenantId: "tenant_1",
    })
    expect(findWhere).toMatchObject({
      OR: [
        {},
        {},
        {
          lines: {
            some: {
              commercialOrderLine: {
                snapshot: {
                  is: {
                    OR: [
                      {
                        catalogItemName: {
                          contains: "express service",
                          mode: "insensitive",
                        },
                      },
                      {
                        variantName: {
                          contains: "express service",
                          mode: "insensitive",
                        },
                      },
                      {
                        offeringName: {
                          contains: "express service",
                          mode: "insensitive",
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      ],
    })
  })
})

test("Dashboard all-status listing keeps Store scope and sorts by creation date without urgent-first grouping", async () => {
  const calls: unknown[] = []
  const db = {
    serviceJob: {
      findMany: async (query: unknown) => {
        calls.push(query)
        return []
      },
      count: async (query: unknown) => {
        calls.push(query)
        return 0
      },
    },
  } as unknown as PrismaClient
  await listServiceWorkQueuePage(db, {
    tenantId: "tenant",
    storeId: "main",
    stage: "all",
    sort: { field: "createdAt", direction: "desc" },
  })
  expect(calls[0]).toMatchObject({
    where: { tenantId: "tenant", storeId: "main", AND: [{}] },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  })
  expect(calls[1]).toMatchObject({
    where: { tenantId: "tenant", storeId: "main", AND: [{}] },
  })
  calls.length = 0
  await listServiceWorkQueuePage(db, {
    tenantId: "tenant",
    storeId: "main",
    stage: "cancelled",
  })
  expect(calls[0]).toMatchObject({
    where: {
      tenantId: "tenant",
      storeId: "main",
      AND: [{ lines: { some: {}, every: { status: "CANCELLED" } } }],
    },
  })
})
