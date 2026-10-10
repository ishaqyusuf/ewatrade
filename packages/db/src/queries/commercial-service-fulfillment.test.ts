import { expect, test } from "bun:test"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  fulfillCommercialOrderChargeOnlyServiceLine,
  fulfillCommercialOrderChargeOnlyServiceLineInTransaction,
} from "./commercial-service-fulfillment"

const input = {
  actorUserId: "actor-1",
  tenantId: "tenant-1",
  orderLineId: "line-1",
  clientOperationId: "performance-001",
  reason: "Complete Service performed",
  schemaVersion: 1,
}

function fixture(
  options: {
    active?: boolean
    role?: string
    authorization?: Record<string, unknown> | null
    missingMembershipLock?: boolean
    policy?: string | null
    workPolicy?: string | null
    prescription?: boolean
    priorJobs?: boolean
    status?: string
    uniqueConflict?: boolean
  } = {},
) {
  const calls: string[] = []
  let writes = 0
  let source: Record<string, unknown> | null = null
  const order = {
    id: "order-1",
    tenantId: "tenant-1",
    storeId: "store-1",
    currencyCode: "NGN",
    customerId: null,
    status: options.status ?? "CONFIRMED",
    completedAt: null as Date | null,
    amountPaidMinor: 0,
    totalMinor: 2000,
    paymentStatus: "PENDING",
    payments: [],
    deliveryDueAt: null,
    store: { tenantId: "tenant-1" },
    acceptedCommerceQuoteVersion: options.prescription
      ? { quote: { sourceType: "PRESCRIPTION_REQUEST" } }
      : null,
    prescriptionPickupFulfillment: null,
    prescriptionDeliveryAssignment: null,
  }
  const line = () => ({
    id: "line-1",
    orderId: order.id,
    kind: "SERVICE",
    quantity: { toString: () => "2" },
    order,
    snapshot: {
      serviceWorkPolicy:
        options.workPolicy === undefined ? "CHARGE_ONLY" : options.workPolicy,
      serviceAuthorizationPolicy:
        options.policy === undefined ? "ON_ORDER_CONFIRMATION" : options.policy,
    },
    serviceJobLines: options.priorJobs ? [{ id: "job-line-1" }] : [],
    serviceAuthorization: options.authorization ?? null,
    serviceFulfillment: source,
    productFulfillments: [],
  })
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ")
      if (sql.includes('"FinanceBook"')) {
        calls.push("book")
        return [{ id: "book-1" }]
      }
      if (sql.includes('"CommercialOrderLine"')) {
        calls.push("line-lock")
        return [{ id: "line-1" }]
      }
      if (sql.includes('"CommercialOrder"')) {
        calls.push("order-lock")
        return [{ id: order.id }]
      }
      if (sql.includes('"Membership"')) {
        calls.push("membership-lock")
        return options.missingMembershipLock ? [] : [{ id: "membership-1" }]
      }
      throw new Error("Unexpected lock")
    },
    membership: {
      findFirst: async () =>
        options.active === false
          ? null
          : {
              role: options.role ?? "OWNER",
              tenant: { isActive: true },
            },
    },
    commercialOrder: {
      findFirst: async () => order,
      update: async ({
        data,
      }: { data: { status: string; completedAt?: Date } }) => {
        writes++
        order.status = data.status
        order.completedAt = data.completedAt ?? order.completedAt
        return order
      },
    },
    commercialOrderLine: {
      findFirst: async ({ select }: { select: { kind?: boolean } }) =>
        select.kind
          ? line()
          : {
              id: "line-1",
              orderId: order.id,
              order: { storeId: "store-1", tenantId: "tenant-1" },
            },
      findMany: async () => [line()],
    },
    commercialServiceFulfillment: {
      findUnique: async ({
        where,
      }: {
        where: { tenantId_clientOperationId: { clientOperationId: string } }
      }) =>
        source?.clientOperationId ===
        where.tenantId_clientOperationId.clientOperationId
          ? source
          : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.uniqueConflict)
          throw new Prisma.PrismaClientKnownRequestError("Duplicate command", {
            code: "P2002",
            clientVersion: "7.6.0",
          })
        writes++
        source = { ...data, id: "source-1", createdAt: new Date() }
        return source
      },
    },
  }
  const db = {
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaClient
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    db,
    calls,
    get writes() {
      return writes
    },
    order,
  }
}

