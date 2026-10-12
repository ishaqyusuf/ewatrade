import { expect, test } from "bun:test"
import { createCallerFactory } from "../init"
import { tenantRouter } from "./tenant"

test("undeclared legacy Account cannot list Business memberships", async () => {
  let membershipReads = 0
  const caller = createCallerFactory(tenantRouter)({
    db: {
      user: { findUnique: async () => ({ ageBand: "UNDECLARED" }) },
      membership: {
        findMany: async () => {
          membershipReads += 1
          return []
        },
      },
    },
    requestHeaders: new Headers(),
    session: { user: { id: "legacy-account" } },
  } as never)

  await expect(caller.businesses()).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  })
  expect(membershipReads).toBe(0)
})

test("declared teen Account can list its Business memberships", async () => {
  const caller = createCallerFactory(tenantRouter)({
    db: {
      user: { findUnique: async () => ({ ageBand: "AGE_13_TO_15" }) },
      membership: {
        findMany: async () => [
          {
            role: "OWNER",
            tenant: {
              currencyCode: "NGN",
              id: "teen-business",
              name: "Teen Store",
              slug: "teen-store",
            },
          },
        ],
      },
    },
    requestHeaders: new Headers(),
    session: { user: { id: "teen-account" } },
  } as never)

  expect(await caller.businesses()).toEqual([
    {
      currencyCode: "NGN",
      id: "teen-business",
      name: "Teen Store",
      role: "OWNER",
      slug: "teen-store",
    },
  ])
})

test("QA-derived session lists only its selected business", async () => {
  const reads: unknown[] = []
  const caller = createCallerFactory(tenantRouter)({
    db: {
      user: { findUnique: async () => ({ ageBand: "ADULT" }) },
      membership: {
        findMany: async (args: { where: unknown }) => {
          reads.push(args.where)
          return [
            {
              role: "OWNER",
              tenant: {
                currencyCode: "NGN",
                id: "qa-business",
                name: "Jawdah Poultry QA",
                slug: "jawdah-poultry-qa",
              },
            },
          ]
        },
      },
    },
    qaSessionScope: {
      membershipId: "qa-membership",
      storeId: "qa-store",
      tenantId: "qa-business",
    },
    requestHeaders: new Headers(),
    session: { user: { id: "qa-owner" } },
  } as never)

  expect(await caller.businesses()).toEqual([
    {
      currencyCode: "NGN",
      id: "qa-business",
      name: "Jawdah Poultry QA",
      role: "OWNER",
      slug: "jawdah-poultry-qa",
    },
  ])
  expect(reads).toEqual([
    {
      id: "qa-membership",
      userId: "qa-owner",
      status: "ACTIVE",
      tenant: {
        id: "qa-business",
        dataClassification: "QA",
        isActive: true,
        qaPurgeStartedAt: null,
        stores: { some: { id: "qa-store", status: "ACTIVE" } },
      },
    },
  ])
})

test("QA-derived session whose selected business is gone cannot list businesses", async () => {
  const caller = createCallerFactory(tenantRouter)({
    db: {
      user: { findUnique: async () => ({ ageBand: "ADULT" }) },
      membership: { findMany: async () => [] },
    },
    qaSessionScope: {
      membershipId: "qa-membership",
      storeId: "qa-store",
      tenantId: "qa-business",
    },
    requestHeaders: new Headers(),
    session: { user: { id: "qa-owner" } },
  } as never)

  await expect(caller.businesses()).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
})

test("undeclared Account cannot resolve Tenant or Store context through a protected route", async () => {
  let tenantReads = 0
  const caller = createCallerFactory(tenantRouter)({
    db: {
      user: { findUnique: async () => ({ ageBand: "UNDECLARED" }) },
      membership: {
        findFirst: async () => {
          tenantReads += 1
          return null
        },
      },
    },
    requestHeaders: new Headers(),
    session: { user: { id: "legacy-account" } },
    tenantContext: null,
  } as never)

  await expect(caller.current()).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  })
  expect(tenantReads).toBe(0)
})

test("declared teen Account can resolve its Store context", async () => {
  let tenantReads = 0
  const caller = createCallerFactory(tenantRouter)({
    db: {
      user: { findUnique: async () => ({ ageBand: "AGE_16_TO_17" }) },
      membership: {
        findFirst: async () => {
          tenantReads += 1
          return {
            id: "membership-1",
            role: "OWNER",
            tenantId: "teen-business",
            tenant: {
              id: "teen-business",
              slug: "teen-store",
              name: "Teen Store",
              type: "MERCHANT",
              enabledModes: [],
              currencyCode: "NGN",
              dataClassification: "PRODUCTION",
              timezone: "Africa/Lagos",
              qaPurgeStartedAt: null,
              stores: [
                {
                  id: "store-1",
                  slug: "main",
                  name: "Main Store",
                  status: "ACTIVE",
                  currencyCode: "NGN",
                  metadata: null,
                },
              ],
            },
          }
        },
      },
    },
    requestHeaders: new Headers(),
    session: { user: { id: "teen-account" } },
    tenantContext: null,
  } as never)

  const result = await caller.current()
  expect(tenantReads).toBe(1)
  expect(result.tenant.id).toBe("teen-business")
  expect(result.activeStore?.id).toBe("store-1")
})
