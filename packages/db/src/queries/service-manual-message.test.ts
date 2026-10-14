import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  listServiceJobMessagesInTransaction,
  recordServiceManualMessageInTransaction,
  reviewServiceManualMessageInTransaction,
} from "./service-manual-message"
import { listDueServiceNotificationIntentIds } from "./service-public"

// In-memory transaction: synthetic rows only, no database connection.
type Intent = {
  id: string
  tenantId: string
  storeId: string
  serviceJobId: string
  businessEventKey: string
  audienceKey: string
  templatePurpose: string
  channel: string
  status: string
  completedAt: Date | null
  renderedMessage: string
  customerPhone: string | null
  customerEmail: string | null
  createdByUserId: string
  createdAt: Date
  manualShares: Array<{
    channel: string
    note: string | null
    sharedByUserId: string
    sharedAt: Date
    id: string
  }>
  deliveryAttempts: Array<{
    id: string
    channel: string
    status: string
    createdAt: Date
  }>
}
function world(
  options: {
    role?: string
    mode?: string
    phone?: string | null
    clinical?: boolean
  } = {},
) {
  const intents: Intent[] = []
  const locks: string[] = []
  const order = {
    id: "order-1",
    tenantId: "tenant-a",
    storeId: "store-a",
    orderNumber: "ORD-7",
    customerName: "Amina",
    customerPhone:
      options.phone === undefined ? "+234 803 000 1234" : options.phone,
    customerEmail: "amina@example.test",
    acceptedCommerceQuoteVersion: null,
    prescriptionPickupFulfillment: options.clinical ? { id: "rx" } : null,
    prescriptionDeliveryAddress: null,
    _count: { prescriptionPaymentIntents: 0 },
  }
  const job = {
    id: "job-1",
    tenantId: "tenant-a",
    revision: 4,
    storeId: "store-a",
    commercialOrderId: "order-1",
    commercialOrder: order,
  }
  let sequence = 0
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?")
      if (sql.includes('FROM "Membership"'))
        return [
          {
            id: "m-1",
            role: options.role ?? "OWNER",
            staffAccessMode: options.mode ?? "LEGACY",
          },
        ]
      if (sql.includes('FROM "CommercialOrder"')) {
        locks.push("order")
        return values.includes(job.id) && values.includes("store-a")
          ? [{ id: order.id }]
          : []
      }
      if (sql.includes('FROM "ServiceJob"')) {
        locks.push("job")
        return values.includes(job.id) && values.includes("store-a")
          ? [{ id: job.id }]
          : []
      }
      return []
    },
    store: {
      findFirst: async (args: { where: { id: string } }) =>
        args.where.id === "store-a" ? { id: "store-a" } : null,
    },
    staffStoreAssignment: {
      findFirst: async () => ({ id: "a-1", revision: 1 }),
    },
    serviceJob: {
      findFirst: async (args: {
        where: { id: string; tenantId: string; storeId: string }
      }) =>
        args.where.id === job.id &&
        args.where.tenantId === job.tenantId &&
        args.where.storeId === job.storeId
          ? job
          : null,
    },
    serviceNotificationIntent: {
      findUnique: async (args: {
        where: {
          tenantId_businessEventKey_audienceKey_templatePurpose: {
            businessEventKey: string
          }
        }
      }) =>
        intents.find(
          (intent) =>
            intent.businessEventKey ===
            args.where.tenantId_businessEventKey_audienceKey_templatePurpose
              .businessEventKey,
        ) ?? null,
      create: async (args: {
        data: Omit<
          Intent,
          "id" | "createdAt" | "manualShares" | "deliveryAttempts"
        >
      }) => {
        const intent: Intent = {
          ...args.data,
          id: `intent-${++sequence}`,
          createdAt: new Date(Date.now() + sequence),
          manualShares: [],
          deliveryAttempts: [],
        }
        intents.push(intent)
        return intent
      },
      findMany: async (args: { take: number }) =>
        [...intents]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, args.take),
    },
    serviceManualShare: {
      create: async (args: {
        data: {
          notificationIntentId: string
          channel: string
          note: string | null
          sharedByUserId: string
          sharedAt: Date
        }
      }) => {
        const share = { ...args.data, id: `share-${++sequence}` }
        intents
          .find((intent) => intent.id === args.data.notificationIntentId)
          ?.manualShares.push(share)
        return share
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    intents,
    locks,
    order,
    job,
  }
}
const input = {
  tenantId: "tenant-a",
  storeId: "store-a",
  actorUserId: "owner-u",
  jobId: "job-1",
  channel: "whatsapp" as const,
  message: "Your shoes are ready for pickup.",
  reason: "Sent from the shop phone",
  alreadyShared: true as const,
}