test("charge-only performance locks financial Order before authority and source, and retains exact replay", async () => {
  const f = fixture()
  const result = await fulfillCommercialOrderChargeOnlyServiceLine(f.db, input)
  expect(result.quantity).toBe("2")
  expect(f.order.status).toBe("COMPLETED")
  expect(f.calls).toEqual([
    "book",
    "order-lock",
    "membership-lock",
    "line-lock",
  ])
  expect(
    await fulfillCommercialOrderChargeOnlyServiceLine(f.db, input),
  ).toEqual(result)
  expect(f.writes).toBe(2)
  await expect(
    fulfillCommercialOrderChargeOnlyServiceLine(f.db, {
      ...input,
      reason: "Changed",
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  await expect(
    fulfillCommercialOrderChargeOnlyServiceLine(f.db, {
      ...input,
      clientOperationId: "fresh-command-002",
    }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  expect(f.writes).toBe(2)
})

test("an exact completed performance replay still rechecks current authority", async () => {
  const controls: { active?: boolean } = {}
  const f = fixture(controls)
  await fulfillCommercialOrderChargeOnlyServiceLine(f.db, input)
  controls.active = false
  await expect(
    fulfillCommercialOrderChargeOnlyServiceLine(f.db, input),
  ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
})

test.each([
  { options: { active: false }, code: "SERVICE_WORK_NOT_AUTHORIZED" },
  {
    options: { missingMembershipLock: true },
    code: "SERVICE_WORK_NOT_AUTHORIZED",
  },
  {
    options: { policy: "MANUAL_RELEASE" },
    code: "SERVICE_WORK_NOT_AUTHORIZED",
  },
  {
    options: { policy: "AFTER_REQUIRED_PAYMENT" },
    code: "SERVICE_WORK_NOT_AUTHORIZED",
  },
  { options: { policy: null }, code: "SERVICE_WORK_NOT_AUTHORIZED" },
  { options: { workPolicy: null }, code: "INVALID_ORDER" },
  { options: { workPolicy: "TRACKED" }, code: "INVALID_ORDER" },
  { options: { prescription: true }, code: "INVALID_ORDER" },
  { options: { priorJobs: true }, code: "INVALID_ORDER" },
  { options: { status: "CANCELLED" }, code: "INVALID_ORDER" },
])(
  "invalid charge-only source or authority fails before effects ($options)",
  async ({ options, code }) => {
    const f = fixture(options)
    await expect(
      fulfillCommercialOrderChargeOnlyServiceLine(f.db, input),
    ).rejects.toMatchObject({ code })
    expect(f.writes).toBe(0)
  },
)

test("manual release requires a matching scoped quantity and effective authorization date", async () => {
  const authorizedAt = new Date(Date.now() - 1_000)
  const validRelease = {
    tenantId: "tenant-1",
    orderId: "order-1",
    orderLineId: "line-1",
    quantity: { toString: () => "2" },
    authorizedAt,
  }
  const f = fixture({ policy: "MANUAL_RELEASE", authorization: validRelease })
  const result = await fulfillCommercialOrderChargeOnlyServiceLine(f.db, input)
  expect(result.quantity).toBe("2")
  expect(f.order.status).toBe("COMPLETED")

  const invalidReleases = [
    { ...validRelease, tenantId: "other-tenant" },
    { ...validRelease, orderId: "other-order" },
    { ...validRelease, orderLineId: "other-line" },
    { ...validRelease, quantity: { toString: () => "3" } },
    { ...validRelease, authorizedAt: new Date(Date.now() + 60_000) },
    { ...validRelease, authorizedAt: new Date(Number.NaN) },
  ]
  for (const authorization of invalidReleases) {
    const denied = fixture({ policy: "MANUAL_RELEASE", authorization })
    await expect(
      fulfillCommercialOrderChargeOnlyServiceLine(denied.db, input),
    ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
    expect(denied.writes).toBe(0)
  }
})

test("a competing command uniqueness race exposes a safe conflict and does not update the Order", async () => {
  const f = fixture({ uniqueConflict: true })
  await expect(
    fulfillCommercialOrderChargeOnlyServiceLine(f.db, input),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  expect(f.writes).toBe(0)
})

test("caller-owned transaction retains service authority and exact replay", async () => {
  const f = fixture()
  const first = await fulfillCommercialOrderChargeOnlyServiceLineInTransaction(
    f.tx,
    input,
  )
  const writes = f.writes
  expect(
    await fulfillCommercialOrderChargeOnlyServiceLineInTransaction(f.tx, input),
  ).toEqual(first)
  expect(f.writes).toBe(writes)
  const revoked = fixture({ active: false })
  await expect(
    fulfillCommercialOrderChargeOnlyServiceLineInTransaction(revoked.tx, input),
  ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
  expect(revoked.writes).toBe(0)
})

test("composed service command refuses another active Store before writes", async () => {
  const f = fixture()
  await expect(
    fulfillCommercialOrderChargeOnlyServiceLineInTransaction(f.tx, {
      ...input,
      storeId: "other-store",
    }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  expect(f.writes).toBe(0)
})
