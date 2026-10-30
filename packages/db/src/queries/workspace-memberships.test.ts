import { expect, test } from "bun:test"
import {
  listActiveWorkspaceMemberships,
  listDashboardWorkspaceMemberships,
} from "./tenants"
import type { DbClient } from "./types"

test("workspace choices and Store assignments use one actor-scoped read and reject foreign/inactive assignment facts", async () => {
  const queries: unknown[] = []
  const assignments = [
    {
      storeId: "own",
      tenantId: "tenant",
      role: "MANAGER",
      status: "ACTIVE",
      revision: 2,
      store: { tenantId: "tenant", status: "ACTIVE" },
    },
    {
      storeId: "foreign-record",
      tenantId: "other",
      role: "MANAGER",
      status: "ACTIVE",
      revision: 1,
      store: { tenantId: "tenant", status: "ACTIVE" },
    },
    {
      storeId: "foreign-store",
      tenantId: "tenant",
      role: "MANAGER",
      status: "ACTIVE",
      revision: 1,
      store: { tenantId: "other", status: "ACTIVE" },
    },
    {
      storeId: "inactive-store",
      tenantId: "tenant",
      role: "MANAGER",
      status: "ACTIVE",
      revision: 1,
      store: { tenantId: "tenant", status: "INACTIVE" },
    },
    {
      storeId: "revoked",
      tenantId: "tenant",
      role: "MANAGER",
      status: "REVOKED",
      revision: 1,
      store: { tenantId: "tenant", status: "ACTIVE" },
    },
  ]
  const db = {
    membership: {
      findMany: async (query: unknown) => {
        queries.push(query)
        return [
          {
            id: "member",
            tenantId: "tenant",
            role: "MANAGER",
            status: "ACTIVE",
            staffAccessMode: "SCOPED",
            catalogEditor: true,
            staffStoreAssignments: assignments,
            retailOpsStaffProfile: { defaultStoreId: "own" },
            tenant: {
              id: "tenant",
              stores: [],
              metadata: {},
              subscription: null,
            },
          },
        ]
      },
    },
  } as unknown as DbClient
  const result = await listActiveWorkspaceMemberships(db, "actor")
  expect(queries).toHaveLength(1)
  expect(queries[0]).toMatchObject({
    where: { userId: "actor", status: "ACTIVE", tenant: { isActive: true } },
    select: {
      staffStoreAssignments: {
        where: { status: "ACTIVE", store: { status: "ACTIVE" } },
      },
    },
  })
  expect(result[0]?.staffStoreAssignments).toEqual([
    { storeId: "own", role: "MANAGER", status: "ACTIVE", revision: 2 },
  ])
  expect(result[0]?.retailOpsStaffProfile?.defaultStoreId).toBe("own")
  const [joined] = await listDashboardWorkspaceMemberships(db, "actor")
  expect(joined?.staffStoreAssignments).toEqual(
    result[0]?.staffStoreAssignments,
  )
  expect(joined?.retailOpsStaffProfile).toEqual(
    result[0]?.retailOpsStaffProfile,
  )
  expect(joined?.tenant.stores).toEqual(result[0]?.tenant.stores)
  expect(joined?.tenant).not.toHaveProperty("metadata")
  expect(joined?.tenant).not.toHaveProperty("subscription")
  expect(queries).toHaveLength(2)
})
