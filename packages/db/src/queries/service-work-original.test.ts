import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  getServiceWorkOriginal,
  getServiceWorkOriginalInTransaction,
  serviceWorkOriginalInput,
} from "./service-work-original"

const scope = {
  tenantId: "tenant",
  storeId: "store",
  actorUserId: "actor",
  jobId: "job",
}
const createdAt = new Date("2026-10-01T10:00:00.123Z")
const effectiveAt = new Date("2026-10-01T09:00:00.456Z")
function fixture(
  options: {
    active?: boolean
    role?: string
    scoped?: boolean
    missing?: boolean
    wrongOrder?: boolean
    wrongLine?: boolean
    foreignEvent?: boolean
    clinical?: boolean
    fault?: Error
  } = {},
) {
  const reads: Array<{ source: string; input: unknown }> = []
  const job = {
    id: "job",
    revision: 99,
    storeId: "store",
    commercialOrderId: "order",
    currentAssigneeUserId: "current-staff",
    createdAt,
    completedAt: new Date("2026-10-11T12:00:00Z"),
    cancelledAt: null,
    handedOffAt: null,
    commercialOrder: {
      id: "order",
      tenantId: "tenant",
      storeId: options.wrongOrder ? "other" : "store",
      customerName: "must-not-leak",
      customerPhone: "private-phone",
      acceptedCommerceQuoteVersion: options.clinical
        ? { quote: { sourceType: "PRESCRIPTION_REQUEST" } }
        : null,
      prescriptionPickupFulfillment: null,
      prescriptionDeliveryAddress: null,
      _count: { prescriptionPaymentIntents: 0 },
    },
  }
  const event = {
    id: "old-event",
    tenantId: options.foreignEvent ? "other" : "tenant",
    serviceJobId: "job",
    serviceJobLineId: "line",
    actorUserId: "original-actor",
    type: "STATUS_CHANGED",
    source: "assistant",
    reason: "Original explanation",
    fromStatus: "QUEUED",
    toStatus: "IN_PROGRESS",
    createdAt,
    effectiveAt,
    payload: { privateCustomer: "must-not-leak" } as Prisma.JsonValue,
  }
  const note = {
    id: "old-note",
    serviceJobId: "job",
    serviceJobLineId: "line",
    body: "Original internal text",
    actorUserId: "original-actor",
    createdAt,
  }
  const exception = {
    id: "old-exception",
    serviceJobId: "job",
    serviceJobLineId: null,
    type: "QUALITY",
    description: "Original quality issue",
    actorUserId: "original-actor",
    createdAt,
    occurredAt: effectiveAt,
    outcome: "RESOLVED",
    resolvedAt: new Date("2026-10-02T10:00:00Z"),
    resolvedByUserId: "resolver",
    updatedAt: new Date("2026-10-02T10:00:00Z"),
  }
  const read = (source: string, record: unknown) => async (input: unknown) => {
    reads.push({ source, input })
    if (options.fault) throw options.fault
    return options.missing ? null : record
  }
  const tx = {
    $transaction: () => {
      throw Error("Nested transaction forbidden")
    },
    $queryRaw: async (parts: TemplateStringsArray) => {
      if (parts.join("").includes('JOIN "Tenant"'))
        return options.active === false
          ? []
          : [
              {
                id: "actor-membership",
                role: options.role ?? "OWNER",
                staffAccessMode: options.scoped ? "SCOPED" : "LEGACY",
              },
            ]
      return [{ id: parts.join("").includes('FROM "Store"') ? "store" : "job" }]
    },
    store: { findFirst: async () => ({ id: "store" }) },
    staffStoreAssignment: {
      findFirst: async () => ({ id: "assignment", revision: 1 }),
    },
    serviceJob: {
      findFirst: async (input: unknown) => {
        reads.push({ source: "job", input })
        return job
      },
    },
    serviceJobLine: {
      findFirst: async (input: unknown) => {
        reads.push({ source: "line", input })
        return {
          id: "line",
          serviceJobId: "job",
          revision: 12,
          status: "COMPLETED",
          commercialOrderLine: {
            orderId: options.wrongLine ? "other-order" : "order",
          },
        }
      },
    },
    serviceWorkEvent: { findFirst: read("event", event) },
    serviceInternalNote: { findFirst: read("note", note) },
    serviceException: { findFirst: read("exception", exception) },
  } as unknown as Prisma.TransactionClient
  return { tx, reads, event }
}
test("strict original target preserves distinct event versus note/exception identities", () => {
  expect(
    serviceWorkOriginalInput.parse({
      kind: "service_work",
      jobId: " job ",
      eventId: " old-event ",
    }),
  ).toEqual({ kind: "service_work", jobId: "job", eventId: "old-event" })
  expect(
    serviceWorkOriginalInput.safeParse({
      kind: "service_work_note",
      jobId: "job",
      eventId: "event",
    }).success,
  ).toBe(false)
  expect(
    serviceWorkOriginalInput.safeParse({
      kind: "service_work_exception",
      jobId: "job",
      recordId: "exception",
      tenantId: "forged",
    }).success,
  ).toBe(false)
})
test("exact original event retains recorded actor/status/times while current Job/Line remain separate", async () => {
  const f = fixture()
  const record = await getServiceWorkOriginalInTransaction(f.tx, {
    ...scope,
    kind: "service_work",
    eventId: "old-event",
  })
  if (record.kind !== "service_work") throw Error("Wrong owning source")
  expect(record.original).toMatchObject({
    eventId: "old-event",
    actorUserId: "original-actor",
    beforeStatus: "QUEUED",
    afterStatus: "IN_PROGRESS",
    createdAt: createdAt.toISOString(),
    effectiveAt: effectiveAt.toISOString(),
    details: { coverage: "not_projected" },
  })
  expect(record.currentJob.revision).toBe(99)
  expect(record.currentLine).toEqual({
    lineId: "line",
    revision: 12,
    status: "COMPLETED",
  })
  expect(f.reads.find((read) => read.source === "event")?.input).toMatchObject({
    where: { id: "old-event", tenantId: "tenant", serviceJobId: "job" },
  })
  expect(JSON.stringify(record)).not.toContain("must-not-leak")
  expect(JSON.stringify(record)).not.toContain("private-phone")
})
test("assignment payload projects only canonical recorded references, never arbitrary JSON", async () => {
  const f = fixture()
  f.event.type = "ASSIGNED"
  f.event.payload = {
    privateCustomer: "must-not-leak",
    assigneeUserId: "original-assignee",
  }
  const record = await getServiceWorkOriginalInTransaction(f.tx, {
    ...scope,
    kind: "service_work",
    eventId: "old-event",
  })
  if (record.kind !== "service_work") throw Error("Wrong source")
  expect(record.original.details).toEqual({
    coverage: "recorded",
    assignment: { assigneeUserId: "original-assignee" },
  })
  expect(JSON.stringify(record)).not.toContain("must-not-leak")
})
test("note opens original owning text/time without requesting a work event", async () => {
  const f = fixture()
  const record = await getServiceWorkOriginalInTransaction(f.tx, {
    ...scope,
    kind: "service_work_note",
    recordId: "old-note",
  })
  expect(record.source).toBe("ServiceInternalNote")
  expect(record.original).toMatchObject({
    recordId: "old-note",
    body: "Original internal text",
    createdAt: createdAt.toISOString(),
  })
  expect(
    f.reads.some(
      (read) => read.source === "event" || read.source === "exception",
    ),
  ).toBe(false)
  expect(f.reads.find((read) => read.source === "note")?.input).toMatchObject({
    where: { id: "old-note", serviceJobId: "job" },
  })
})
test("exception occurrence is original while later resolution is explicitly current", async () => {
  const f = fixture()
  const record = await getServiceWorkOriginalInTransaction(f.tx, {
    ...scope,
    kind: "service_work_exception",
    recordId: "old-exception",
  })
  if (record.kind !== "service_work_exception") throw Error("Wrong source")
  expect(record.source).toBe("ServiceException")
  expect(record.original).toMatchObject({
    recordId: "old-exception",
    type: "QUALITY",
    description: "Original quality issue",
    occurredAt: effectiveAt.toISOString(),
    createdAt: createdAt.toISOString(),
  })
  expect(record.currentException).toMatchObject({
    outcome: "RESOLVED",
    resolvedByUserId: "resolver",
  })
  expect(record.originalOutcomeCoverage).toBe(
    "creation_outcome_not_immutably_recorded",
  )
  expect(
    f.reads.some((read) => read.source === "event" || read.source === "note"),
  ).toBe(false)
})
test("revoked/scoped/foreign/clinical scope and invalid original line refuse", async () => {
  for (const options of [
    { active: false },
    { role: "MANAGER", scoped: true },
    { role: "OPERATOR" },
    { wrongOrder: true },
    { wrongLine: true },
    { foreignEvent: true },
    { clinical: true },
  ]) {
    const f = fixture(options)
    await expect(
      getServiceWorkOriginalInTransaction(f.tx, {
        ...scope,
        kind: "service_work",
        eventId: "old-event",
      }),
    ).rejects.toThrow()
    if (
      options.active === false ||
      options.scoped ||
      options.clinical ||
      options.wrongOrder ||
      options.role === "OPERATOR"
    )
      expect(f.reads.some((read) => read.source === "event")).toBe(false)
  }
})
test("missing exact record fails without latest-event fallback and unknown faults escape", async () => {
  const missing = fixture({ missing: true })
  await expect(
    getServiceWorkOriginalInTransaction(missing.tx, {
      ...scope,
      kind: "service_work_note",
      recordId: "missing",
    }),
  ).rejects.toThrow("exact original")
  expect(missing.reads.filter((read) => read.source === "note")).toHaveLength(1)
  expect(missing.reads.some((read) => read.source === "event")).toBe(false)
  const fault = Error("Read failed")
  await expect(
    getServiceWorkOriginalInTransaction(fixture({ fault }).tx, {
      ...scope,
      kind: "service_work",
      eventId: "old-event",
    }),
  ).rejects.toBe(fault)
})
test("native root reader uses exactly one bounded snapshot; pure reader never nests", async () => {
  const f = fixture()
  let count = 0
  const db = {
    $transaction: async (
      work: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options: unknown,
    ) => {
      count++
      expect(options).toEqual({
        maxWait: 10_000,
        timeout: 30_000,
        isolationLevel: "RepeatableRead",
      })
      return work(f.tx)
    },
  } as unknown as PrismaClient
  await getServiceWorkOriginal(db, {
    ...scope,
    kind: "service_work_note",
    recordId: "old-note",
  })
  expect(count).toBe(1)
})