test("review pins the recipient to the Order and binds every reviewed fact", async () => {
  const { tx } = world()
  const { review, target } = await reviewServiceManualMessageInTransaction(
    tx,
    input,
  )
  expect(review).toEqual({
    jobId: "job-1",
    jobRevision: 4,
    storeId: "store-a",
    orderId: "order-1",
    orderNumber: "ORD-7",
    recipient: {
      name: "Amina",
      phone: "+234 803 000 1234",
      email: "amina@example.test",
    },
    channel: "whatsapp",
    message: "Your shoes are ready for pickup.",
    reason: "Sent from the shop phone",
    alreadyShared: true,
  })
  expect(target.id).toBe("job-1")
  for (const changed of [
    { ...input, message: "Different" },
    { ...input, channel: "sms" as const },
    { ...input, reason: "Other" },
  ])
    expect(
      (await reviewServiceManualMessageInTransaction(tx, changed)).target
        .revision,
    ).not.toBe(target.revision)
})

test("refusals: no phone for SMS/WhatsApp, not shared, bad text, scoped, clinical, other Store", async () => {
  const noPhone = world({ phone: null })
  await expect(
    reviewServiceManualMessageInTransaction(noPhone.tx, input),
  ).rejects.toThrow("has no customer phone number")
  expect(
    (
      await reviewServiceManualMessageInTransaction(noPhone.tx, {
        ...input,
        channel: "manual",
      })
    ).review.recipient.phone,
  ).toBeNull()
  const { tx } = world()
  await expect(
    reviewServiceManualMessageInTransaction(tx, {
      ...input,
      alreadyShared: false as unknown as true,
    }),
  ).rejects.toThrow("only after you have shared it")
  for (const message of ["  ", "x".repeat(1001)])
    await expect(
      reviewServiceManualMessageInTransaction(tx, { ...input, message }),
    ).rejects.toThrow("exact message")
  await expect(
    reviewServiceManualMessageInTransaction(
      world({ role: "MANAGER", mode: "SCOPED" }).tx,
      input,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    reviewServiceManualMessageInTransaction(
      world({ role: "CASHIER" }).tx,
      input,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    reviewServiceManualMessageInTransaction(
      world({ clinical: true }).tx,
      input,
    ),
  ).rejects.toThrow("Clinical service records")
  await expect(
    reviewServiceManualMessageInTransaction(tx, {
      ...input,
      storeId: "store-b",
    }),
  ).rejects.toThrow()
  await expect(
    reviewServiceManualMessageInTransaction(tx, {
      ...input,
      tenantId: "tenant-b",
    }),
  ).rejects.toThrow()
})

test("recording locks Order then Job and saves a MANUAL, COMPLETED fact with its share", async () => {
  const w = world()
  const result = await recordServiceManualMessageInTransaction(w.tx, {
    ...input,
    clientCommandId: "proposal-key-0001",
  })
  expect(w.locks).toEqual(["order", "job"])
  expect(result.replayed).toBe(false)
  expect(w.intents).toHaveLength(1)
  expect(w.intents[0]).toMatchObject({
    channel: "MANUAL",
    status: "COMPLETED",
    customerPhone: "+234 803 000 1234",
    renderedMessage: "Your shoes are ready for pickup.",
    audienceKey: "customer",
    templatePurpose: "assistant_manual_share",
    businessEventKey: "proposal-key-0001",
  })
  expect(w.intents[0]?.completedAt).toBeInstanceOf(Date)
  expect(w.intents[0]?.manualShares).toMatchObject([
    {
      channel: "WHATSAPP",
      note: "Sent from the shop phone",
      sharedByUserId: "owner-u",
    },
  ])
})

test("replay returns the original; a changed payload or recipient is refused and changes nothing", async () => {
  const w = world()
  const command = { ...input, clientCommandId: "proposal-key-0001" }
  const first = await recordServiceManualMessageInTransaction(w.tx, command)
  const again = await recordServiceManualMessageInTransaction(w.tx, command)
  expect(again.replayed).toBe(true)
  expect(again.intent.id).toBe(first.intent.id)
  expect(w.intents).toHaveLength(1)
  for (const changed of [
    { ...command, message: "Different words" },
    { ...command, channel: "sms" as const },
    { ...command, reason: "Another reason" },
    { ...command, actorUserId: "other-u" },
  ])
    await expect(
      recordServiceManualMessageInTransaction(w.tx, changed),
    ).rejects.toThrow("already recorded a different")
  // The Order's customer phone changed after the original was recorded.
  w.order.customerPhone = "+234 803 999 0000"
  await expect(
    recordServiceManualMessageInTransaction(w.tx, command),
  ).rejects.toThrow("already recorded a different")
  expect(w.intents).toHaveLength(1)
  expect(w.intents[0]?.manualShares).toHaveLength(1)
})

test("a stale reviewed revision is refused before any write", async () => {
  const w = world()
  const { target } = await reviewServiceManualMessageInTransaction(w.tx, input)
  w.job.revision = 5
  await expect(
    recordServiceManualMessageInTransaction(w.tx, {
      ...input,
      clientCommandId: "proposal-key-0002",
      expectedReviewRevision: target.revision,
    }),
  ).rejects.toThrow("changed. Review again.")
  expect(w.intents).toHaveLength(0)
})

test("the provider dispatcher can never select a manual record", async () => {
  let where: unknown
  const db = {
    serviceNotificationIntent: {
      findMany: async (args: { where: unknown }) => {
        where = args.where
        return []
      },
    },
  } as unknown as PrismaClient
  await listDueServiceNotificationIntentIds(db, {})
  const filter = where as {
    channel: { in: string[] }
    status: { in: string[] }
  }
  expect(filter.channel.in).not.toContain("MANUAL")
  expect(filter.status.in).not.toContain("COMPLETED")
})

test("history is bounded, newest first, safe and classified without inference", async () => {
  const w = world()
  await recordServiceManualMessageInTransaction(w.tx, {
    ...input,
    clientCommandId: "proposal-key-0003",
  })
  const recorded = w.intents[0]
  if (!recorded) throw Error("Manual record missing")
  w.intents.push({
    ...recorded,
    id: "provider-1",
    businessEventKey: "evt",
    channel: "SMS",
    status: "READY",
    completedAt: null,
    createdAt: new Date(Date.now() + 10_000),
    manualShares: [],
    deliveryAttempts: [],
  })
  const history = await listServiceJobMessagesInTransaction(w.tx, {
    ...input,
    limit: 50,
  })
  expect(history.messages.map((m) => `${m.id}:${m.kind}`)).toEqual([
    "provider-1:provider_pending",
    `${recorded.id}:staff_reported_share`,
  ])
  expect(history.messages[1]).toMatchObject({
    recipientPhoneLast4: "1234",
    shares: [{ channel: "WHATSAPP", note: "Sent from the shop phone" }],
  })
  expect(JSON.stringify(history)).not.toContain("providerKey")
  expect(JSON.stringify(history)).not.toContain("+234 803 000 1234")
  await expect(
    listServiceJobMessagesInTransaction(
      world({ role: "MANAGER", mode: "SCOPED" }).tx,
      input,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("a completed replay after access is revoked or narrowed is refused unchanged", async () => {
  const options: { role?: string; mode?: string } = {}
  const w = world(options)
  const command = { ...input, clientCommandId: "proposal-key-0004" }
  await recordServiceManualMessageInTransaction(w.tx, command)
  for (const change of [
    { role: "CASHIER" },
    { role: "MANAGER", mode: "SCOPED" },
  ]) {
    Object.assign(options, change)
    await expect(
      recordServiceManualMessageInTransaction(w.tx, command),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  }
  expect(w.intents).toHaveLength(1)
  expect(w.intents[0]?.manualShares).toHaveLength(1)
})
