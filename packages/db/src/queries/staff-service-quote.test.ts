import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import {
  type StaffServiceQuoteInput,
  createStaffServiceQuoteSourceInTransaction,
} from "./staff-service-quote"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

const input: StaffServiceQuoteInput = {
  actorUserId: "actor-1",
  tenantId: "tenant-1",
  storeId: "store-1",
  clientQuoteId: "quote-command-1",
  clientVersionId: "version-command-1",
  customerName: "Amina QA",
  customerNote: "Two rooms; supplies included.",
  lines: [
    { offeringId: "shirt", quantity: "2", unitPriceMinor: 20000 },
    { offeringId: "cleaning", quantity: "1", unitPriceMinor: 2500000 },
  ],
}
function fixture() {
  const writes: Array<{ kind: string; data: unknown }> = []
  let request: { id: string; payloadHash: string } | null = null
  const choices = [
    {
      id: "shirt",
      name: "Shirt",
      fixedPriceMinor: 20000,
      pricingPolicy: "FIXED",
      serviceOffering: { quantityScale: 0 },
      variant: { name: "Wash & iron", selections: [] },
    },
    {
      id: "cleaning",
      name: "Cleaning",
      fixedPriceMinor: null,
      pricingPolicy: "QUOTE_REQUIRED",
      serviceOffering: { quantityScale: 0 },
      variant: { name: "Standard", selections: [] },
    },
  ]
  const tx = {
    membership: {
      findFirst: async (): Promise<{ id: string } | null> => ({
        id: "manager-1",
      }),
    },
    store: { findFirst: async () => ({ countryCode: "NG" }) },
    serviceCommercePolicyDecision: {
      findMany: async () => allowedServiceCommercePolicyDecisionRows(),
    },
    serviceCommercePolicyAuditEvent: { createMany: async () => ({ count: 1 }) },
    serviceRequest: {
      findFirst: async () => request,
      create: async ({
        data,
      }: { data: { id: string; payloadHash: string } }) => {
        request = data
        writes.push({ kind: "request", data })
        return data
      },
    },
    serviceRequestForm: {
      create: async ({ data }: { data: unknown }) => {
        writes.push({ kind: "form", data })
        return { id: "private-form" }
      },
    },
    serviceRequestLine: {
      createMany: async ({ data }: { data: unknown }) => {
        writes.push({ kind: "lines", data })
        return { count: 2 }
      },
    },
    sellableOffering: {
      findMany: async ({
        where,
      }: { where: { tenantId: string; storeAvailability: unknown } }) => {
        expect(where.tenantId).toBe("tenant-1")
        expect(where.storeAvailability).toEqual({
          some: { storeId: "store-1", isAvailable: true },
        })
        return choices
      },
    },
    customer: { findFirst: async () => null },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    raw: tx,
    choices,
    writes,
  }
}
test("staff quote source is private, attributed and idempotent without an order or notification", async () => {
  const f = fixture()
  const id = await createStaffServiceQuoteSourceInTransaction(f.tx, input)
  expect(await createStaffServiceQuoteSourceInTransaction(f.tx, input)).toBe(id)
  expect(f.writes).toHaveLength(3)
  expect(f.writes[0]?.data).toMatchObject({
    status: "DRAFT",
    createdByUserId: "actor-1",
    tenantId: "tenant-1",
    storeId: "store-1",
  })
  expect(f.writes[1]?.data).toMatchObject({
    channelOrigin: "STAFF",
    contactOptIn: false,
    requestFormId: "private-form",
    customerName: "Amina QA",
  })
  expect(f.writes[2]?.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ offeringId: "shirt", requestedQuantity: "2" }),
    ]),
  )
  await expect(
    createStaffServiceQuoteSourceInTransaction(f.tx, {
      ...input,
      customerNote: "Changed scope",
    }),
  ).rejects.toThrow("different details")
})
test("revoked manager membership refuses before any source writes", async () => {
  const f = fixture()
  f.raw.membership.findFirst = async () => null
  await expect(
    createStaffServiceQuoteSourceInTransaction(f.tx, input),
  ).rejects.toThrow("Current manager access")
  expect(f.writes).toHaveLength(0)
})
test("unavailable choices and changed fixed prices refuse before source writes", async () => {
  const unavailable = fixture()
  unavailable.choices.pop()
  await expect(
    createStaffServiceQuoteSourceInTransaction(unavailable.tx, input),
  ).rejects.toThrow("no longer available")
  expect(unavailable.writes).toHaveLength(0)
  const changed = fixture()
  changed.choices[0].fixedPriceMinor = 30000
  await expect(
    createStaffServiceQuoteSourceInTransaction(changed.tx, input),
  ).rejects.toThrow("fixed service price changed")
  expect(changed.writes).toHaveLength(0)
})
test("quantities, missing scope and foreign customers refuse before source writes", async () => {
  const f = fixture()
  await expect(
    createStaffServiceQuoteSourceInTransaction(f.tx, {
      ...input,
      lines: input.lines.map((line, index) =>
        index === 0 ? { ...line, quantity: "1.5" } : line,
      ),
    }),
  ).rejects.toThrow()
  await expect(
    createStaffServiceQuoteSourceInTransaction(f.tx, {
      ...input,
      customerNote: "",
    }),
  ).rejects.toThrow("scope")
  await expect(
    createStaffServiceQuoteSourceInTransaction(f.tx, {
      ...input,
      customerId: "foreign-customer",
    }),
  ).rejects.toThrow("no longer available")
  expect(f.writes).toHaveLength(0)
})
test("revoked staff quote policy refuses before source writes", async () => {
  const f = fixture()
  f.raw.serviceCommercePolicyDecision.findMany = async () => []
  await expect(
    createStaffServiceQuoteSourceInTransaction(f.tx, input),
  ).rejects.toThrow()
  expect(f.writes).toHaveLength(0)
})
