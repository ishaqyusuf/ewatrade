import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import {
  type GeneralAnswer,
  generalMoney,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  generalReadContinuationContext,
  nextGeneralReadRequest,
  parseGeneralReadContinuation,
} from "@ewatrade/assistant/general/read-continuation"
import { appendAssistantMessage } from "@ewatrade/db/assistant"
import { disconnectAssistantWhatsApp } from "@ewatrade/db/assistant-whatsapp"
import {
  createCommercialOrder,
  createSimpleCatalogItem,
  rescheduleServiceJob,
} from "@ewatrade/db/queries"
import { z } from "zod"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { generalPersistentParts } from "./general-persistence"
import { createGeneralTools } from "./general-tools"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-service-queue")
const itemCommandId = `${fixture.marker}-item`
const itemName = `Synthetic tracked repair ${fixture.marker.slice(-6)}`
const past = new Date(Date.now() - 24 * 60 * 60_000)
const future = new Date(Date.now() + 7 * 24 * 60 * 60_000)
let itemId = ""
const seeded: Array<{
  orderId: string
  jobId: string
  lineId: string
  commandId: string
  quantity: string
  totalMinor: number
  promisedAt: Date
}> = []

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  const { db, tenantId, storeId, userId } = fixture
  const item = await createSimpleCatalogItem(db, {
    tenantId,
    storeId,
    actorUserId: userId,
    clientOperationId: itemCommandId,
    kind: "service",
    name: itemName,
    priceMinor: 12500,
    quantityScale: 1,
    workPolicy: "tracked",
    authorizationPolicy: "on_order_confirmation",
  })
  itemId = item.id
  const offering = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: item.id },
  })
  for (const [key, quantity, totalMinor, promisedAt] of [
    ["past", "2.5", 31250, past],
    ["future", "1.5", 18750, future],
  ] as const) {
    const commandId = `${fixture.marker}-${key}`
    const order = await createCommercialOrder(db, {
      tenantId,
      storeId,
      actorUserId: userId,
      clientOrderId: commandId,
      schemaVersion: 1,
      fulfillNow: false,
      lines: [
        { offeringId: offering.id, quantity, expectedFixedPriceMinor: 12500 },
      ],
    })
    const job = await db.serviceJob.findFirstOrThrow({
      where: { tenantId, storeId, commercialOrderId: order.id },
      include: { lines: true },
    })
    const line = job.lines[0]
    if (!line || job.lines.length !== 1)
      throw Error("Expected one canonically allocated tracked service line")
    seeded.push({
      orderId: order.id,
      jobId: job.id,
      lineId: line.id,
      commandId,
      quantity,
      totalMinor,
      promisedAt,
    })
    expect(order.totalMinor).toBe(totalMinor)
    await rescheduleServiceJob(db, {
      tenantId,
      actorUserId: userId,
      jobId: job.id,
      expectedRevision: job.revision,
      promisedAt,
      reason: "Synthetic exact queue promise",
    })
  }
}, 150_000)

