import { expect, test } from "bun:test"
import type { OfflineCommand, Prisma } from "../../generated/prisma/client"
import {
  type CreateCommercialOrderInput,
  createCommercialOrderGraphInTransaction,
} from "./commercial-orders"
import { fulfillCatalogFreeLinesInTransaction } from "./commercial-service-fulfillment"
import {
  type RecoveryFulfillmentAuthorization,
  assertRecoveryCreation,
  authorizeRecoveryFulfillment,
  recoveryFulfillmentReviewer,
} from "./offline-recovery-fulfillment-authorization"

const creation = {
  actorUserId: "original-rep",
  tenantId: "qa-tenant",
  storeId: "original-store",
  clientOrderId: "original-offline-command",
  schemaVersion: 1,
  fulfillNow: true,
  lines: [
    { custom: "quick_sale" as const, amountMinor: 500, description: "Rice" },
  ],
  initialPayment: {
    amountMinor: 500,
    clientPaymentId: "original-payment",
    method: "cash" as const,
    moneyAccountId: "original-cash",
  },
} satisfies CreateCommercialOrderInput

const fulfillment = {
  actorUserId: creation.actorUserId,
  tenantId: creation.tenantId,
  orderId: "original-order",
  clientOperationIdPrefix: `${creation.clientOrderId}:fulfillment`,
  schemaVersion: 1,
}

function heldCommand(): OfflineCommand {
  return {
    id: "held-command-row",
    tenantId: creation.tenantId,
    storeId: creation.storeId,
    clientCommandId: creation.clientOrderId,
    status: "REVIEW_REQUIRED",
    payload: {
      actorUserId: creation.actorUserId,
      _offlineRecovery: {
        kind: "suspended_staff",
        version: 1,
        membershipId: "original-membership",
        accessRevision: 2,
        accessChangedAt: "2026-10-17T10:00:00.000Z",
        lifecycleEventId: "original-suspension",
        receivedAt: "2026-10-17T11:00:00.000Z",
      },
    },
  } as unknown as OfflineCommand
}

type Member = { role: string; status: string }
type StoredFulfillment = {
  actorUserId: string
  payloadHash: string
  clientOperationId: string
  tenantId: string
}
function fixture() {
  const members = new Map<string, Member>([
    ["reviewer", { role: "OWNER", status: "ACTIVE" }],
    [creation.actorUserId, { role: "CASHIER", status: "SUSPENDED" }],
  ])
  const order = {
    id: fulfillment.orderId,
    tenantId: creation.tenantId,
    storeId: creation.storeId,
    clientOrderId: creation.clientOrderId,
    createdByUserId: creation.actorUserId,
  }
  const writes: StoredFulfillment[] = []
  const checkedActors: string[] = []
  const orderReads: unknown[] = []
  let tenantActive = true
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (!strings.join(" ").includes('FROM "Membership"'))
        throw Error("Unexpected SQL port")
      const [tenantId, actorUserId] = values
      if (tenantId !== creation.tenantId || typeof actorUserId !== "string")
        return []
      const member = members.get(actorUserId)
      if (!member) return []
      return strings.join(" ").includes('SELECT "role", "status"')
        ? [{ ...member }]
        : [{ id: `membership:${actorUserId}` }]
    },
    membership: {
      findFirst: async ({
        where,
      }: { where: { tenantId: string; userId: string; status: string } }) => {
        checkedActors.push(where.userId)
        const member = members.get(where.userId)
        return where.tenantId === creation.tenantId &&
          member?.status === where.status
          ? { role: member.role, tenant: { isActive: tenantActive } }
          : null
      },
    },
    commercialOrder: {
      findFirst: async (query: { where: Record<string, unknown> }) => {
        orderReads.push(query)
        return Object.entries(query.where).every(
          ([key, value]) => Reflect.get(order, key) === value,
        )
          ? { id: order.id }
          : null
      },
    },
    commercialOrderLine: {
      findMany: async () => [{ id: "original-line", quantity: "1" }],
    },
    commercialServiceFulfillment: {
      createMany: async ({ data }: { data: StoredFulfillment[] }) => {
        writes.push(...data)
        return { count: data.length }
      },
    },
  } as unknown as Prisma.TransactionClient
  return {
    tx,
    members,
    order,
    writes,
    checkedActors,
    orderReads,
    setTenantActive(active: boolean) {
      tenantActive = active
    },
    authorize: (
      input: CreateCommercialOrderInput = creation,
      command = heldCommand(),
      reviewerUserId = "reviewer",
    ) =>
      authorizeRecoveryFulfillment(tx, {
        creation: input,
        command,
        reviewerUserId,
      }),
  }
}

