import { expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import {
  confirmServiceIntakeInTransaction,
  createAndConfirmServiceIntakeInTransaction,
  serviceIntakeReviewRevision,
} from "./service-work"

const command = {
  tenantId: "tenant",
  storeId: "store",
  actorUserId: "actor",
  schemaVersion: 1,
  clientIntakeId: "intake-command",
  requestedAssigneeId: "staff",
  dueCommitmentAt: new Date("2100-01-15T10:00:00.123Z"),
  lines: [
    { offeringId: "tracked", quantity: "2", expectedFixedPriceMinor: 1000 },
  ],
}

function fixture() {
  const now = new Date("2026-10-12T12:00:00Z")
  const snapshot = {
    id: "snapshot",
    catalogItemName: "Original item",
    variantName: "Original variant",
    offeringName: "Original offering",
    optionSelections: [{ valueKey: "original-option" }],
    serviceWorkPolicy: "TRACKED",
    serviceAuthorizationPolicy: "AFTER_REQUIRED_PAYMENT" as string | null,
    pricingPolicy: "FIXED",
    offeringKind: "SERVICE",
    unitPriceMinor: 1000,
  }
  const orderLine = {
    id: "order-line",
    offeringId: "tracked",
    quantity: new Prisma.Decimal(2),
    kind: "SERVICE",
    totalMinor: 2000,
    unitPriceMinor: 1000,
    snapshot,
    productFulfillments: [],
    productReturns: [],
    serviceFulfillment: null,
    serviceAuthorization: null,
    stockReservation: null,
  }
  const orderInput = {
    tenantId: "tenant",
    storeId: "store",
    actorUserId: "actor",
    schemaVersion: 1,
    clientOrderId: "intake-command:order",
    createTrackedServiceWork: false,
    lines: command.lines,
    serviceChargeMinor: 0,
  }
  const order = {
    id: "order",
    tenantId: "tenant",
    storeId: "store",
    orderNumber: "ORD-001",
    currencyCode: "NGN",
    amountPaidMinor: 0,
    paymentStatus: "UNPAID",
    totalMinor: 2000,
    serviceChargeMinor: 0,
    customerName: null,
    lines: [orderLine],
    payments: [],
    payloadHash: serviceIntakeReviewRevision(orderInput),
  }
  const intake = {
    id: "intake",
    tenantId: "tenant",
    storeId: "store",
    clientIntakeId: command.clientIntakeId,
    payloadHash: serviceIntakeReviewRevision(command),
    status: "DRAFT",
    commercialOrderId: null as string | null,
    lines: [{ ...command.lines[0], quantity: new Prisma.Decimal(2) }],
    customerName: null,
    customerEmail: null,
    customerPhone: null,
    instructions: null,
    initialPaymentMinor: 0,
    initialPaymentMethod: null,
    serviceChargeMinor: 0,
    dueCommitmentAt: command.dueCommitmentAt,
    requestedAssigneeId: "staff",
    priority: "NORMAL",
    notificationChannel: null,
  }
  const state = { tracked: true }
  let intakeReads = 0
  let jobData: Record<string, unknown> = {}
  let workLine: Record<string, unknown> = {}
  const assignments: Record<string, unknown>[] = []
  const commitments: Record<string, unknown>[] = []
  const trackedQueries: unknown[] = []
  const jobQueries: unknown[] = []
  const events: unknown[] = []
  let cancellations = 0
  const graph = () => ({
    ...jobData,
    id: "job",
    revision: 1,
    createdAt: now,
    storeId: "store",
    commercialOrderId: "order",
    commercialOrder: order,
    lines: [workLine],
    assignments,
    dueCommitments: commitments,
    evidence: [],
    exceptions: [],
    notes: [],
    events,
    notificationIntents: [],
    intake: { notificationChannel: null },
  })
  const tx = {
    serviceIntake: {
      findUnique: async () => intake,
      findFirst: async () => {
        intakeReads++
        return intake
      },
      update: async ({
        data,
      }: { data: { status: string; commercialOrderId: string } }) => {
        Object.assign(intake, data)
        return intake
      },
    },
    commercialOrder: { findUnique: async () => order },
    commercialOrderLine: {
      findMany: async (args: unknown) => {
        trackedQueries.push(args)
        return state.tracked ? [orderLine] : []
      },
    },
    serviceJob: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        jobData = data
        return { ...data, id: "job" }
      },
      findFirst: async (args: unknown) => {
        jobQueries.push(args)
        return graph()
      },
      findMany: async (args: unknown) => {
        jobQueries.push(args)
        return [graph()]
      },
    },
    serviceJobLine: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        workLine = {
          ...data,
          id: "work-line",
          status: "QUEUED",
          revision: 1,
          commercialOrderLine: orderLine,
        }
        return workLine
      },
    },
    serviceWorkEvent: {
      create: async (args: unknown) => {
        events.push(args)
        return { id: "event" }
      },
    },
    serviceWorkAssignment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assignments.push({ ...data, id: "assignment", assignedAt: now })
        return assignments[0]
      },
    },
    serviceDueCommitment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        commitments.push({ ...data, id: "commitment", effectiveAt: now })
        return commitments[0]
      },
    },
    serviceNotificationIntent: {
      updateMany: async () => {
        cancellations++
        return { count: 0 }
      },
      findMany: async () => [],
    },
    serviceStoreSettings: {
      findUnique: async () => {
        throw Error("Unexpected no-phone settings read")
      },
    },
    tenant: {
      findUnique: async () => {
        throw Error("Unexpected no-phone timezone read")
      },
    },
  } as unknown as Prisma.TransactionClient
  return {
    tx,
    intake,
    state,
    snapshot,
    intakeReads: () => intakeReads,
    trackedQueries,
    jobQueries,
    events,
    cancellations: () => cancellations,
  }
}