afterAll(async () => {
  if (enabled && fixture.db) {
    const { db, tenantId, storeId, userId } = fixture
    try {
      await db.$transaction(
        async (tx) => {
          const tenant = await tx.tenant.findUniqueOrThrow({
            where: { id: tenantId },
          })
          expect(tenant).toMatchObject({
            slug: tenantId,
            dataClassification: "QA",
            qaSourceDomain: "assistant-action-confirmation.test",
          })
          const items = await tx.catalogItem.findMany({ where: { tenantId } })
          for (const item of items)
            expect(item).toMatchObject({
              id: itemId,
              name: itemName,
              kind: "SERVICE",
            })
          const orders = await tx.commercialOrder.findMany({
            where: { tenantId },
          })
          for (const order of orders) {
            const own = seeded.find((row) => row.orderId === order.id)
            if (!own)
              throw Error("Unexpected Order retains fixture attribution")
            expect(order).toMatchObject({
              storeId,
              createdByUserId: userId,
              clientOrderId: own.commandId,
              totalMinor: own.totalMinor,
              amountPaidMinor: 0,
            })
          }
          const jobs = await tx.serviceJob.findMany({
            where: { tenantId },
            include: { lines: true, dueCommitments: true, events: true },
          })
          for (const job of jobs) {
            const own = seeded.find((row) => row.jobId === job.id)
            if (!own)
              throw Error("Unexpected Service job retains fixture attribution")
            expect(job).toMatchObject({
              storeId,
              createdByUserId: userId,
              commercialOrderId: own.orderId,
              clientJobId: `${own.commandId}:job:1`,
              currentAssigneeUserId: null,
              intakeId: null,
              splitFromJobId: null,
              reworkOfJobId: null,
              handedOffAt: null,
            })
            expect(job.lines).toHaveLength(1)
            expect(job.lines[0]).toMatchObject({
              id: own.lineId,
              status: "QUEUED",
              authorizationStatus: "AUTHORIZED",
              authorizationPolicy: "ON_ORDER_CONFIRMATION",
            })
            expect(job.lines[0]?.allocatedQuantity.toString()).toBe(
              own.quantity,
            )
            for (const promise of job.dueCommitments)
              expect(promise).toMatchObject({
                createdByUserId: userId,
                promisedAt: own.promisedAt,
                reason: "Synthetic exact queue promise",
              })
            for (const event of job.events) {
              expect(event).toMatchObject({ actorUserId: userId, tenantId })
              expect(["CREATED", "DUE_COMMITMENT_CREATED"]).toContain(
                event.type,
              )
            }
          }
          for (const receipt of await tx.catalogCommandReceipt.findMany({
            where: { tenantId },
          }))
            expect(receipt).toMatchObject({
              storeId,
              catalogItemId: itemId,
              clientOperationId: itemCommandId,
              commandType: "CREATE_CATALOG_ITEM",
            })
          const zeros = await Promise.all([
            tx.assistantRun.count({ where: { conversation: { tenantId } } }),
            tx.assistantUsageEvent.count({ where: { tenantId } }),
            tx.assistantActionProposal.count({ where: { tenantId } }),
            tx.assistantAttachment.count({ where: { tenantId } }),
            tx.customer.count({ where: { tenantId } }),
            tx.financeBook.count({ where: { tenantId } }),
            tx.commercialOrderPayment.count({ where: { tenantId } }),
            tx.stockOperation.count({ where: { tenantId } }),
            tx.serviceIntake.count({ where: { tenantId } }),
            tx.serviceNotificationIntent.count({ where: { tenantId } }),
            tx.serviceEvidence.count({ where: { tenantId } }),
          ])
          for (const count of zeros) expect(count).toBe(0)
          const activities = await tx.commercialOrderActivity.findMany({
            where: { tenantId },
          })
          for (const activity of activities) {
            expect(activity.actorUserId).toBe(userId)
            expect(seeded.some((row) => row.orderId === activity.orderId)).toBe(
              true,
            )
          }
          const events = await tx.businessActivityEvent.findMany({
            where: { tenantId },
          })
          for (const event of events) expect(event.actorUserId).toBe(userId)
          await tx.businessActivityEvent.deleteMany({
            where: { tenantId, id: { in: events.map((row) => row.id) } },
          })
          await tx.commercialOrderActivity.deleteMany({
            where: { tenantId, id: { in: activities.map((row) => row.id) } },
          })
          await tx.serviceJob.deleteMany({
            where: { tenantId, id: { in: jobs.map((row) => row.id) } },
          })
          await tx.commercialOrder.deleteMany({
            where: { tenantId, id: { in: orders.map((row) => row.id) } },
          })
        },
        { maxWait: 10_000, timeout: 30_000 },
      )
    } catch (error) {
      await db.$disconnect()
      throw new Error(
        `Service queue cleanup unverified; retained fixture ${tenantId}`,
        { cause: error },
      )
    }
  }
  await fixture.cleanup()
}, 90_000)

