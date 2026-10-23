import { expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { ServiceJobLineStatus } from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"
import { completeServiceJob, recordServiceHandoff } from "./service-work"

const completedAt = new Date("2031-01-01T00:00:00.000Z")

function sourceAllocation(input: {
  allocatedQuantity: string
  authorizationStatus?: string
  completedAt?: Date | null
  jobId?: string
  status: string
}) {
  return {
    allocatedQuantity: { toString: () => input.allocatedQuantity },
    authorizationStatus: input.authorizationStatus ?? "AUTHORIZED",
    completedAt: input.completedAt ?? null,
    reworkOfLineId: null,
    serviceJob: {
      commercialOrderId: "order-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    },
    status: input.status,
    jobId: input.jobId ?? "job-1",
  }
}

function createHandoffDb(input: {
  completionAllocations: ReturnType<typeof sourceAllocation>[]
  initialLines: ReadonlyArray<{
    allocatedQuantity: string
    authorizationStatus: string
    completedAt: Date | null
    id: string
    revision: number
    status: string
  }>
  orderLineQuantity?: string
  amountPaidMinor?: number
  orderStatus?: string
  onOrderUpdate?: (data: Record<string, unknown>) => void
}) {
  const lockOrder: string[] = []
  const writes = { line: 0, payment: 0, workEvent: 0 }
  const amountPaidMinor = input.amountPaidMinor ?? 1000
  const events: Array<Record<string, unknown>> = []
  const savedJob = {
    revision: 4,
    completedAt: null as Date | null,
    handedOffAt: null as Date | null,
    handedOffByUserId: null as string | null,
    handoffNote: null as string | null,
  }
  const currentLines = input.initialLines.map((line) => ({ ...line }))
  const financialOrder = {
    amountPaidMinor,
    completedAt,
    currencyCode: "NGN",
    customerId: null,
    id: "order-1",
    paymentStatus:
      amountPaidMinor === 1000
        ? "PAID"
        : amountPaidMinor > 0
          ? "PARTIALLY_PAID"
          : "PENDING",
    status: input.orderStatus ?? "FULFILLING",
    tenantId: "tenant-1",
    storeId: "store-1",
    totalMinor: 1000,
  }
  const job = () => ({
    ...savedJob,
    assignments: [],
    commercialOrder: {
      ...financialOrder,
      orderNumber: "ORD-1",
      payments: amountPaidMinor ? [{ id: "payment-1" }] : [],
      serviceChargeMinor: 0,
    },
    commercialOrderId: "order-1",
    createdAt: completedAt,
    currentAssigneeUserId: null,
    dueCommitments: [],
    evidence: [],
    events,
    exceptions: [],
    id: "job-1",
    intake: null,
    lines: currentLines.map((line) => ({
      ...line,
      allocatedQuantity: { toString: () => line.allocatedQuantity },
      authorizationPolicy: "REQUIRED",
      commercialOrderLine: { snapshot: null },
      commercialOrderLineId: "order-line-1",
    })),
    notes: [],
    notificationIntents: [],
    priority: "NORMAL",
    store: { serviceSettings: null },
    storeId: "store-1",
  })
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const query = strings.join(" ")
      if (query.includes('"FinanceBook"')) {
        lockOrder.push("finance-book")
        return []
      }
      if (query.includes('"CommercialOrder"')) {
        lockOrder.push("order")
        return [financialOrder]
      }
      if (query.includes('"ServiceBooking"')) {
        lockOrder.push("booking")
        return [{ id: "booking-1" }]
      }
      if (query.includes('"ServiceJob"')) {
        lockOrder.push("job")
        return [{ id: "job-1" }]
      }
      throw new Error(`Unexpected lock query: ${query}`)
    },
    commercialOrder: {
      findFirst: async (args: { select?: unknown }) =>
        args.select
          ? { customerId: null, currencyCode: "NGN" }
          : financialOrder,
      findUniqueOrThrow: async () => ({
        ...financialOrder,
        payments: amountPaidMinor ? [{ id: "payment-1" }] : [],
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        input.onOrderUpdate?.(data)
        Object.assign(
          financialOrder,
          Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
          ),
        )
        return { id: "order-1" }
      },
    },
    commercialOrderLine: {
      findMany: async () => [
        {
          kind: "SERVICE",
          productFulfillments: [],
          quantity: { toString: () => input.orderLineQuantity ?? "1" },
          serviceJobLines: input.completionAllocations,
        },
      ],
    },
    commercialOrderPayment: {
      findUnique: async () => {
        writes.payment++
        throw new Error("Optional handoff payment must not run")
      },
    },
    serviceJob: {
      findFirst: async (args: {
        select?: unknown
        where: { id: string; tenantId: string; storeId?: string }
      }) =>
        args.where.id !== "job-1" ||
        args.where.tenantId !== "tenant-1" ||
        (args.where.storeId && args.where.storeId !== "store-1")
          ? null
          : args.select
            ? { commercialOrderId: "order-1", id: "job-1", storeId: "store-1" }
            : job(),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        const { revision, ...fields } = data
        Object.assign(savedJob, fields)
        if (revision) savedJob.revision++
        return { id: "job-1" }
      },
    },
    serviceJobLine: {
      update: async ({
        where,
        data,
      }: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.line++
        const line = currentLines.find((line) => line.id === where.id)
        if (!line) throw Error("Missing line")
        const { revision, ...fields } = data
        Object.assign(line, fields)
        if (revision) line.revision++
        return { id: line.id }
      },
    },
    serviceNotificationIntent: { updateMany: async () => ({ count: 0 }) },
    serviceWorkEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.workEvent++
        const event = {
          ...data,
          id: `event-${writes.workEvent}`,
          createdAt: new Date(),
          effectiveAt: new Date(),
        }
        events.push(event)
        return event
      },
    },
  }
  const db = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as PrismaClient
  return { db, lockOrder, writes, events, financialOrder, savedJob }
}

