import { expect, test } from "bun:test"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  ServiceJobLineStatus,
  WorkAuthorizationStatus,
} from "../../generated/prisma/enums"
import { prepareReviewedServiceWorkCompletionInTransaction } from "./service-work-completion-review"
import {
  createServiceRework,
  recordServiceHandoff,
  recordServiceHandoffInTransaction,
} from "./service-work"

const scope = {
  actorUserId: "actor",
  tenantId: "tenant",
  storeId: "store",
  jobId: "job",
}
const recordedAt = new Date("2026-10-12T13:00:00.123Z")
const effectiveAt = new Date("2026-10-11T13:00:00.456Z")
const rework = {
  ...scope,
  operation: "rework" as const,
  lineId: "line",
  quantity: "1.25",
  reason: "Redo the stated allocation",
}
const handoff = {
  ...scope,
  operation: "handoff" as const,
  note: "Collected by customer",
}
function fixture() {
  const state = {
    active: true,
    role: "OWNER",
    mode: "LEGACY",
    store: true,
    nested: 0,
    writes: 0,
    options: [] as object[],
    locks: [] as string[],
  }
  const order = {
    id: "order",
    tenantId: "tenant",
    storeId: "store",
    status: "CONFIRMED",
    customerId: null,
    orderNumber: "ORD-1",
    customerName: "Amina",
    currencyCode: "NGN",
    totalMinor: 1000,
    amountPaidMinor: 1000,
    paymentStatus: "PAID",
    payments: [{ id: "original-payment" }],
    completedAt: null,
    acceptedCommerceQuoteVersion: null as {
      quote: { sourceType: string }
    } | null,
    prescriptionPickupFulfillment: null as { id: string } | null,
    prescriptionDeliveryAddress: null as { id: string } | null,
    _count: { payments: 1, prescriptionPaymentIntents: 0 },
  }
  const line = {
    id: "line",
    serviceJobId: "job",
    commercialOrderLineId: "sold-line",
    revision: 2,
    status: ServiceJobLineStatus.COMPLETED as ServiceJobLineStatus,
    authorizationStatus:
      WorkAuthorizationStatus.AUTHORIZED as WorkAuthorizationStatus,
    authorizationPolicy: "ON_ORDER_CONFIRMATION",
    authorizationSource: "order_confirmation",
    authorizedAt: effectiveAt,
    allocatedQuantity: new Prisma.Decimal(2),
    completedAt: recordedAt as Date | null,
    reworkOfLineId: null as string | null,
    allocationSnapshot: { original: true },
    commercialOrderLine: {
      orderId: "order",
      snapshot: { offeringName: "Wash", variantName: "Standard" },
    },
  }
  const job = {
    id: "job",
    tenantId: "tenant",
    storeId: "store",
    commercialOrderId: "order",
    revision: 4,
    clientJobId: "original-client-job",
    priority: "NORMAL",
    currentAssigneeUserId: "staff" as string | null,
    handedOffAt: null as Date | null,
    commercialOrder: order,
    lines: [line],
    events: [] as Array<Record<string, unknown>>,
    assignments: [],
    dueCommitments: [],
    evidence: [],
    exceptions: [],
    notes: [],
    intake: null,
    notificationIntents: [] as Array<{
      id: string
      status: string
      templatePurpose: string
      scheduledFor: Date | null
      updatedAt: Date
      deliveryAttempts: []
      manualShares: []
    }>,
  }
  const jobs = new Map<string, typeof job>([[job.id, job]])
  let nextId = 0
  let obligationQuantity = "2"
  const tx = {
    $transaction: () => {
      state.nested++
      throw Error("Nested transaction")
    },
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join("?")
      if (sql.includes('"Membership"'))
        return state.active
          ? [
              {
                id: "membership",
                role: state.role,
                staffAccessMode: state.mode,
              },
            ]
          : []
      for (const name of [
        "FinanceBook",
        "CommercialOrder",
        "ServiceBooking",
        "ServiceJob",
      ]) {
        if (sql.includes(`"${name}"`)) {
          state.locks.push(name)
          return name === "CommercialOrder"
            ? [order]
            : name === "ServiceJob" ? [{ id: "job" }] : []
        }
      }
      return []
    },
    store: { findFirst: async () => (state.store ? { id: "store" } : null) },
    staffStoreAssignment: {
      findFirst: async () => ({ id: "assignment", revision: 1 }),
    },
    serviceJob: {
      findFirst: async ({
        where,
        select,
      }: {
        where: { id: string; tenantId: string; storeId?: string }
        select?: {
          lines?: { where?: { id: string } }
          notificationIntents?: object
        }
      }) => {
        const found = jobs.get(where.id)
        if (
          !found ||
          where.tenantId !== found.tenantId ||
          (where.storeId && where.storeId !== found.storeId)
        )
          return null
        if (!select?.notificationIntents) return found
        return {
          ...found,
          lines: select.lines?.where
            ? found.lines.filter((row) => row.id === select.lines?.where?.id)
            : found.lines,
          notificationIntents: found.notificationIntents.filter((row) =>
            ["PENDING", "READY"].includes(row.status),
          ),
        }
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.writes++
        const child = {
          ...job,
          ...data,
          id: `rework-${++nextId}`,
          lines: [],
          events: [],
          revision: 0,
          currentAssigneeUserId: null,
          handedOffAt: null,
          notificationIntents: [],
        } as typeof job
        jobs.set(child.id, child)
        return child
      },
      update: async ({
        where,
        data,
      }: { where: { id: string }; data: Record<string, unknown> }) => {
        state.writes++
        const found = jobs.get(where.id)!
        const revision = found.revision
        Object.assign(found, data)
        if (data.revision) found.revision = revision + 1
        return found
      },
    },
    serviceJobLine: {
      findFirst: async ({
        where,
      }: { where: { id: string; serviceJob?: { tenantId: string } } }) =>
        where.id === line.id &&
        (!where.serviceJob || where.serviceJob.tenantId === "tenant")
          ? { ...line, serviceJob: job }
          : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.writes++
        const created = {
          ...line,
          ...data,
          id: `new-line-${nextId}`,
          status: ServiceJobLineStatus.QUEUED,
          completedAt: null,
          allocatedQuantity: new Prisma.Decimal(String(data.allocatedQuantity)),
        } as typeof line
        jobs.get(String(data.serviceJobId))!.lines.push(created)
        return created
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string }
        data: { status: ServiceJobLineStatus; completedAt: Date }
      }) => {
        expect(where.id).toBe(line.id)
        state.writes++
        Object.assign(line, data)
        line.revision++
        return line
      },
    },
    serviceWorkEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.writes++
        const original = {
          ...data,
          id: `event-${state.writes}`,
          createdAt: recordedAt,
          effectiveAt,
        }
        jobs.get(String(data.serviceJobId))!.events.push(original)
        return original
      },
    },
    commercialOrder: {
      findFirst: async () => order,
      findUniqueOrThrow: async () => order,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.writes++
        Object.assign(order, data)
        return order
      },
    },
    commercialOrderLine: {
      findMany: async () => [
        {
          id: "sold-line",
          kind: "SERVICE",
          quantity: new Prisma.Decimal(obligationQuantity),
          snapshot: {
            serviceWorkPolicy: "TRACKED",
            serviceAuthorizationPolicy: "ON_ORDER_CONFIRMATION",
          },
          productFulfillments: [],
          serviceAuthorization: null,
          serviceFulfillment: null,
          serviceJobLines: [
            {
              ...line,
              serviceJob: {
                commercialOrderId: "order",
                storeId: "store",
                tenantId: "tenant",
              },
            },
          ],
        },
      ],
    },
    serviceNotificationIntent: {
      updateMany: async () => {
        state.writes++
        for (const row of job.notificationIntents)
          if (
            row.templatePurpose === "due_reminder" &&
            ["PENDING", "READY"].includes(row.status)
          )
            row.status = "CANCELLED"
        return { count: job.notificationIntents.length }
      },
    },
  }
  const db = {
    $transaction: async <T>(
      run: (client: Prisma.TransactionClient) => Promise<T>,
      options: object,
    ) => {
      state.options.push(options)
      const before = {
        job: { ...job, lines: [...job.lines], events: [...job.events] },
        line: { ...line },
        order: { ...order },
        ids: [...jobs.keys()],
        writes: state.writes,
      }
      try {
        return await run(tx as unknown as Prisma.TransactionClient)
      } catch (error) {
        Object.assign(job, before.job)
        Object.assign(line, before.line)
        Object.assign(order, before.order)
        for (const key of jobs.keys())
          if (!before.ids.includes(key)) jobs.delete(key)
        state.writes = before.writes
        throw error
      }
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    db: db as unknown as PrismaClient,
    state,
    job,
    line,
    order,
    jobs,
    setObligationQuantity: (value: string) => {
      obligationQuantity = value
    },
  }
}
test("native rework caller-owned seam retains completed source, linked queued allocation and original REWORK history", async () => {
  const f = fixture()
  const prepared = await prepareReviewedServiceWorkCompletionInTransaction(
    f.tx,
    rework,
  )
  expect(f.state.writes).toBe(0)
  const result = await prepared.execute("command-rework")
  expect(result.job.id).not.toBe("job")
  expect(String(f.line.status)).toBe(ServiceJobLineStatus.COMPLETED)
  expect(result.job.lines[0]?.allocatedQuantity).toBe("1.25")
  expect(result.job.lines[0]?.status).toBe(ServiceJobLineStatus.QUEUED)
  expect(result.event.type).toBe("REWORK")
  expect(result.event.createdAt).toEqual(recordedAt)
  expect(result.event.effectiveAt).toEqual(effectiveAt)
  expect(f.jobs.get(result.job.id)?.events[0]?.clientCommandId).toBe(
    "command-rework",
  )
  expect(f.state.nested).toBe(0)
})
test("native handoff preserves financial lock order, distinct owning event and original due-reminder cancellation", async () => {
  const f = fixture()
  f.line.status = ServiceJobLineStatus.READY_FOR_HANDOFF
  f.job.notificationIntents.push({
    id: "original-due",
    status: "READY",
    templatePurpose: "due_reminder",
    scheduledFor: effectiveAt,
    updatedAt: recordedAt,
    deliveryAttempts: [],
    manualShares: [],
  })
  const prepared = await prepareReviewedServiceWorkCompletionInTransaction(
    f.tx,
    handoff,
  )
  expect(prepared.review.cancelledDueReminderCount).toBe(1)
  expect(f.state.writes).toBe(0)
  const result = await prepared.execute("command-handoff")
  expect(f.state.locks).toEqual([
    "FinanceBook",
    "CommercialOrder",
    "ServiceBooking",
    "ServiceJob",
  ])
  expect(result.event.type).toBe("REMOTE_HANDOFF")
  expect(result.event.id).not.toBe(f.job.events[0]?.id)
  expect(result.event.createdAt).toEqual(recordedAt)
  expect(String(f.line.status)).toBe(ServiceJobLineStatus.COMPLETED)
  expect(f.job.notificationIntents[0]?.status).toBe("CANCELLED")
  expect(f.state.nested).toBe(0)
  const writes = f.state.writes
  let replayEvent: unknown
  await recordServiceHandoffInTransaction(
    f.tx,
    { ...scope, clientCommandId: "later-key", expectedRevision: 0 },
    (event) => {
      replayEvent = event
    },
  )
  expect(replayEvent).toEqual(result.event)
  expect(f.state.writes).toBe(writes)
})
test("fresh preparation refuses unpaid, unready, unauthorized, cancelled-only and already handed-off work", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.order.amountPaidMinor = 999
    },
    (f: ReturnType<typeof fixture>) => {
      f.line.status = ServiceJobLineStatus.QUEUED
    },
    (f: ReturnType<typeof fixture>) => {
      f.line.authorizationStatus = WorkAuthorizationStatus.PENDING_PAYMENT
    },
    (f: ReturnType<typeof fixture>) => {
      f.line.status = ServiceJobLineStatus.CANCELLED
    },
    (f: ReturnType<typeof fixture>) => {
      f.job.handedOffAt = recordedAt
    },
  ]) {
    const f = fixture()
    f.line.status = ServiceJobLineStatus.READY_FOR_HANDOFF
    change(f)
    await expect(
      prepareReviewedServiceWorkCompletionInTransaction(f.tx, handoff),
    ).rejects.toThrow()
    expect(f.state.writes).toBe(0)
  }
})
test("completed source and exact quantity are canonical; no reasonless or foreign rework", async () => {
  for (const patch of [
    { quantity: "0" },
    { quantity: "2.000001" },
    { reason: " " },
    { lineId: "foreign" },
    { jobId: "foreign" },
  ]) {
    const f = fixture()
    await expect(
      prepareReviewedServiceWorkCompletionInTransaction(f.tx, {
        ...rework,
        ...patch,
      }),
    ).rejects.toThrow()
    expect(f.state.writes).toBe(0)
  }
  const f = fixture()
  f.line.status = ServiceJobLineStatus.READY_FOR_HANDOFF
  await expect(
    prepareReviewedServiceWorkCompletionInTransaction(f.tx, rework),
  ).rejects.toThrow()
})
test("fresh authority, Store/Order scope and every clinical marker refuse both operations before writes", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.state.active = false
    },
    (f: ReturnType<typeof fixture>) => {
      f.state.role = "MANAGER"
      f.state.mode = "SCOPED"
    },
    (f: ReturnType<typeof fixture>) => {
      f.job.storeId = "other"
    },
    (f: ReturnType<typeof fixture>) => {
      f.order.tenantId = "other"
    },
    (f: ReturnType<typeof fixture>) => {
      f.order.acceptedCommerceQuoteVersion = {
        quote: { sourceType: "PRESCRIPTION_REQUEST" },
      }
    },
    (f: ReturnType<typeof fixture>) => {
      f.order.prescriptionPickupFulfillment = { id: "clinical" }
    },
    (f: ReturnType<typeof fixture>) => {
      f.order.prescriptionDeliveryAddress = { id: "clinical" }
    },
    (f: ReturnType<typeof fixture>) => {
      f.order._count.prescriptionPaymentIntents = 1
    },
  ])
    for (const input of [rework, handoff]) {
      const f = fixture()
      change(f)
      await expect(
        prepareReviewedServiceWorkCompletionInTransaction(f.tx, input),
      ).rejects.toThrow()
      expect(f.state.writes).toBe(0)
    }
})
test("missing customer-update orchestration refuses, while reminder and original-obligation drift change handoff freshness", async () => {
  const f = fixture()
  f.line.status = ServiceJobLineStatus.READY_FOR_HANDOFF
  const first = await prepareReviewedServiceWorkCompletionInTransaction(
    f.tx,
    handoff,
  )
  f.job.notificationIntents.push({
    id: "due",
    status: "PENDING",
    templatePurpose: "due_reminder",
    scheduledFor: effectiveAt,
    updatedAt: recordedAt,
    deliveryAttempts: [],
    manualShares: [],
  })
  const second = await prepareReviewedServiceWorkCompletionInTransaction(
    f.tx,
    handoff,
  )
  expect(second.target.revision).not.toBe(first.target.revision)
  f.job.notificationIntents[0]!.status = "READY"
  const third = await prepareReviewedServiceWorkCompletionInTransaction(
    f.tx,
    handoff,
  )
  expect(third.target.revision).not.toBe(second.target.revision)
  f.setObligationQuantity("3")
  expect(
    (await prepareReviewedServiceWorkCompletionInTransaction(f.tx, handoff))
      .target.revision,
  ).not.toBe(third.target.revision)
  f.job.notificationIntents[0]!.templatePurpose = "ready_for_collection"
  await expect(
    prepareReviewedServiceWorkCompletionInTransaction(f.tx, handoff),
  ).rejects.toThrow()
  f.line.status = ServiceJobLineStatus.COMPLETED
  await expect(
    prepareReviewedServiceWorkCompletionInTransaction(f.tx, rework),
  ).rejects.toThrow()
  expect(f.state.writes).toBe(0)
})
test("stale handoff revision fails before writes and a fresh review recovers", async () => {
  const f = fixture()
  f.line.status = ServiceJobLineStatus.READY_FOR_HANDOFF
  const stale = await prepareReviewedServiceWorkCompletionInTransaction(
    f.tx,
    handoff,
  )
  f.job.revision++
  await expect(stale.execute("stale-command")).rejects.toThrow(
    "changed before customer collection",
  )
  expect(f.state.writes).toBe(0)
  const fresh = await prepareReviewedServiceWorkCompletionInTransaction(
    f.tx,
    handoff,
  )
  expect(fresh.target.revision).not.toBe(stale.target.revision)
  expect((await fresh.execute("fresh-command")).event.type).toBe(
    "REMOTE_HANDOFF",
  )
})
test("stale completed source allocation fails canonical rework before writes and a fresh smaller quantity recovers", async () => {
  const f = fixture()
  const stale = await prepareReviewedServiceWorkCompletionInTransaction(
    f.tx,
    rework,
  )
  f.line.allocatedQuantity = new Prisma.Decimal(1)
  await expect(stale.execute("stale-rework")).rejects.toThrow("cannot exceed")
  expect(f.state.writes).toBe(0)
  const fresh = await prepareReviewedServiceWorkCompletionInTransaction(f.tx, {
    ...rework,
    quantity: "0.5",
  })
  expect(fresh.target.revision).not.toBe(stale.target.revision)
  expect(
    (await fresh.execute("fresh-rework")).job.lines[0]?.allocatedQuantity,
  ).toBe("0.5")
})
test("bounded original work review never presents a truncated Job as ready", async () => {
  const f = fixture()
  f.line.status = ServiceJobLineStatus.READY_FOR_HANDOFF
  f.job.lines = Array.from({ length: 101 }, (_, index) => ({
    ...f.line,
    id: `line-${index}`,
  }))
  await expect(
    prepareReviewedServiceWorkCompletionInTransaction(f.tx, handoff),
  ).rejects.toThrow("bounded review")
  expect(f.state.writes).toBe(0)
})
test("caller transaction receipt failure restores rework writes and allows fresh recovery in the deterministic transaction fixture", async () => {
  const f = fixture()
  const failure = Error("Atomic receipt persistence failed")
  await expect(
    f.db.$transaction(async (tx) => {
      const prepared = await prepareReviewedServiceWorkCompletionInTransaction(
        tx,
        rework,
      )
      await prepared.execute("rolled-back-command")
      throw failure
    }),
  ).rejects.toBe(failure)
  expect(f.jobs.size).toBe(1)
  expect(f.job.events).toHaveLength(0)
  expect(String(f.line.status)).toBe(ServiceJobLineStatus.COMPLETED)
  expect(f.state.writes).toBe(0)
  const recovered = await prepareReviewedServiceWorkCompletionInTransaction(
    f.tx,
    rework,
  )
  expect((await recovered.execute("recovered-command")).event.type).toBe(
    "REWORK",
  )
})
test("native root facades open fresh bounded transactions without nesting or changing signatures", async () => {
  const f = fixture()
  await createServiceRework(f.db, {
    ...scope,
    lineId: "line",
    quantity: "1",
    reason: "Redo",
    clientCommandId: "native-rework",
  })
  f.line.status = ServiceJobLineStatus.READY_FOR_HANDOFF
  await recordServiceHandoff(f.db, {
    ...scope,
    expectedRevision: 4,
    clientCommandId: "native-handoff",
  })
  expect(f.state.options).toEqual([
    { maxWait: 10000, timeout: 30000 },
    { maxWait: 10000, timeout: 30000 },
  ])
  expect(f.state.options[0]).not.toBe(f.state.options[1])
  expect(f.state.nested).toBe(0)
})