for (const reviewerRole of ["OWNER", "ADMIN"]) {
  test(`${reviewerRole} recovery authority preserves original fulfillment author and canonical hash`, async () => {
    const ordinary = fixture()
    ordinary.members.set(creation.actorUserId, {
      role: "CASHIER",
      status: "ACTIVE",
    })
    expect(
      await fulfillCatalogFreeLinesInTransaction(ordinary.tx, fulfillment),
    ).toBe(1)
    const recovery = fixture()
    recovery.members.set("reviewer", { role: reviewerRole, status: "ACTIVE" })
    const authorization = await recovery.authorize()
    expect(Object.isFrozen(authorization)).toBe(true)
    expect(() =>
      assertRecoveryCreation(recovery.tx, authorization, creation),
    ).not.toThrow()
    expect(
      await fulfillCatalogFreeLinesInTransaction(
        recovery.tx,
        fulfillment,
        authorization,
      ),
    ).toBe(1)
    expect(recovery.writes[0]?.actorUserId).toBe(creation.actorUserId)
    expect(recovery.writes[0]?.tenantId).toBe(creation.tenantId)
    expect(recovery.writes[0]?.clientOperationId).toBe(
      `${fulfillment.clientOperationIdPrefix}:original-line`,
    )
    expect(recovery.writes[0]?.payloadHash).toBe(
      ordinary.writes[0]?.payloadHash ?? "missing ordinary hash",
    )
    expect(recovery.checkedActors).toEqual(["reviewer"])
    expect(recovery.members.get(creation.actorUserId)?.status).toBe("SUSPENDED")
    expect(recovery.orderReads).toEqual([
      {
        where: {
          id: fulfillment.orderId,
          tenantId: creation.tenantId,
          storeId: creation.storeId,
          clientOrderId: creation.clientOrderId,
          createdByUserId: creation.actorUserId,
        },
        select: { id: true },
      },
    ])
  })
}

