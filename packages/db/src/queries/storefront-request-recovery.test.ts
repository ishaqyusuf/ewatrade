import { expect, test } from "bun:test"
import { findVerifiedStorefrontRequest } from "./storefront-customers"
import type { DbClient } from "./types"

type Where = Record<string, unknown>

/**
 * Fake repository that applies the same scoping the query asks for, so a test fails if
 * the query stops constraining tenant, Store, verified phone or ownership.
 */
function fixture() {
  const customers = [
    { id: "wa", tenantId: "t1", phoneE164: "+2348031234567" },
    { id: "email", tenantId: "t1", phoneE164: null },
    { id: "other", tenantId: "t1", phoneE164: "+2348039999999" },
  ]
  const orders = [
    {
      id: "o-guest",
      tenantId: "t1",
      storeId: "s1",
      reference: "R-7KQ2MX",
      customerPhone: "+2348031234567",
      customerId: null as string | null,
    },
    {
      id: "o-store2",
      tenantId: "t1",
      storeId: "s2",
      reference: "R-ST4RE2",
      customerPhone: "+2348031234567",
      customerId: null,
    },
    {
      id: "o-taken",
      tenantId: "t1",
      storeId: "s1",
      reference: "R-TAKEN2",
      customerPhone: "+2348031234567",
      customerId: "someone-else",
    },
    {
      id: "o-t2",
      tenantId: "t2",
      storeId: "s1",
      reference: "R-7KQ2MX",
      customerPhone: "+2348031234567",
      customerId: null,
    },
  ]
  const services = [
    {
      id: "ctx",
      serviceRequestId: "sr-1",
      tenantId: "t1",
      reference: "S-7KQ2MX",
      customerId: "wa" as string | null,
      serviceRequest: {
        tenantId: "t1",
        storeId: "s1",
        customerPhone: "+2348031234567",
      },
    },
  ]
  const calls: { model: string; where: Where }[] = []
  const owned = (where: Where, row: { customerId: string | null }) =>
    (where.OR as { customerId: string | null }[]).some(
      (entry) => entry.customerId === row.customerId,
    )
  const db = {
    storefrontCustomer: {
      findFirst: async ({ where }: { where: Where }) => {
        calls.push({ model: "customer", where })
        return (
          customers.find(
            (row) => row.id === where.id && row.tenantId === where.tenantId,
          ) ?? null
        )
      },
    },
    storefrontOrderRequest: {
      findFirst: async ({ where }: { where: Where }) => {
        calls.push({ model: "order", where })
        return (
          orders.find(
            (row) =>
              row.tenantId === where.tenantId &&
              row.storeId === where.storeId &&
              row.reference === where.reference &&
              row.customerPhone === where.customerPhone &&
              owned(where, row),
          ) ?? null
        )
      },
    },
    storefrontServiceRequestContext: {
      findFirst: async ({ where }: { where: Where }) => {
        calls.push({ model: "service", where })
        const request = where.serviceRequest as Where
        return (
          services.find(
            (row) =>
              row.tenantId === where.tenantId &&
              row.reference === where.reference &&
              owned(where, row) &&
              row.serviceRequest.tenantId === request.tenantId &&
              row.serviceRequest.storeId === request.storeId &&
              row.serviceRequest.customerPhone === request.customerPhone,
          ) ?? null
        )
      },
    },
  } as unknown as DbClient
  return { db, calls }
}

const scope = { tenantId: "t1", storeId: "s1", customerId: "wa" }

test("the verified WhatsApp owner opens their own guest order and service request", async () => {
  const { db } = fixture()
  expect(
    await findVerifiedStorefrontRequest(db, {
      ...scope,
      reference: "r 7kq2mx",
    }),
  ).toEqual({ kind: "order", requestId: "o-guest" })
  // Service receipts are signed over the canonical service request ID.
  expect(
    await findVerifiedStorefrontRequest(db, {
      ...scope,
      reference: "S-7KQ2MX",
    }),
  ).toEqual({ kind: "service", requestId: "sr-1" })
})

test("a reference alone never resolves: other numbers, email logins, Stores, tenants and owners read as not found", async () => {
  const { db, calls } = fixture()
  const miss = (input: Partial<typeof scope> & { reference: unknown }) =>
    findVerifiedStorefrontRequest(db, { ...scope, ...input })
  // A different verified number knowing the right reference.
  expect(await miss({ customerId: "other", reference: "R-7KQ2MX" })).toBeNull()
  // Email sessions carry no proven phone, so nothing is even queried.
  calls.length = 0
  expect(await miss({ customerId: "email", reference: "R-7KQ2MX" })).toBeNull()
  expect(calls.map((call) => call.model)).toEqual(["customer"])
  // Same tenant, another Store; another tenant's customer can't be used here.
  expect(await miss({ reference: "R-ST4RE2" })).toBeNull()
  expect(calls.at(-1)).toMatchObject({
    model: "order",
    where: { storeId: "s1", reference: "R-ST4RE2" },
  })
  expect(await miss({ tenantId: "t2", reference: "R-7KQ2MX" })).toBeNull()
  // Already linked to another account.
  expect(await miss({ reference: "R-TAKEN2" })).toBeNull()
  // Unknown customer row.
  expect(await miss({ customerId: "nobody", reference: "R-7KQ2MX" })).toBeNull()
})

test("malformed references make no database read", async () => {
  const { db, calls } = fixture()
  for (const reference of [
    "",
    "R-7KQ2M",
    "https://x.test",
    { contains: "R-" },
    undefined,
  ])
    expect(
      await findVerifiedStorefrontRequest(db, { ...scope, reference }),
    ).toBeNull()
  expect(calls).toEqual([])
})

test("queries are scoped to tenant, Store, verified phone and unlinked-or-own requests", async () => {
  const { db, calls } = fixture()
  await findVerifiedStorefrontRequest(db, { ...scope, reference: "R-7KQ2MX" })
  await findVerifiedStorefrontRequest(db, { ...scope, reference: "S-7KQ2MX" })
  const order = calls.find((call) => call.model === "order")?.where
  expect(order).toEqual({
    tenantId: "t1",
    storeId: "s1",
    reference: "R-7KQ2MX",
    customerPhone: "+2348031234567",
    OR: [{ customerId: null }, { customerId: "wa" }],
  })
  const service = calls.find((call) => call.model === "service")?.where
  expect(service).toEqual({
    tenantId: "t1",
    reference: "S-7KQ2MX",
    OR: [{ customerId: null }, { customerId: "wa" }],
    serviceRequest: {
      tenantId: "t1",
      storeId: "s1",
      customerPhone: "+2348031234567",
    },
  })
})
