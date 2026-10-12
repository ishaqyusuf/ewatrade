import { expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import { readServiceWorkEditorContextInTransaction } from "./service-work-editor-context"

const scope = {
  tenantId: "tenant",
  storeId: "store",
  actorUserId: "actor",
  jobId: "job",
}
function fixture() {
  const state = {
    active: true,
    role: "OWNER",
    mode: "LEGACY",
    store: true,
    memberCount: 2,
  }
  const job = {
    id: "job",
    commercialOrderId: "order",
    commercialOrder: {
      id: "order",
      tenantId: "tenant",
      storeId: "store",
      orderNumber: "ORD-1",
      customerName: "Amina",
      acceptedCommerceQuoteVersion: null as {
        quote: { sourceType: string }
      } | null,
      prescriptionPickupFulfillment: null as { id: string } | null,
      prescriptionDeliveryAddress: null as { id: string } | null,
      _count: { prescriptionPaymentIntents: 0 },
    },
    dueCommitments: [{ promisedAt: new Date("2026-10-14T10:00:00Z") }],
  }
  const line = {
    id: "line",
    allocatedQuantity: new Prisma.Decimal(2),
    status: "IN_PROGRESS",
    authorizationStatus: "AUTHORIZED",
    commercialOrderLine: {
      orderId: "order",
      snapshot: { offeringName: "Wash", variantName: "Standard" },
    },
  }
  const tx = {
    $queryRaw: async () =>
      state.active
        ? [
            {
              id: "actor-member",
              role: state.role,
              staffAccessMode: state.mode,
            },
          ]
        : [],
    store: { findFirst: async () => (state.store ? { id: "store" } : null) },
    staffStoreAssignment: { findFirst: async () => ({ id: "grant" }) },
    serviceJob: {
      findFirst: async (args: {
        where: { id: string; storeId: string; tenantId: string }
      }) => {
        expect(args.where).toEqual({
          id: scope.jobId,
          storeId: scope.storeId,
          tenantId: scope.tenantId,
        })
        return job
      },
    },
    serviceJobLine: {
      findFirst: async (args: {
        where: { id: string; serviceJobId: string }
      }) => {
        expect(args.where.serviceJobId).toBe("job")
        return args.where.id === "line" ? line : null
      },
    },
    membership: {
      findMany: async (args: {
        take: number
        where: Prisma.MembershipWhereInput
        select: unknown
      }) => {
        expect(args.take).toBe(101)
        expect(args.where.tenantId).toBe(scope.tenantId)
        expect(args.where.status).toBe("ACTIVE")
        expect(args.where.OR).toContainEqual({
          staffStoreAssignments: {
            some: { tenantId: "tenant", storeId: "store", status: "ACTIVE" },
          },
        })
        expect(args.select).toEqual({
          user: {
            select: { id: true, name: true, displayName: true, email: true },
          },
        })
        return Array.from({ length: state.memberCount }, (_, i) => ({
          user: {
            id: `staff-${i}`,
            name: `Staff ${i}`,
            displayName: null,
            email: `staff-${i}@example.test`,
          },
        }))
      },
    },
    $transaction: () => {
      throw Error("Reader must not nest")
    },
  }
  return { state, job, line, tx: tx as unknown as Prisma.TransactionClient }
}

test("editor context retains exact saved Job/Line and canonical Store-eligible choices", async () => {
  const f = fixture()
  const result = await readServiceWorkEditorContextInTransaction(f.tx, {
    ...scope,
    lineId: "line",
  })
  expect(result).toMatchObject({
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.actorUserId,
    job: { id: "job", promisedAt: "2026-10-14T10:00:00.000Z" },
    line: { id: "line", quantity: "2", status: "IN_PROGRESS" },
    assigneesComplete: true,
  })
  expect(result.assignees).toEqual([
    { id: "staff-0", name: "Staff 0" },
    { id: "staff-1", name: "Staff 1" },
  ])
})
test("a truncated assignee scan is unavailable instead of an incomplete selection", async () => {
  const f = fixture()
  f.state.memberCount = 101
  const result = await readServiceWorkEditorContextInTransaction(f.tx, scope)
  expect(result.assigneesComplete).toBe(false)
  expect(result.assignees).toEqual([])
})
test("revoked, archived and scoped Manager authority cannot load editor choices", async () => {
  const f = fixture()
  f.state.active = false
  await expect(
    readServiceWorkEditorContextInTransaction(f.tx, scope),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  f.state.active = true
  f.state.store = false
  await expect(
    readServiceWorkEditorContextInTransaction(f.tx, scope),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  f.state.store = true
  f.state.role = "MANAGER"
  f.state.mode = "SCOPED"
  await expect(
    readServiceWorkEditorContextInTransaction(f.tx, scope),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})
test("foreign Line/Order and conflicting original promises fail closed", async () => {
  const f = fixture()
  await expect(
    readServiceWorkEditorContextInTransaction(f.tx, {
      ...scope,
      lineId: "foreign",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  f.line.commercialOrderLine.orderId = "another"
  await expect(
    readServiceWorkEditorContextInTransaction(f.tx, {
      ...scope,
      lineId: "line",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  f.job.commercialOrder.storeId = "another"
  await expect(
    readServiceWorkEditorContextInTransaction(f.tx, scope),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  f.job.commercialOrder.storeId = "store"
  f.job.dueCommitments.push({ promisedAt: new Date("2026-10-15T10:00:00Z") })
  await expect(
    readServiceWorkEditorContextInTransaction(f.tx, scope),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})

test("clinical source, pickup, delivery and payment markers refuse before commercial preparation", async () => {
  for (const marker of ["source", "pickup", "delivery", "payment"]) {
    const f = fixture()
    const order = f.job.commercialOrder
    if (marker === "source")
      order.acceptedCommerceQuoteVersion = {
        quote: { sourceType: "PRESCRIPTION_REQUEST" },
      }
    if (marker === "pickup")
      order.prescriptionPickupFulfillment = { id: "clinical-pickup" }
    if (marker === "delivery")
      order.prescriptionDeliveryAddress = { id: "clinical-address" }
    if (marker === "payment") order._count.prescriptionPaymentIntents = 1
    await expect(
      readServiceWorkEditorContextInTransaction(f.tx, { ...scope }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  }
})