const result = z.object({
  status: z.literal("available"),
  data: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        commercialOrderId: z.string(),
        orderNumber: z.string(),
        summary: z.string(),
        customerMilestone: z.string(),
        revision: z.number(),
        paymentStatus: z.string(),
        orderTotalMinor: z.number(),
        amountPaidMinor: z.number(),
        balanceDueMinor: z.number(),
        dueCommitmentAt: z.date().nullable(),
        handedOffAt: z.date().nullable(),
        lines: z.array(
          z.object({
            id: z.string(),
            allocatedQuantity: z.string(),
            catalogItemName: z.string(),
            authorizationStatus: z.string(),
            authorizationPolicy: z.string(),
            status: z.string(),
          }),
        ),
      }),
    ),
    nextCursor: z.string().optional(),
    totalCount: z.number(),
  }),
})

suite("actual linked nonempty tracked Service queue", () => {
  test("retains exact saved work, nonzero Order facts, due filters and persisted as-of semantics without writing or charging a model", async () => {
    const { db, tenantId, userId } = fixture
    const overdue = seeded[0]
    const later = seeded[1]
    if (!overdue || !later) throw Error("Expected two canonical tracked jobs")
    const snapshot = await db.serviceJob.findMany({
      where: { tenantId },
      include: { lines: true, dueCommitments: true, events: true },
      orderBy: { id: "asc" },
    })
    const ctx = await fixture.context(`${fixture.marker}-read`)
    expect(ctx.session.session).toBeNull()
    const answers: GeneralAnswer[] = []
    const tools = createGeneralTools(
      ctx,
      fixture.conversationId,
      () => {
        throw Error("Service reads must not draft")
      },
      (answer) => answers.push(answer),
    )
    const read = tools.readServices?.execute
    if (!read) throw Error("Expected eligible canonical Service queue read")
    const before = Date.now()
    const input = { query: itemName, due: "overdue" as const }
    const page = result.parse(
      await read(input, { toolCallId: "tracked-overdue", messages: [] }),
    ).data
    expect(page.items).toHaveLength(1)
    const job = page.items[0]
    if (!job) throw Error("Expected saved overdue job")
    expect(job).toMatchObject({
      id: overdue.jobId,
      commercialOrderId: overdue.orderId,
      summary: "queued",
      customerMilestone: "received",
      revision: 1,
      orderTotalMinor: 31250,
      amountPaidMinor: 0,
      balanceDueMinor: 31250,
      dueCommitmentAt: past,
      handedOffAt: null,
      lines: [
        {
          id: overdue.lineId,
          allocatedQuantity: "2.5",
          catalogItemName: itemName,
          authorizationStatus: "AUTHORIZED",
          authorizationPolicy: "ON_ORDER_CONFIRMATION",
          status: "QUEUED",
        },
      ],
    })
    expect(page.nextCursor).toBeUndefined()
    expect(answers).toHaveLength(3)
    const header = answers[0]
    if (!header) throw Error("Expected deterministic Service page answer")
    expect(header.value).toBe("1 jobs on this page")
    expect(header.continuation).toEqual({
      version: 1,
      tool: "readServices",
      input,
      nextCursor: null,
    })
    expect(nextGeneralReadRequest(header.continuation)).toBeUndefined()
    const jobAnswer = answers[1]
    const lineAnswer = answers[2]
    expect(jobAnswer?.detail).toContain(generalMoney(31250, "NGN"))
    expect(jobAnswer?.detail).toContain(
      `Current saved promise ${past.toISOString()} (UTC)`,
    )
    expect(jobAnswer?.detail).toContain(
      "Not customer-ledger debt, new money received or provider settlement",
    )
    expect(jobAnswer?.detail).toContain("No handoff recorded")
    expect(lineAnswer?.value).toBe("2.5 allocated")
    expect(lineAnswer?.detail).toContain(
      "does not supply the quantity's unit name",
    )
    for (const answer of answers) {
      expect(Date.parse(answer.asOf)).toBeGreaterThanOrEqual(before)
      expect(Date.parse(answer.asOf)).toBeLessThanOrEqual(Date.now())
      expect(answer.asOf).toBe(header.asOf)
    }
    const parts = generalPersistentParts(
      answers.map((data) => ({ type: "data-general-answer", data })),
    )
    const messageId = `${fixture.marker}-queue-saved`
    await db.$transaction((tx) =>
      appendAssistantMessage(tx, {
        conversationId: fixture.conversationId,
        message: {
          id: messageId,
          role: "assistant",
          parts: z.array(z.json()).parse(parts),
        },
      }),
    )
    const saved = await db.assistantMessage.findUniqueOrThrow({
      where: { id: messageId },
    })
    const restored = z.array(generalStoredPartSchema).parse(saved.parts)
    const hint = restored.flatMap((part) =>
      part.type === "data-general-answer"
        ? [parseGeneralReadContinuation(part.data.continuation)].filter(Boolean)
        : [],
    )[0]
    expect(hint).toEqual(header.continuation)
    const restoredContext = generalReadContinuationContext([
      { role: "assistant", parts: restored },
    ])
    expect(restoredContext).toContain(`"query":"${itemName}"`)
    expect(restoredContext).toContain('"due":"overdue"')
    expect(restoredContext).toContain('"next":null')
    const reply = renderWhatsAppFinalReply(restored)
    if (reply.kind !== "reply")
      throw Error("Expected deterministic saved Service reply")
    const text = reply.chunks.join("\n")
    expect(text).toContain("2.5 allocated")
    expect(text).toContain(generalMoney(31250, "NGN"))
    expect(text).toContain(past.toISOString())
    expect(text).not.toContain(generalMoney(18750, "NGN"))

    answers.length = 0
    const all = result.parse(
      await read(
        { query: itemName, due: "all" },
        { toolCallId: "tracked-all", messages: [] },
      ),
    ).data
    expect(all.items.map((row) => row.id).sort()).toEqual(
      [overdue.jobId, later.jobId].sort(),
    )
    answers.length = 0
    expect(
      result.parse(
        await read(
          { query: "Synthetic no matching work", due: "overdue" },
          { toolCallId: "tracked-empty", messages: [] },
        ),
      ).data.items,
    ).toEqual([])
    expect(answers[0]?.value).toBe("0 jobs on this page")
    expect(answers[0]?.detail).toContain("not a complete queue")
    answers.length = 0
    expect(
      await disconnectAssistantWhatsApp(db, {
        phoneNumberId: fixture.principal.phoneNumberId,
        senderId: fixture.principal.senderId,
      }),
    ).toEqual({ disconnected: true })
    expect(
      await read(input, { toolCallId: "tracked-revoked", messages: [] }),
    ).toMatchObject({ status: "unavailable" })
    expect(answers).toHaveLength(1)
    expect(answers[0]?.value).toBe("Unavailable")
    expect(answers[0]?.continuation).toBeUndefined()
    expect(JSON.stringify(answers)).not.toContain(itemName)
    expect(JSON.stringify(answers)).not.toContain(overdue.jobId)
    expect(
      await db.serviceJob.findMany({
        where: { tenantId },
        include: { lines: true, dueCommitments: true, events: true },
        orderBy: { id: "asc" },
      }),
    ).toEqual(snapshot)
    expect(
      await db.assistantRun.count({ where: { conversation: { tenantId } } }),
    ).toBe(0)
    expect(
      await db.assistantUsageEvent.count({
        where: { tenantId, actorUserId: userId },
      }),
    ).toBe(0)
    expect(
      await db.assistantActionProposal.count({ where: { tenantId } }),
    ).toBe(0)
  }, 240_000)
})
