import { expect, test } from "bun:test"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { prepareReviewedServiceWorkInTransaction } from "./service-work-review"
import {
  assignServiceJob,
  assignServiceJobInTransaction,
  prepareServiceJobLineTransition,
  rescheduleServiceJob,
  rescheduleServiceJobInTransaction,
  transitionServiceJobLine,
  transitionServiceJobLineInTransaction,
} from "./service-work"

const scope = { tenantId: "tenant", storeId: "store", actorUserId: "actor" }
const now = new Date("2026-10-12T10:00:00.123Z")
function fixture() {
  const state = {
    active: true,
    role: "OWNER",
    scoped: false,
    store: true,
    assignee: true,
    jobStore: "store",
    nested: 0,
    autoReady: false,
    autoReminder: false,
    reminderCancellations: 0,
    outstandingReminders: 0,
    events: [] as Array<Record<string, unknown>>,
    replay: false,
    badReceipt: false,
  }
  const order = {
    id: "order",
    tenantId: "tenant",
    storeId: "store",
    orderNumber: "ORD-1",
    currencyCode: "NGN",
    totalMinor: 2000,
    amountPaidMinor: 0,
    paymentStatus: "UNPAID",
    customerName: "Amina",
    customerPhone: "+2348000000000",
    acceptedCommerceQuoteVersion: null as {
      quote: { sourceType: string }
    } | null,
    prescriptionPickupFulfillment: null as { id: string } | null,
    prescriptionDeliveryAddress: null as { id: string } | null,
    _count: { payments: 0, prescriptionPaymentIntents: 0 },
    payments: [],
  }
  const line = {
    id: "line",
    revision: 2,
    status: "QUEUED",
    authorizationStatus: "AUTHORIZED",
    authorizationPolicy: "AFTER_REQUIRED_PAYMENT",
    allocatedQuantity: new Prisma.Decimal(2),
    commercialOrderLineId: "order-line",
    completedAt: null,
    commercialOrderLine: {
      orderId: "order",
      snapshot: {
        offeringName: "Wash",
        variantName: "Standard",
        catalogItemName: "Service",
        optionSelections: [],
      },
    },
  }
  const job = {
    id: "job",
    revision: 4,
    storeId: "store",
    commercialOrderId: "order",
    currentAssigneeUserId: "previous-staff",
    handedOffAt: null,
    createdAt: now,
    handoffNote: null,
    priority: "NORMAL",
    commercialOrder: order,
    intake: { notificationChannel: "SMS", customerPhone: order.customerPhone },
    assignments: [] as Array<Record<string, unknown>>,
    dueCommitments: [] as Array<Record<string, unknown>>,
    lines: [line],
    evidence: [],
    exceptions: [],
    notes: [],
    notificationIntents: [],
    _count: { lines: 1, notificationIntents: 0 },
  }
  const originalEvent = {
    id: "original-event",
    type: "STATUS_CHANGED",
    serviceJobId: "job",
    createdAt: now,
    effectiveAt: now,
  }
  const tx = {
    $transaction: () => {
      state.nested++
      throw Error("Nested transaction")
    },
    $queryRaw: async () =>
      state.active
        ? [
            {
              id: "actor-membership",
              role: state.role,
              staffAccessMode: state.scoped ? "SCOPED" : "LEGACY",
            },
          ]
        : [],
    store: { findFirst: async () => (state.store ? { id: "store" } : null) },
    staffStoreAssignment: {
      findFirst: async () => ({ id: "manager-assignment", revision: 1 }),
    },
    membership: {
      findFirst: async () =>
        state.assignee
          ? {
              id: "assignee-membership",
              role: "OPERATOR",
              staffAccessRevision: 1,
              user: { id: "staff", name: "Bola" },
            }
          : null,
    },
    serviceJob: {
      findFirst: async ({
        where,
      }: { where: { id: string; storeId?: string; tenantId: string } }) => {
        job._count.notificationIntents = state.outstandingReminders
        return where.id === job.id &&
          where.tenantId === "tenant" &&
          (!where.storeId || where.storeId === state.jobStore)
          ? job
          : null
      },
      update: async ({
        data,
      }: { data: { currentAssigneeUserId?: string } }) => {
        job.revision++
        if (data.currentAssigneeUserId)
          job.currentAssigneeUserId = data.currentAssigneeUserId
        return job
      },
    },
    serviceJobLine: {
      findFirst: async ({
        where,
      }: { where: { id: string; serviceJobId: string } }) =>
        where.id === line.id && where.serviceJobId === job.id ? line : null,
    },
    serviceWorkAssignment: {
      updateMany: async () => ({ count: 1 }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        job.assignments.push({
          ...data,
          id: "assignment",
          assignedAt: now,
          endedAt: null,
        })
        return data
      },
    },
    serviceDueCommitment: {
      update: async () => ({}),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        job.dueCommitments.push({
          ...data,
          id: "promise",
          effectiveAt: now,
          supersededAt: null,
        })
        return data
      },
    },
    serviceWorkEvent: {
      findUnique: async () => (state.replay ? originalEvent : null),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.badReceipt) throw Error("Original receipt failed")
        const event = {
          ...data,
          id: `event-${state.events.length + 1}`,
          createdAt: now,
          effectiveAt: now,
        }
        state.events.push(event)
        return event
      },
    },
    serviceNotificationIntent: {
      updateMany: async () => {
        state.reminderCancellations++
        return { count: state.outstandingReminders }
      },
    },
    serviceStoreSettings: {
      findUnique: async () => ({
        autoNotifyReady: state.autoReady,
        autoNotifyReminder: state.autoReminder,
        defaultNotificationChannel: "SMS",
        reminderLeadMinutes: 60,
      }),
    },
  }
  return {
    state,
    job,
    line,
    tx: tx as unknown as Prisma.TransactionClient,
    originalEvent,
  }
}
test("fresh current Store/actor and eligible assignee precede any mutation", async () => {
  const f = fixture(),
    input = {
      ...scope,
      operation: "assign" as const,
      jobId: "job",
      assigneeUserId: "staff",
    }
  for (const change of [
    () => {
      f.state.active = false
    },
    () => {
      f.state.active = true
      f.state.jobStore = "foreign"
    },
    () => {
      f.state.jobStore = "store"
      f.state.assignee = false
    },
  ]) {
    change()
    await expect(
      prepareReviewedServiceWorkInTransaction(f.tx, input),
    ).rejects.toBeInstanceOf(Error)
    expect(f.state.events).toHaveLength(0)
  }
  f.state.assignee = true
  f.state.role = "MANAGER"
  f.state.scoped = true
  await expect(
    prepareReviewedServiceWorkInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})
test("assignment preparation is read-only; execution keeps original history identity without nesting", async () => {
  const f = fixture()
  const prepared = await prepareReviewedServiceWorkInTransaction(f.tx, {
    ...scope,
    operation: "assign",
    jobId: "job",
    assigneeUserId: "staff",
    reason: "New shift",
  })
  expect(f.state.events).toHaveLength(0)
  expect(prepared.review.assignee?.name).toBe("Bola")
  const result = await prepared.execute("proposal-key")
  expect(result.event.id).toBe("event-1")
  expect(result.event.createdAt).toBe(now)
  expect(result.job.currentAssigneeUserId).toBe("staff")
  expect(f.job.assignments[0]?.previousUserId).toBe("previous-staff")
  expect(f.state.nested).toBe(0)
})
test("reschedule preview discloses reminder replacement and binds settings/precise promise", async () => {
  const f = fixture(),
    input = {
      ...scope,
      operation: "reschedule" as const,
      jobId: "job",
      promisedAt: new Date("2026-10-15T10:00:00.123Z"),
      reason: "Customer requested later pickup",
    }
  f.state.autoReminder = true
  f.state.outstandingReminders = 2
  const first = await prepareReviewedServiceWorkInTransaction(f.tx, input)
  expect(first.review.reminder).toEqual({
    channel: "SMS",
    scheduledFor: "2026-10-15T09:00:00.123Z",
  })
  expect(first.review.replacedReminderCount).toBe(2)
  expect(f.state.reminderCancellations).toBe(0)
  f.state.autoReminder = false
  const second = await prepareReviewedServiceWorkInTransaction(f.tx, input)
  expect(second.target.revision).not.toBe(first.target.revision)
  const result = await second.execute("proposal-key")
  expect(result.event.type).toBe("DUE_COMMITMENT_CREATED")
  expect(result.job.dueCommitmentAt?.toISOString()).toBe(
    input.promisedAt.toISOString(),
  )
  expect(f.state.reminderCancellations).toBe(1)
  expect(f.state.nested).toBe(0)
})
test("line selection, canonical authorization and legal transitions fail closed before writing", async () => {
  const f = fixture(),
    input = {
      ...scope,
      operation: "transition" as const,
      jobId: "job",
      lineId: "foreign",
      toStatus: "in_progress" as const,
    }
  await expect(
    prepareReviewedServiceWorkInTransaction(f.tx, input),
  ).rejects.toBeInstanceOf(Error)
  f.line.authorizationStatus = "PENDING_PAYMENT"
  await expect(
    prepareReviewedServiceWorkInTransaction(f.tx, { ...input, lineId: "line" }),
  ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
  expect(() =>
    prepareServiceJobLineTransition(
      { status: "READY_FOR_HANDOFF", authorizationStatus: "AUTHORIZED" },
      "completed",
    ),
  ).toThrow()
  expect(
    prepareServiceJobLineTransition(
      { status: "QUEUED", authorizationStatus: "PENDING_PAYMENT" },
      "cancelled",
    ),
  ).toBe("CANCELLED")
  expect(f.state.events).toHaveLength(0)
})
test("ready refuses unimplemented automatic notification or pending-reminder cancellation", async () => {
  const f = fixture(),
    input = {
      ...scope,
      operation: "transition" as const,
      jobId: "job",
      lineId: "line",
      toStatus: "ready_for_handoff" as const,
    }
  f.state.outstandingReminders = 1
  await expect(
    prepareReviewedServiceWorkInTransaction(f.tx, input),
  ).rejects.toBeInstanceOf(Error)
  f.state.outstandingReminders = 0
  f.state.autoReady = true
  await expect(
    prepareReviewedServiceWorkInTransaction(f.tx, input),
  ).rejects.toBeInstanceOf(Error)
  f.state.autoReady = false
  expect(
    (await prepareReviewedServiceWorkInTransaction(f.tx, input)).review
      .nextStatus,
  ).toBe("ready_for_handoff")
  expect(f.state.events).toHaveLength(0)
})
test("native transition replay exposes the original event rather than creating another history row", async () => {
  const f = fixture()
  f.state.replay = true
  const seen: string[] = []
  await transitionServiceJobLineInTransaction(
    f.tx,
    {
      actorUserId: "actor",
      tenantId: "tenant",
      clientCommandId: "original-command",
      lineId: "line",
      expectedRevision: 2,
      schemaVersion: 1,
      source: "service_work",
      toStatus: "in_progress",
    },
    (event) => seen.push(event.id),
  )
  expect(seen).toEqual([f.originalEvent.id])
  expect(f.state.events).toHaveLength(0)
  expect(f.state.nested).toBe(0)
})
test("root facades use fresh bounded options; stale native revisions and receipt failures propagate", async () => {
  const f = fixture(),
    options: unknown[] = []
  const root = {
    $transaction: async (
      run: (tx: Prisma.TransactionClient) => Promise<unknown>,
      bounds: unknown,
    ) => {
      options.push(bounds)
      return run(f.tx)
    },
  } as unknown as PrismaClient
  await assignServiceJob(root, {
    ...scope,
    jobId: "job",
    assigneeUserId: "staff",
    expectedRevision: 4,
  })
  await rescheduleServiceJob(root, {
    ...scope,
    jobId: "job",
    expectedRevision: 5,
    promisedAt: new Date("2026-10-15T10:00:00Z"),
    reason: "Later pickup",
  })
  f.state.replay = true
  await transitionServiceJobLine(root, {
    ...scope,
    lineId: "line",
    expectedRevision: 2,
    clientCommandId: "original-command",
    schemaVersion: 1,
    source: "service_work",
    toStatus: "in_progress",
  })
  expect(options).toEqual(
    Array.from({ length: 3 }, () => ({ maxWait: 10000, timeout: 30000 })),
  )
  expect(Object.is(options[0], options[1])).toBe(false)
  await expect(
    assignServiceJobInTransaction(f.tx, {
      ...scope,
      jobId: "job",
      assigneeUserId: "staff",
      expectedRevision: 0,
    }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  await expect(
    rescheduleServiceJobInTransaction(f.tx, {
      ...scope,
      jobId: "job",
      promisedAt: now,
      reason: "Later",
      expectedRevision: 0,
    }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  f.state.badReceipt = true
  await expect(
    assignServiceJobInTransaction(f.tx, {
      ...scope,
      jobId: "job",
      assigneeUserId: "staff",
      expectedRevision: f.job.revision,
    }),
  ).rejects.toThrow("Original receipt failed")
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
      prepareReviewedServiceWorkInTransaction(f.tx, {
        ...scope,
        operation: "assign" as const,
        jobId: "job",
        assigneeUserId: "staff",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  }
})