function readyLine(
  overrides: Partial<{
    allocatedQuantity: string
    authorizationStatus: string
    completedAt: Date | null
    id: string
    revision: number
    status: string
  }> = {},
) {
  return {
    allocatedQuantity: "1",
    authorizationStatus: "AUTHORIZED",
    completedAt: null,
    id: "job-line-1",
    revision: 2,
    status: ServiceJobLineStatus.READY_FOR_HANDOFF,
    ...overrides,
  }
}

test("Service handoff locks linked bookings before the ServiceJob row and preserves completion time", async () => {
  const { db, lockOrder } = createHandoffDb({
    completionAllocations: [
      sourceAllocation({
        allocatedQuantity: "1",
        completedAt,
        status: ServiceJobLineStatus.COMPLETED,
      }),
    ],
    initialLines: [readyLine()],
    onOrderUpdate: (data) => {
      expect(data.completedAt).toEqual(completedAt)
      expect(data.status).toBe("COMPLETED")
    },
  })

  await recordServiceHandoff(db, {
    actorUserId: "user-1",
    clientCommandId: "handoff-1",
    expectedRevision: 4,
    jobId: "job-1",
    tenantId: "tenant-1",
  })

  expect(lockOrder).toEqual(["finance-book", "order", "booking", "job"])
})

test("Service handoff leaves the Order fulfilling while another split allocation is unfinished", async () => {
  let orderStatus: unknown
  let completedAtValue: unknown
  const { db } = createHandoffDb({
    completionAllocations: [
      sourceAllocation({
        allocatedQuantity: "1",
        completedAt,
        status: ServiceJobLineStatus.COMPLETED,
      }),
      sourceAllocation({
        allocatedQuantity: "1",
        jobId: "job-2",
        status: ServiceJobLineStatus.QUEUED,
      }),
    ],
    initialLines: [readyLine()],
    orderLineQuantity: "2",
    onOrderUpdate: (data) => {
      orderStatus = data.status
      completedAtValue = data.completedAt
    },
  })

  await recordServiceHandoff(db, {
    actorUserId: "user-1",
    clientCommandId: "handoff-split-1",
    expectedRevision: 4,
    jobId: "job-1",
    tenantId: "tenant-1",
  })

  expect(orderStatus).toBe("FULFILLING")
  expect(completedAtValue).toBeUndefined()
})

