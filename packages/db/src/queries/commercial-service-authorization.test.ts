import { expect, test } from "bun:test"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  authorizeCommercialOrderChargeOnlyServiceLine,
  authorizeCommercialOrderChargeOnlyServiceLineInTransaction,
} from "./commercial-service-authorization"

const input = {
  actorUserId: "manager-1",
  tenantId: "tenant-1",
  orderLineId: "line-1",
  clientOperationId: "release-001",
  reason: "Manager approved release",
  schemaVersion: 1,
}

function fixture(
  options: {
    active?: boolean
    authorized?: Record<string, unknown> | null
    completedAt?: Date | null
    clinical?: boolean
    discover?: boolean
    kind?: string
    missingMembershipLock?: boolean
    policy?: string | null
    quantity?: string
    role?: string
    status?: string
    tenantActive?: boolean
    tenantId?: string
    tracked?: boolean
    uniqueConflict?: boolean
    workPolicy?: string | null
  } = {},
) {
  const calls: string[] = []
  let writes = 0
  let source = options.authorized ?? null
  const order = {
    id: "order-1",
    tenantId: options.tenantId ?? "tenant-1",
    storeId: "store-1",
    currencyCode: "NGN",
    customerId: null,
    status: options.status ?? "CONFIRMED",
    completedAt: options.completedAt ?? null,
  }
  const line = () => ({
    id: "line-1",
    orderId: order.id,
    kind: options.kind ?? "SERVICE",
    quantity: { toString: () => options.quantity ?? "2" },
    order: {
      ...order,
      store: { tenantId: order.tenantId },
      acceptedCommerceQuoteVersion: options.clinical
        ? { quote: { sourceType: "PRESCRIPTION_REQUEST" } }
        : null,
      prescriptionPickupFulfillment: null,
      prescriptionDeliveryAssignment: null,
    },
    snapshot: {
      serviceWorkPolicy:
        options.workPolicy === undefined ? "CHARGE_ONLY" : options.workPolicy,
      serviceAuthorizationPolicy:
        options.policy === undefined ? "MANUAL_RELEASE" : options.policy,
    },
    serviceAuthorization: source,
    serviceFulfillment: null,
    serviceJobLines: options.tracked ? [{ id: "job-line-1" }] : [],
  })
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ")
      if (sql.includes('"FinanceBook"')) {
        calls.push("book")
        return [{ id: "book-1" }]
      }
      if (sql.includes('"CustomerLedgerAccount"')) {
        calls.push("customer-lock")
        return [{ id: "account-1" }]
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
              role: options.role ?? "MANAGER",
              tenant: { isActive: options.tenantActive !== false },
            },
    },
    commercialOrder: {
      findFirst: async () => order,
    },
    commercialOrderLine: {
      findFirst: async ({ select }: { select: { kind?: boolean } }) => {
        if (options.discover === false && !select.kind) return null
        return select.kind
          ? line()
          : {
              id: "line-1",
              orderId: order.id,
              order: { storeId: order.storeId, tenantId: order.tenantId },
            }
      },
    },
    commercialServiceAuthorization: {
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
          throw new Prisma.PrismaClientKnownRequestError("Duplicate release", {
            code: "P2002",
            clientVersion: "7.6.0",
          })
        writes++
        source = { ...data, id: "authorization-1", createdAt: new Date() }
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
  }
}

test("manager release locks financial Order, shares Membership, locks scoped line, and replays exact command", async () => {
  const f = fixture()
  const result = await authorizeCommercialOrderChargeOnlyServiceLine(
    f.db,
    input,
  )
  expect(result.quantity).toBe("2")
  expect(f.calls).toEqual([
    "book",
    "order-lock",
    "membership-lock",
    "line-lock",
  ])
  expect(
    await authorizeCommercialOrderChargeOnlyServiceLine(f.db, input),
  ).toEqual(result)
  await expect(
    authorizeCommercialOrderChargeOnlyServiceLine(f.db, {
      ...input,
      reason: "Different reason",
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  expect(f.writes).toBe(1)
})

test.each([
  { options: { role: "CASHIER" }, code: "SERVICE_WORK_NOT_AUTHORIZED" },
  { options: { role: "OPERATOR" }, code: "SERVICE_WORK_NOT_AUTHORIZED" },
  { options: { role: "SUPPORT" }, code: "SERVICE_WORK_NOT_AUTHORIZED" },
  { options: { role: "MEMBER" }, code: "SERVICE_WORK_NOT_AUTHORIZED" },
  { options: { active: false }, code: "SERVICE_WORK_NOT_AUTHORIZED" },
  { options: { tenantActive: false }, code: "SERVICE_WORK_NOT_AUTHORIZED" },
  {
    options: { missingMembershipLock: true },
    code: "SERVICE_WORK_NOT_AUTHORIZED",
  },
  { options: { discover: false }, code: "ORDER_NOT_FOUND" },
  { options: { policy: null }, code: "SERVICE_WORK_NOT_AUTHORIZED" },
  {
    options: { policy: "ON_ORDER_CONFIRMATION" },
    code: "SERVICE_WORK_NOT_AUTHORIZED",
  },
  { options: { workPolicy: null }, code: "SERVICE_WORK_NOT_AUTHORIZED" },
  { options: { workPolicy: "TRACKED" }, code: "SERVICE_WORK_NOT_AUTHORIZED" },
  { options: { tracked: true }, code: "SERVICE_WORK_NOT_AUTHORIZED" },
  { options: { clinical: true }, code: "INVALID_ORDER" },
  { options: { status: "CANCELLED" }, code: "REVISION_CONFLICT" },
  { options: { status: "COMPLETED" }, code: "REVISION_CONFLICT" },
  { options: { quantity: "0" }, code: "INVALID_ORDER" },
  { options: { quantity: "not-a-quantity" }, code: "INVALID_ORDER" },
  {
    options: { authorized: { id: "existing-release" } },
    code: "REVISION_CONFLICT",
  },
])(
  "release rejects invalid role, scope, source, or state before writes ($options)",
  async ({ options, code }) => {
    const f = fixture(options)
    await expect(
      authorizeCommercialOrderChargeOnlyServiceLine(f.db, input),
    ).rejects.toMatchObject({ code })
    expect(f.writes).toBe(0)
  },
)

test("a competing release uniqueness conflict is mapped to a safe Commerce error", async () => {
  const f = fixture({ uniqueConflict: true })
  await expect(
    authorizeCommercialOrderChargeOnlyServiceLine(f.db, input),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  expect(f.writes).toBe(0)
})

test("caller-owned transaction retains service authority and exact replay", async () => {
  const f = fixture()
  const first =
    await authorizeCommercialOrderChargeOnlyServiceLineInTransaction(
      f.tx,
      input,
    )
  const writes = f.writes
  expect(
    await authorizeCommercialOrderChargeOnlyServiceLineInTransaction(
      f.tx,
      input,
    ),
  ).toEqual(first)
  expect(f.writes).toBe(writes)
  const revoked = fixture({ active: false })
  await expect(
    authorizeCommercialOrderChargeOnlyServiceLineInTransaction(
      revoked.tx,
      input,
    ),
  ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
  expect(revoked.writes).toBe(0)
})

test("composed service command refuses another active Store before writes", async () => {
  const f = fixture()
  await expect(
    authorizeCommercialOrderChargeOnlyServiceLineInTransaction(f.tx, {
      ...input,
      storeId: "other-store",
    }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  expect(f.writes).toBe(0)
})