test("ordinary suspended fulfillment retains its active POS membership guard", async () => {
  const f = fixture()
  await expect(
    fulfillCatalogFreeLinesInTransaction(f.tx, fulfillment),
  ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
  expect(f.checkedActors).toEqual([creation.actorUserId])
  expect(f.writes).toHaveLength(0)
})

for (const member of [
  { role: "OWNER", status: "SUSPENDED" },
  { role: "ADMIN", status: "REMOVED" },
  { role: "MANAGER", status: "ACTIVE" },
  { role: "CASHIER", status: "ACTIVE" },
]) {
  test(`cannot issue recovery authority to ${member.status} ${member.role}`, async () => {
    const f = fixture()
    f.members.set("reviewer", member)
    await expect(f.authorize()).rejects.toMatchObject({
      code: "SERVICE_WORK_NOT_AUTHORIZED",
    })
    expect(f.writes).toHaveLength(0)
  })
}

test("missing reviewer and self approval cannot issue recovery authority", async () => {
  const f = fixture()
  f.members.delete("reviewer")
  await expect(f.authorize()).rejects.toMatchObject({
    code: "SERVICE_WORK_NOT_AUTHORIZED",
  })
  f.members.set(creation.actorUserId, { role: "OWNER", status: "ACTIVE" })
  await expect(
    f.authorize(creation, heldCommand(), creation.actorUserId),
  ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
  expect(f.writes).toHaveLength(0)
})

for (const [key, value] of [
  ["status", "APPLIED"],
  ["tenantId", "foreign-tenant"],
  ["storeId", "foreign-store"],
  ["clientCommandId", "another-command"],
  ["payload", { actorUserId: creation.actorUserId }],
  [
    "payload",
    { ...(heldCommand().payload as object), actorUserId: "another-author" },
  ],
] as const) {
  test(`issuance refuses a held command with wrong ${key} ${JSON.stringify(value)}`, async () => {
    const f = fixture()
    const command = {
      ...heldCommand(),
      [key]: value,
    } as unknown as OfflineCommand
    await expect(f.authorize(creation, command)).rejects.toMatchObject({
      code: "SERVICE_WORK_NOT_AUTHORIZED",
    })
    expect(f.writes).toHaveLength(0)
  })
}

for (const token of [{}, Object.freeze({}), JSON.parse("{}")]) {
  test("JSON-shaped or forged recovery tokens cannot enter creation or fulfillment", async () => {
    const f = fixture()
    const forged = token as RecoveryFulfillmentAuthorization
    expect(() => assertRecoveryCreation(f.tx, forged, creation)).toThrow()
    await expect(
      createCommercialOrderGraphInTransaction(f.tx, creation, forged),
    ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
    await expect(
      fulfillCatalogFreeLinesInTransaction(f.tx, fulfillment, forged),
    ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
    expect(f.writes).toHaveLength(0)
  })
}

test("an issued token is unusable in another transaction or after serialization", async () => {
  const f = fixture()
  const other = fixture()
  const authorization = await f.authorize()
  expect(() =>
    assertRecoveryCreation(other.tx, authorization, creation),
  ).toThrow()
  await expect(
    recoveryFulfillmentReviewer(other.tx, authorization, fulfillment),
  ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
  await expect(
    fulfillCatalogFreeLinesInTransaction(other.tx, fulfillment, authorization),
  ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
  await expect(
    fulfillCatalogFreeLinesInTransaction(
      f.tx,
      fulfillment,
      structuredClone(authorization),
    ),
  ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
  expect(other.writes).toHaveLength(0)
  expect(f.writes).toHaveLength(0)
})

for (const change of [
  { actorUserId: "another-author" },
  { tenantId: "foreign-tenant" },
  { storeId: "foreign-store" },
  { clientOrderId: "another-command" },
  { fulfillNow: false },
  {
    lines: [
      {
        custom: "quick_sale" as const,
        amountMinor: 999,
        description: "Changed sale",
      },
    ],
  },
  {
    initialPayment: {
      ...creation.initialPayment,
      moneyAccountId: "another-cash",
    },
  },
]) {
  test(`creation cannot use its issued authority after changing ${Object.keys(change).join()}`, async () => {
    const f = fixture()
    const authorization = await f.authorize()
    const changed = { ...creation, ...change }
    expect(() => assertRecoveryCreation(f.tx, authorization, changed)).toThrow()
    await expect(
      createCommercialOrderGraphInTransaction(f.tx, changed, authorization),
    ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
    expect(f.writes).toHaveLength(0)
  })
}

for (const change of [
  { actorUserId: "another-author" },
  { tenantId: "foreign-tenant" },
  { orderId: "another-order" },
  { clientOperationIdPrefix: "another-command:fulfillment" },
]) {
  test(`fulfillment refuses issued authority with wrong ${Object.keys(change).join()}`, async () => {
    const f = fixture()
    const authorization = await f.authorize()
    await expect(
      fulfillCatalogFreeLinesInTransaction(
        f.tx,
        { ...fulfillment, ...change },
        authorization,
      ),
    ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
    expect(f.writes).toHaveLength(0)
  })
}

for (const key of [
  "tenantId",
  "storeId",
  "clientOrderId",
  "createdByUserId",
] as const) {
  test(`fulfillment rechecks actual Order ${key} against original creation`, async () => {
    const f = fixture()
    const authorization = await f.authorize()
    f.order[key] = "changed-order-origin"
    await expect(
      fulfillCatalogFreeLinesInTransaction(f.tx, fulfillment, authorization),
    ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
    expect(f.writes).toHaveLength(0)
  })
}

test("authority issued for no immediate fulfillment cannot authorize performance", async () => {
  const f = fixture()
  const authorization = await f.authorize({ ...creation, fulfillNow: false })
  await expect(
    fulfillCatalogFreeLinesInTransaction(f.tx, fulfillment, authorization),
  ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
  expect(f.writes).toHaveLength(0)
})

test("actual fulfillment still requires the reviewer active and Tenant enabled at execution", async () => {
  const f = fixture()
  const authorization = await f.authorize()
  f.members.set("reviewer", { role: "OWNER", status: "SUSPENDED" })
  await expect(
    fulfillCatalogFreeLinesInTransaction(f.tx, fulfillment, authorization),
  ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
  f.members.set("reviewer", { role: "OWNER", status: "ACTIVE" })
  f.setTenantActive(false)
  await expect(
    fulfillCatalogFreeLinesInTransaction(f.tx, fulfillment, authorization),
  ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
  expect(f.writes).toHaveLength(0)
})