test("atomic and standalone confirmation keep identical complete work results and snapshot policies", async () => {
  const atomic = fixture()
  const standalone = fixture()
  const result = await createAndConfirmServiceIntakeInTransaction(
    atomic.tx,
    command,
  )
  const other = await confirmServiceIntakeInTransaction(standalone.tx, {
    tenantId: "tenant",
    actorUserId: "actor",
    intakeId: "intake",
    schemaVersion: 1,
  })
  expect(result).toEqual(other)
  expect(atomic.intakeReads()).toBe(0)
  expect(standalone.intakeReads()).toBe(1)
  expect(result).toMatchObject({
    intakeId: "intake",
    orderId: "order",
    notificationIntentIds: [],
    jobs: [
      {
        id: "job",
        currentAssigneeUserId: "staff",
        amountPaidMinor: 0,
        balanceDueMinor: 2000,
        dueCommitmentAt: command.dueCommitmentAt,
        assignments: [{ assignedUserId: "staff" }],
        dueHistory: [{ promisedAt: command.dueCommitmentAt }],
        lines: [
          {
            allocatedQuantity: "2",
            authorizationStatus: "PENDING_PAYMENT",
            catalogItemName: "Original item",
            variantName: "Original variant",
            offeringName: "Original offering",
          },
        ],
      },
    ],
  })
  expect(atomic.trackedQueries).toEqual([
    {
      include: { snapshot: true },
      where: { orderId: "order", snapshot: { serviceWorkPolicy: "TRACKED" } },
    },
  ])
  expect(atomic.jobQueries[0]).toMatchObject({
    include: {
      commercialOrder: {
        include: { payments: { orderBy: { recordedAt: "asc" } } },
      },
      lines: {
        include: { commercialOrderLine: { include: { snapshot: true } } },
      },
      notificationIntents: {
        include: { deliveryAttempts: {}, manualShares: {} },
      },
      assignments: {},
      dueCommitments: {},
      evidence: {},
      exceptions: {},
      notes: {},
      events: {},
    },
  })
  expect(atomic.events).toHaveLength(1)
  expect(atomic.cancellations()).toBe(1)
  expect(atomic.intake.status).toBe("CONFIRMED")
  expect(
    await createAndConfirmServiceIntakeInTransaction(atomic.tx, command),
  ).toEqual(result)
  expect(atomic.jobQueries).toHaveLength(2)
})

test("persisted foreign Tenant graph refuses before confirmation or work reads", async () => {
  const f = fixture()
  f.intake.tenantId = "foreign"
  await expect(
    createAndConfirmServiceIntakeInTransaction(f.tx, command),
  ).rejects.toMatchObject({ code: "SERVICE_INTAKE_NOT_FOUND" })
  expect(f.jobQueries).toHaveLength(0)
  expect(f.trackedQueries).toHaveLength(0)
})

test("cancelled intake and mismatched replay identity retain typed refusals", async () => {
  const f = fixture()
  f.intake.status = "CANCELLED"
  await expect(
    createAndConfirmServiceIntakeInTransaction(f.tx, command),
  ).rejects.toMatchObject({ code: "INVALID_SERVICE_TRANSITION" })
  await expect(
    createAndConfirmServiceIntakeInTransaction(f.tx, {
      ...command,
      requestedAssigneeId: "different",
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  expect(f.jobQueries).toHaveLength(0)
})

test("charge-only persisted work creates no Job, assignment, event or reminder", async () => {
  const f = fixture()
  f.state.tracked = false
  f.snapshot.serviceWorkPolicy = "CHARGE_ONLY"
  const result = await createAndConfirmServiceIntakeInTransaction(f.tx, command)
  expect(result).toEqual({
    intakeId: "intake",
    orderId: "order",
    jobs: [],
    notificationIntentIds: [],
  })
  expect(f.jobQueries).toHaveLength(0)
  expect(f.events).toHaveLength(0)
  expect(f.cancellations()).toBe(0)
  expect(f.intake.status).toBe("CONFIRMED")
})

test("missing immutable work policy still refuses instead of substituting current Offering policy", async () => {
  const f = fixture()
  f.snapshot.serviceAuthorizationPolicy = null
  await expect(
    createAndConfirmServiceIntakeInTransaction(f.tx, command),
  ).rejects.toMatchObject({ code: "INVALID_SERVICE_TRANSITION" })
  expect(f.jobQueries).toHaveLength(0)
  expect(f.events).toHaveLength(0)
})

test("standalone confirmation still rejects a wrong scoped persisted graph", async () => {
  const f = fixture()
  await expect(
    confirmServiceIntakeInTransaction(f.tx, {
      tenantId: "foreign",
      actorUserId: "actor",
      intakeId: "intake",
      schemaVersion: 1,
    }),
  ).rejects.toMatchObject({ code: "SERVICE_INTAKE_NOT_FOUND" })
  expect(f.intakeReads()).toBe(1)
  expect(f.jobQueries).toHaveLength(0)
})

test("confirmed intake replay never adds a second name-only customer", async () => {
  const f = fixture()
  const original = await createAndConfirmServiceIntakeInTransaction(
    f.tx,
    command,
  )
  const named = {
    ...command,
    saveNewCustomer: true,
    customerName: "Ishaq Yusuf",
  }
  f.intake.payloadHash = serviceIntakeReviewRevision(named)
  // This fixture has no Customer delegate: a repeated customer operation fails.
  expect(await createAndConfirmServiceIntakeInTransaction(f.tx, named)).toEqual(
    original,
  )
})
