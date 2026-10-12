import { expect, test } from "bun:test"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  addServiceInternalNote,
  addServiceInternalNoteInTransaction,
  recordServiceException,
  recordServiceExceptionInTransaction,
} from "./service-work"
import { prepareReviewedServiceWorkRecordInTransaction } from "./service-work-record-review"

const scope = {
  tenantId: "tenant",
  storeId: "store",
  actorUserId: "actor",
  jobId: "job",
}
const createdAt = new Date("2026-10-12T10:00:00.123Z")
const occurredAt = new Date("2026-10-12T10:00:00.456Z")
function fixture() {
  const state = {
    active: true,
    role: "OWNER",
    scoped: false,
    store: true,
    jobStore: "store",
    nested: 0,
    writes: 0,
    insideTransaction: false,
    requireTransaction: false,
    failCreate: false,
  }
  const job = {
    id: "job",
    revision: 4,
    storeId: "store",
    commercialOrderId: "order",
    currentAssigneeUserId: "staff",
    handedOffAt: null as Date | null,
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
  }
  const line = {
    id: "line",
    revision: 2,
    status: "QUEUED",
    authorizationStatus: "PENDING_PAYMENT",
    allocatedQuantity: new Prisma.Decimal(2),
    commercialOrderLine: {
      orderId: "order",
      snapshot: { offeringName: "Wash", variantName: "Standard" },
    },
  }
  const notes = new Map<string, Record<string, unknown>>()
  const exceptions: Array<Record<string, unknown>> = []
  const fault = Error("Owning record persistence failed")
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
      findFirst: async () => ({ id: "store-assignment", revision: 1 }),
    },
    serviceJob: {
      findFirst: async ({
        where,
      }: { where: { id: string; tenantId: string; storeId?: string } }) => {
        if (state.requireTransaction && !state.insideTransaction)
          throw Error("Native read escaped its owning transaction")
        return where.id === job.id &&
          where.tenantId === "tenant" &&
          (!where.storeId || where.storeId === state.jobStore)
          ? job
          : null
      },
    },
    serviceJobLine: {
      findFirst: async ({
        where,
      }: { where: { id: string; serviceJobId: string } }) =>
        where.id === line.id && where.serviceJobId === job.id ? line : null,
    },
    serviceInternalNote: {
      upsert: async ({
        where,
        create,
      }: {
        where: {
          serviceJobId_clientCommandId: {
            serviceJobId: string
            clientCommandId: string
          }
        }
        create: Record<string, unknown>
      }) => {
        if (state.failCreate) throw fault
        const key = `${where.serviceJobId_clientCommandId.serviceJobId}:${where.serviceJobId_clientCommandId.clientCommandId}`
        const original = notes.get(key)
        if (original) return original
        state.writes++
        const note = {
          ...create,
          id: `note-${notes.size + 1}`,
          serviceJobLineId: create.serviceJobLineId ?? null,
          createdAt,
        }
        notes.set(key, note)
        return note
      },
    },
    serviceException: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.failCreate) throw fault
        state.writes++
        const exception = {
          ...data,
          id: `exception-${exceptions.length + 1}`,
          serviceJobLineId: data.serviceJobLineId ?? null,
          createdAt,
          occurredAt,
          updatedAt: createdAt,
          resolvedAt: null,
        }
        exceptions.push(exception)
        return exception
      },
    },
  }
  return {
    state,
    job,
    line,
    notes,
    exceptions,
    fault,
    tx: tx as unknown as Prisma.TransactionClient,
  }
}
test("fresh authority, Store and exact optional line refuse foreign work without writes", async () => {
  const f = fixture(),
    input = { ...scope, operation: "note" as const, body: "Internal note" }
  f.state.active = false
  await expect(
    prepareReviewedServiceWorkRecordInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  f.state.active = true
  f.state.store = false
  await expect(
    prepareReviewedServiceWorkRecordInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  f.state.store = true
  f.state.jobStore = "foreign"
  await expect(
    prepareReviewedServiceWorkRecordInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  f.state.jobStore = "store"
  await expect(
    prepareReviewedServiceWorkRecordInTransaction(f.tx, {
      ...input,
      lineId: "foreign",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  f.line.commercialOrderLine.orderId = "foreign-order"
  await expect(
    prepareReviewedServiceWorkRecordInTransaction(f.tx, {
      ...input,
      lineId: "line",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(f.state.writes).toBe(0)
})
test("scoped Manager remains fail closed and record previews bind current lifecycle without advancing it", async () => {
  const f = fixture(),
    input = {
      ...scope,
      operation: "exception" as const,
      type: "quality" as const,
      description: "Inspection required",
      lineId: "line",
    }
  f.state.role = "MANAGER"
  f.state.scoped = true
  await expect(
    prepareReviewedServiceWorkRecordInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  f.state.role = "OWNER"
  f.state.scoped = false
  const first = await prepareReviewedServiceWorkRecordInTransaction(f.tx, input)
  expect(first.review.line?.authorizationStatus).toBe("PENDING_PAYMENT")
  f.line.status = "COMPLETED"
  f.line.revision++
  f.job.handedOffAt = createdAt
  const second = await prepareReviewedServiceWorkRecordInTransaction(
    f.tx,
    input,
  )
  expect(second.target.revision).not.toBe(first.target.revision)
  expect(second.review.handedOffAt).toBe(createdAt.toISOString())
  expect(f.state.writes).toBe(0)
})
test("internal note replay keeps the original owning ID/date and records only once", async () => {
  const f = fixture(),
    input = {
      ...scope,
      operation: "note" as const,
      body: "  Keep the original care instructions  ",
      lineId: "line",
    }
  const prepared = await prepareReviewedServiceWorkRecordInTransaction(
    f.tx,
    input,
  )
  expect(f.state.writes).toBe(0)
  const first = await prepared.execute("note-command"),
    replay = await prepared.execute("note-command")
  expect(first.recordType).toBe("note")
  expect(replay.original.id).toBe(first.original.id)
  expect(replay.original.createdAt).toBe(createdAt)
  expect(f.notes.get("job:note-command")?.body).toBe(
    "Keep the original care instructions",
  )
  expect(f.notes.size).toBe(1)
  expect(f.state.nested).toBe(0)
})
test("a note key collision cannot silently claim different text, actor or line", async () => {
  const f = fixture()
  await (
    await prepareReviewedServiceWorkRecordInTransaction(f.tx, {
      ...scope,
      operation: "note",
      body: "Original text",
    })
  ).execute("note-command")
  for (const input of [
    { ...scope, operation: "note" as const, body: "Changed text" },
    {
      ...scope,
      operation: "note" as const,
      body: "Original text",
      lineId: "line",
    },
    {
      ...scope,
      operation: "note" as const,
      body: "Original text",
      actorUserId: "different-actor",
    },
  ])
    await expect(
      (
        await prepareReviewedServiceWorkRecordInTransaction(f.tx, input)
      ).execute("note-command"),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(f.notes.size).toBe(1)
  expect(f.notes.get("job:note-command")?.body).toBe("Original text")
})
test("exception receipt preserves canonical type/open outcome and original record times without work/notification effects", async () => {
  const f = fixture(),
    prepared = await prepareReviewedServiceWorkRecordInTransaction(f.tx, {
      ...scope,
      operation: "exception",
      type: "failed_attempt",
      description: "  Customer was unavailable  ",
      lineId: "line",
    })
  const result = await prepared.execute("general-command")
  expect(result.recordType).toBe("exception")
  if (result.recordType !== "exception") throw Error("Wrong owning receipt")
  expect(result.original.type).toBe("FAILED_ATTEMPT")
  expect(result.original.outcome).toBe("OPEN")
  expect(result.original.createdAt).toBe(createdAt)
  expect(result.original.occurredAt).toBe(occurredAt)
  expect(result.original.description).toBe("Customer was unavailable")
  expect(f.line.status).toBe("QUEUED")
  expect(f.job.revision).toBe(4)
  expect(f.state.writes).toBe(1)
  expect(f.state.nested).toBe(0)
})
test("root facades contain their native reads/writes in fresh bounded transactions and retain outputs", async () => {
  const f = fixture(),
    options: unknown[] = []
  f.state.requireTransaction = true
  const root = {
    $transaction: async (
      run: (tx: Prisma.TransactionClient) => Promise<unknown>,
      bounds: unknown,
    ) => {
      options.push(bounds)
      f.state.insideTransaction = true
      try {
        return await run(f.tx)
      } finally {
        f.state.insideTransaction = false
      }
    },
  } as unknown as PrismaClient
  const note = await addServiceInternalNote(root, {
    ...scope,
    body: "Original note",
    clientCommandId: "native-note-command",
  })
  const exception = await recordServiceException(root, {
    ...scope,
    type: "delay",
    description: "Later pickup",
  })
  expect(note.id).toBe("note-1")
  expect(exception.id).toBe("exception-1")
  expect(exception.type).toBe("DELAY")
  expect(options).toEqual([
    { maxWait: 10000, timeout: 30000 },
    { maxWait: 10000, timeout: 30000 },
  ])
  expect(Object.is(options[0], options[1])).toBe(false)
  expect(f.state.nested).toBe(0)
})
test("native persistence failures propagate unchanged from either caller-owned seam", async () => {
  const f = fixture()
  f.state.failCreate = true
  await expect(
    addServiceInternalNoteInTransaction(f.tx, {
      ...scope,
      body: "Note",
      clientCommandId: "note-command",
    }),
  ).rejects.toBe(f.fault)
  await expect(
    recordServiceExceptionInTransaction(f.tx, {
      ...scope,
      type: "other",
      description: "Issue",
    }),
  ).rejects.toBe(f.fault)
  expect(f.state.nested).toBe(0)
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
      prepareReviewedServiceWorkRecordInTransaction(f.tx, {
        ...scope,
        operation: "note" as const,
        body: "Private note",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  }
})