test.each([
  {
    lines: [readyLine({ status: ServiceJobLineStatus.CANCELLED })],
    name: "cancelled-only work",
  },
  {
    lines: [readyLine({ authorizationStatus: "PENDING_RELEASE" })],
    name: "unauthorized work",
  },
])(
  "handoff rejects $name before writes or optional payment",
  async ({ lines }) => {
    const { db, writes } = createHandoffDb({
      completionAllocations: [],
      initialLines: lines,
    })

    await expect(
      recordServiceHandoff(db, {
        actorUserId: "user-1",
        clientCommandId: "handoff-rejected-1",
        expectedRevision: 4,
        jobId: "job-1",
        payment: { amountMinor: 100, method: "cash" },
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SERVICE_TRANSITION" })
    expect(writes).toEqual({ line: 0, payment: 0, workEvent: 0 })
  },
)

const completionInput = {
  actorUserId: "user-1",
  clientCommandId: "complete-1",
  expectedRevision: 4,
  jobId: "job-1",
  storeId: "store-1",
  tenantId: "tenant-1",
}

test.each([0, 400, 1000])(
  "work completion preserves paid amount %i and supports replay without collection",
  async (amountPaidMinor) => {
    const f = createHandoffDb({
      amountPaidMinor,
      initialLines: [readyLine()],
      completionAllocations: [
        sourceAllocation({
          allocatedQuantity: "1",
          completedAt,
          status: ServiceJobLineStatus.COMPLETED,
        }),
      ],
    })
    const result = await completeServiceJob(f.db, completionInput)
    expect(result.summary).toBe("completed")
    expect(result.balanceDueMinor).toBe(1000 - amountPaidMinor)
    expect(result.amountPaidMinor).toBe(amountPaidMinor)
    expect(result.handedOffAt).toBeNull()
    expect(result.completedAt).toBeInstanceOf(Date)
    expect(f.financialOrder.status).toBe("COMPLETED")
    expect(f.writes).toEqual({ line: 1, payment: 0, workEvent: 2 })
    expect(f.events.every((event) => event.source === "work_completion")).toBe(
      true,
    )
    expect(f.events.some((event) => event.type === "REMOTE_HANDOFF")).toBe(
      false,
    )
    const replay = await completeServiceJob(f.db, completionInput)
    expect(replay.completedAt).toEqual(result.completedAt)
    expect(f.writes).toEqual({ line: 1, payment: 0, workEvent: 2 })
    expect(f.lockOrder.slice(0, 4)).toEqual([
      "finance-book",
      "order",
      "booking",
      "job",
    ])
  },
)

test("unpaid completion leaves a split Order fulfilling when other sold allocations remain", async () => {
  const f = createHandoffDb({
    amountPaidMinor: 0,
    initialLines: [readyLine()],
    orderLineQuantity: "2",
    completionAllocations: [
      sourceAllocation({
        allocatedQuantity: "1",
        completedAt,
        status: ServiceJobLineStatus.COMPLETED,
      }),
      sourceAllocation({
        allocatedQuantity: "1",
        jobId: "job-2",
        status: ServiceJobLineStatus.QUEUED,
      }),
    ],
  })
  const result = await completeServiceJob(f.db, completionInput)
  expect(result.summary).toBe("completed")
  expect(result.balanceDueMinor).toBe(1000)
  expect(f.financialOrder.status).toBe("FULFILLING")
  expect(f.writes.payment).toBe(0)
})

test.each([
  {
    name: "unready",
    line: readyLine({ status: ServiceJobLineStatus.IN_PROGRESS }),
    code: "INVALID_SERVICE_TRANSITION",
  },
  {
    name: "unauthorized",
    line: readyLine({ authorizationStatus: "PENDING_RELEASE" }),
    code: "INVALID_SERVICE_TRANSITION",
  },
  {
    name: "cancelled-only",
    line: readyLine({ status: ServiceJobLineStatus.CANCELLED }),
    code: "INVALID_SERVICE_TRANSITION",
  },
  {
    name: "stale",
    line: readyLine(),
    expectedRevision: 3,
    code: "REVISION_CONFLICT",
  },
  {
    name: "foreign Store",
    line: readyLine(),
    storeId: "foreign",
    code: "SERVICE_JOB_NOT_FOUND",
  },
  {
    name: "foreign business",
    line: readyLine(),
    tenantId: "foreign",
    code: "SERVICE_JOB_NOT_FOUND",
  },
  {
    name: "cancelled Order",
    line: readyLine(),
    orderStatus: "CANCELLED",
    code: "INVALID_ORDER",
  },
])(
  "work completion refuses $name before writes",
  async ({ line, name: _name, code, ...change }) => {
    const { orderStatus, ...scope } = change
    const f = createHandoffDb({
      amountPaidMinor: 0,
      initialLines: [line],
      completionAllocations: [],
      orderStatus,
    })
    await expect(
      completeServiceJob(f.db, { ...completionInput, ...scope }),
    ).rejects.toMatchObject({ code })
    expect(f.writes).toEqual({ line: 0, payment: 0, workEvent: 0 })
  },
)

test("separate customer handoff preserves the earlier work completion timestamp", async () => {
  const f = createHandoffDb({
    initialLines: [readyLine()],
    completionAllocations: [
      sourceAllocation({
        allocatedQuantity: "1",
        completedAt,
        status: ServiceJobLineStatus.COMPLETED,
      }),
    ],
  })
  const completed = await completeServiceJob(f.db, completionInput)
  const collected = await recordServiceHandoff(f.db, {
    ...completionInput,
    expectedRevision: 5,
    clientCommandId: "handoff-after-work",
  })
  expect(collected.completedAt).toEqual(completed.completedAt)
  expect(collected.handedOffAt).toBeInstanceOf(Date)
  expect(
    f.events.filter((event) => event.type === "REMOTE_HANDOFF"),
  ).toHaveLength(1)
  expect(f.writes.payment).toBe(0)
})

test("an unpaid completed Job remains complete if a later customer collection is refused", async () => {
  const f = createHandoffDb({
    amountPaidMinor: 0,
    initialLines: [readyLine()],
    completionAllocations: [
      sourceAllocation({
        allocatedQuantity: "1",
        completedAt,
        status: ServiceJobLineStatus.COMPLETED,
      }),
    ],
  })
  const completed = await completeServiceJob(f.db, completionInput)
  await expect(
    recordServiceHandoff(f.db, {
      ...completionInput,
      expectedRevision: 5,
      clientCommandId: "unpaid-handoff-after-work",
    }),
  ).rejects.toThrow("Collect the outstanding balance")
  expect(f.savedJob.completedAt).toEqual(completed.completedAt)
  expect(f.savedJob.handedOffAt).toBeNull()
  expect(f.financialOrder.amountPaidMinor).toBe(0)
  expect(f.writes).toEqual({ line: 1, payment: 0, workEvent: 2 })
})
