import { expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { ServiceJobLineStatus } from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"
import { recordServiceHandoff } from "./service-work"

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
  onOrderUpdate?: (data: Record<string, unknown>) => void
}) {
  const lockOrder: string[] = []
  const writes = { line: 0, payment: 0, workEvent: 0 }
  let jobReads = 0
  const job = () => {
    const firstRead = jobReads++ === 0
    return {
      assignments: [],
      commercialOrder: {
        amountPaidMinor: 1000,
        currencyCode: "NGN",
        orderNumber: "ORD-1",
        paymentStatus: "PAID",
        payments: [{ id: "payment-1" }],
        serviceChargeMinor: 0,
        totalMinor: 1000,
      },
      commercialOrderId: "order-1",
      createdAt: completedAt,
      currentAssigneeUserId: null,
      dueCommitments: [],
      evidence: [],
      events: [],
      exceptions: [],
      handedOffAt: firstRead ? null : completedAt,
      handoffNote: null,
      id: "job-1",
      intake: null,
      lines: input.initialLines
        .map((line) => ({
          ...line,
          allocatedQuantity: { toString: () => line.allocatedQuantity },
          authorizationPolicy: "REQUIRED",
          commercialOrderLine: { snapshot: null },
          commercialOrderLineId: "order-line-1",
        }))
        .map((line) =>
          firstRead
            ? line
            : {
                ...line,
                completedAt:
                  line.status === ServiceJobLineStatus.READY_FOR_HANDOFF
                    ? completedAt
                    : line.completedAt,
                status:
                  line.status === ServiceJobLineStatus.READY_FOR_HANDOFF
                    ? ServiceJobLineStatus.COMPLETED
                    : line.status,
              },
        ),
      notes: [],
      notificationIntents: [],
      priority: "NORMAL",
      revision: firstRead ? 4 : 5,
      store: { serviceSettings: null },
      storeId: "store-1",
    }
  }
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const query = strings.join(" ")
      if (query.includes('"FinanceBook"')) {
        lockOrder.push("finance-book")
        return []
      }
      if (query.includes('"CommercialOrder"')) {
        lockOrder.push("order")
        return [{ id: "order-1" }]
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
          : {
              amountPaidMinor: 1000,
              completedAt,
              currencyCode: "NGN",
              customerId: null,
              id: "order-1",
              paymentStatus: "PAID",
              status: "FULFILLING",
              tenantId: "tenant-1",
              storeId: "store-1",
              totalMinor: 1000,
            },
      findUniqueOrThrow: async () => ({
        amountPaidMinor: 1000,
        completedAt,
        currencyCode: "NGN",
        id: "order-1",
        paymentStatus: "PAID",
        payments: [{ id: "payment-1" }],
        storeId: "store-1",
        totalMinor: 1000,
      }),
      update: async (args: { data: Record<string, unknown> }) => {
        input.onOrderUpdate?.(args.data)
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
        writes.payment += 1
        throw new Error("Optional handoff payment must not run")
      },
    },
    serviceJob: {
      findFirst: async (args: { select?: unknown }) =>
        args.select
          ? {
              commercialOrderId: "order-1",
              id: "job-1",
              storeId: "store-1",
            }
          : job(),
      update: async () => ({ id: "job-1" }),
    },
    serviceJobLine: {
      update: async () => {
        writes.line += 1
        return { id: "job-line-1" }
      },
    },
    serviceNotificationIntent: { updateMany: async () => ({ count: 0 }) },
    serviceWorkEvent: {
      create: async () => {
        writes.workEvent += 1
        return { id: "event-1" }
      },
    },
  }
  const db = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as PrismaClient
  return { db, lockOrder, writes }
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
