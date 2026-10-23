import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import {
  completeAssistantServiceJobCardInTransaction,
  getAssistantServiceJobCard,
  linkExistingAssistantServiceJobCardInTransaction,
} from "./assistant-service-job-card"

type Input = Parameters<typeof completeAssistantServiceJobCardInTransaction>[1]
const input: Input = {
  actorUserId: "owner",
  tenantId: "freshcare",
  storeId: "main",
  sourceAnswerId: "card",
  sourceMessageId: "message",
  clientIntakeId: "random-form-command",
  schemaVersion: 1,
  lines: [{ offeringId: "shirt", quantity: "2" }],
}
function fixture() {
  const draft = {
    origin: { tenantId: "freshcare", storeId: "main" },
    currencyCode: "NGN",
    lines: [
      {
        name: "Shirt · Wash & iron",
        offeringId: "shirt",
        quantity: "2",
        unitPriceMinor: 20_000,
        totalMinor: 40_000,
      },
    ],
    totalMinor: 40_000,
    assumptions: [],
  }
  const message = {
    id: "message",
    parts: [
      { type: "text", text: "Keep history" },
      {
        type: "data-general-answer",
        data: { id: "card", serviceDraft: draft },
      },
      {
        type: "data-general-answer",
        data: { id: "another-card", value: "Keep another result" },
      },
    ] as unknown[],
  }
  const reads: unknown[] = []
  const writes: unknown[] = []
  const locks: unknown[] = []
  const creates: unknown[] = []
  const replays: unknown[] = []
  const intake = {
    id: "intake",
    createdAt: new Date("2026-10-23T12:00:00Z"),
    confirmedAt: new Date("2026-10-23T12:00:00Z"),
    jobs: [{ id: "job" }],
    commercialOrder: {
      id: "order",
      orderNumber: "ORD-006",
      currencyCode: "NGN",
      customerName: null,
      totalMinor: 40_000,
      lines: [
        {
          offeringId: "shirt",
          quantity: { toString: () => "2" },
          unitPriceMinor: 20_000,
          totalMinor: 40_000,
          snapshot: { offeringName: "Shirt · Wash & iron" },
        },
      ],
    },
  }
  const tx = {
    $queryRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      locks.push(values)
      return []
    },
    assistantMessage: {
      findMany: async (query: {
        where: {
          id: string
          conversation: {
            tenantId: string
            storeId: string
            ownerUserId: string
          }
        }
      }) => {
        reads.push(query)
        const scope = query.where.conversation
        return query.where.id === "message" &&
          scope.tenantId === "freshcare" &&
          scope.storeId === "main" &&
          scope.ownerUserId === "owner"
          ? [message]
          : []
      },
      update: async (query: { data: { parts: unknown[] } }) => {
        writes.push(query)
        message.parts = query.data.parts
        return message
      },
    },
    serviceIntake: {
      findFirst: async (query: {
        where: {
          id: string
          tenantId: string
          storeId: string
          createdByUserId: string
        }
      }) => {
        reads.push(query)
        const scope = query.where
        return scope.id === "intake" &&
          scope.tenantId === "freshcare" &&
          scope.storeId === "main" &&
          scope.createdByUserId === "owner"
          ? intake
          : null
      },
    },
  } as unknown as Prisma.TransactionClient
  const result = {
    intakeId: "intake",
    jobs: [],
    notificationIntentIds: [],
    orderId: "order",
  }
  const domain = {
    create: async (
      _tx: Prisma.TransactionClient,
      command: Omit<Input, "sourceAnswerId" | "sourceMessageId">,
    ) => {
      creates.push(command)
      return result
    },
    replay: async (_tx: Prisma.TransactionClient, command: unknown) => {
      replays.push(command)
      return result
    },
  }
  return { tx, message, intake, reads, writes, locks, creates, replays, domain }
}

test("native save locks the source message and atomically preserves the same card receipt and unrelated history", async () => {
  const f = fixture()
  const result = await completeAssistantServiceJobCardInTransaction(
    f.tx,
    input,
    f.domain,
  )
  expect(f.locks).toEqual([["message"]])
  expect(f.creates).toHaveLength(1)
  expect(f.creates[0]).toMatchObject({
    clientIntakeId: expect.stringMatching(/^assistant-card:[a-f0-9]{64}$/),
  })
  expect(f.creates[0]).not.toHaveProperty("sourceAnswerId")
  expect(f.creates[0]).not.toHaveProperty("sourceMessageId")
  expect(result.assistantCard).toMatchObject({
    jobId: "job",
    orderNumber: "ORD-006",
    totalMinor: 40_000,
  })
  expect(f.message.parts[0]).toEqual({ type: "text", text: "Keep history" })
  expect(f.message.parts[2]).toEqual({
    type: "data-general-answer",
    data: { id: "another-card", value: "Keep another result" },
  })
  expect(f.writes).toHaveLength(1)
})
test("reopening and resubmitting the same card uses the durable job, even with a fresh form identity or edits", async () => {
  const f = fixture()
  await completeAssistantServiceJobCardInTransaction(f.tx, input, f.domain)
  const receipt = await getAssistantServiceJobCard(f.tx, input)
  expect(receipt?.jobId).toBe("job")
  const again = await completeAssistantServiceJobCardInTransaction(
    f.tx,
    {
      ...input,
      clientIntakeId: "different-form-id",
      lines: [{ offeringId: "shirt", quantity: "40" }],
    },
    f.domain,
  )
  expect(f.creates).toHaveLength(1)
  expect(f.replays).toEqual([
    {
      intakeId: "intake",
      tenantId: "freshcare",
      actorUserId: "owner",
      schemaVersion: 1,
    },
  ])
  if (!receipt) throw Error("Missing saved receipt")
  expect(again.assistantCard).toEqual(receipt)
  expect(f.writes).toHaveLength(1)
})
test("foreign actor/business/Store cannot read or create through a copied answer ID", async () => {
  for (const patch of [
    { actorUserId: "foreign" },
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { sourceMessageId: "foreign" },
  ]) {
    const f = fixture()
    await expect(
      completeAssistantServiceJobCardInTransaction(
        f.tx,
        { ...input, ...patch },
        f.domain,
      ),
    ).rejects.toThrow("not available")
    expect(f.creates).toHaveLength(0)
    expect(f.writes).toHaveLength(0)
  }
})
test("failed canonical saves never persist Created; original job retrofit requires an exact saved match", async () => {
  const f = fixture()
  await expect(
    completeAssistantServiceJobCardInTransaction(f.tx, input, {
      ...f.domain,
      create: async () => {
        throw Error("Rejected canonical command")
      },
    }),
  ).rejects.toThrow("Rejected canonical command")
  expect(f.writes).toHaveLength(0)
  expect(await getAssistantServiceJobCard(f.tx, input)).toBeNull()
  f.intake.commercialOrder.totalMinor = 50_000
  await expect(
    linkExistingAssistantServiceJobCardInTransaction(f.tx, {
      ...input,
      intakeId: "intake",
    }),
  ).rejects.toThrow("does not exactly match")
  expect(f.writes).toHaveLength(0)
  f.intake.commercialOrder.totalMinor = 40_000
  await linkExistingAssistantServiceJobCardInTransaction(f.tx, {
    ...input,
    intakeId: "intake",
  })
  expect((await getAssistantServiceJobCard(f.tx, input))?.orderNumber).toBe(
    "ORD-006",
  )
  expect(f.creates).toHaveLength(0)
})