test("original rework and handoff payloads expose bounded recorded facts only", async () => {
  for (const [type, payload, expected] of [
    [
      "REWORK",
      {
        sourceLineId: "source-line",
        quantity: "1.25",
        privateCustomer: "must-not-leak",
      },
      {
        coverage: "recorded",
        rework: { sourceLineId: "source-line", quantity: "1.25" },
      },
    ],
    [
      "REMOTE_HANDOFF",
      { paymentStatus: "PAID", privateCustomer: "must-not-leak" },
      { coverage: "recorded", handoff: { paymentStatus: "PAID" } },
    ],
    [
      "REWORK",
      { sourceLineId: "source-line", quantity: "-1" },
      { coverage: "unavailable" },
    ],
    [
      "REMOTE_HANDOFF",
      { paymentStatus: "invented" },
      { coverage: "unavailable" },
    ],
  ] as const) {
    const f = fixture()
    f.event.type = type
    f.event.payload = { ...payload }
    const record = await getServiceWorkOriginalInTransaction(f.tx, {
      ...scope,
      kind: "service_work",
      eventId: "old-event",
    })
    expect(record.kind).toBe("service_work")
    if (record.kind === "service_work")
      expect(record.original.details).toEqual(expected)
    expect(JSON.stringify(record)).not.toContain("must-not-leak")
  }
})
