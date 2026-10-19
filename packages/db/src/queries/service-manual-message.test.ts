import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  listServiceJobMessagesInTransaction,
  readServiceManualMessageEditorContextInTransaction,
  readServiceManualMessageOriginalInTransaction,
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
    notificationIntentId: string
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
    active?: boolean
  } = {},
) {
  const intents: Intent[] = []
  const locks: string[] = []
  const terminalProbes: Array<{
    notificationIntentId: string
    status: string
  }> = []
  const historyBounds: Array<{
    take: number
    attempts: number
    shares: number
  }> = []
  const replayBounds: Array<{
    manualShares: { take: number; orderBy: Array<Record<string, string>> }
    deliveryAttempts: { take: number; select: { id: boolean } }
  }> = []
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
        return options.active === false ||
          !values.includes("tenant-a") ||
          values.includes("unauthorized-u")
          ? []
          : [
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
      findFirst: async (args: { where: { id: string; tenantId: string } }) =>
        args.where.id === "store-a" && args.where.tenantId === "tenant-a"
          ? { id: "store-a" }
          : null,
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
      findFirst: async (args: {
        where: Record<string, unknown>
        select: {
          manualShares: { where: { id: string }; take: number }
          deliveryAttempts: { take: number }
        }
      }) => {
        const intent = intents.find((row) =>
          Object.entries(args.where).every(
            ([key, value]) => Reflect.get(row, key) === value,
          ),
        )
        return intent
          ? {
              ...intent,
              manualShares: intent.manualShares
                .filter(
                  (share) => share.id === args.select.manualShares.where.id,
                )
                .slice(0, args.select.manualShares.take),
              deliveryAttempts: intent.deliveryAttempts.slice(
                0,
                args.select.deliveryAttempts.take,
              ),
            }
          : null
      },
      findUnique: async (args: {
        where: {
          tenantId_businessEventKey_audienceKey_templatePurpose: {
            businessEventKey: string
          }
        }
        include: {
          manualShares: { take: number; orderBy: Array<Record<string, string>> }
          deliveryAttempts: { take: number; select: { id: boolean } }
        }
      }) => {
        replayBounds.push(args.include)
        const intent = intents.find(
          (intent) =>
            intent.businessEventKey ===
            args.where.tenantId_businessEventKey_audienceKey_templatePurpose
              .businessEventKey,
        )
        return intent
          ? {
              ...intent,
              manualShares: [...intent.manualShares]
                .sort(
                  (a, b) =>
                    b.sharedAt.getTime() - a.sharedAt.getTime() ||
                    b.id.localeCompare(a.id),
                )
                .slice(0, args.include.manualShares.take),
              deliveryAttempts: intent.deliveryAttempts
                .slice(0, args.include.deliveryAttempts.take)
                .map((attempt) => ({ id: attempt.id })),
            }
          : null
      },
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
      findMany: async (args: {
        take: number
        select: {
          deliveryAttempts: { take: number }
          manualShares: { take: number }
        }
      }) => {
        historyBounds.push({
          take: args.take,
          attempts: args.select.deliveryAttempts.take,
          shares: args.select.manualShares.take,
        })
        return [...intents]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, args.take)
          .map((row) => ({
            ...row,
            deliveryAttempts: [...row.deliveryAttempts]
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .slice(0, args.select.deliveryAttempts.take),
            manualShares: row.manualShares.slice(
              0,
              args.select.manualShares.take,
            ),
          }))
      },
    },
    serviceDeliveryAttempt: {
      findFirst: async (args: {
        where: { notificationIntentId: string; status: string }
        select: { id: boolean }
      }) => {
        terminalProbes.push(args.where)
        const row = intents
          .find((intent) => intent.id === args.where.notificationIntentId)
          ?.deliveryAttempts.find(
            (attempt) => attempt.status === args.where.status,
          )
        return row ? { id: row.id } : null
      },
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
    terminalProbes,
    historyBounds,
    replayBounds,
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

test("replay bounds multiplicity detection to two shares and any delivery attempt to one", async () => {
  const w = world()
  const command = { ...input, clientCommandId: "bounded-replay-0001" }
  const first = await recordServiceManualMessageInTransaction(w.tx, command)
  expect(
    (await recordServiceManualMessageInTransaction(w.tx, command)).replayed,
  ).toBe(true)
  const intent = w.intents[0]
  const share = intent?.manualShares[0]
  if (!intent || !share) throw Error("Missing saved original")
  for (let index = 0; index < 100; index++)
    intent.manualShares.push({
      ...share,
      id: `extra-${index}`,
      sharedAt: new Date(share.sharedAt.getTime() + index + 1),
    })
  const beforeShares = JSON.stringify(w.intents)
  await expect(
    recordServiceManualMessageInTransaction(w.tx, command),
  ).rejects.toThrow("already recorded a different")
  expect(JSON.stringify(w.intents)).toBe(beforeShares)
  intent.manualShares = [share]
  for (let index = 0; index < 100; index++)
    intent.deliveryAttempts.push({
      id: `private-${index}`,
      channel: "SMS",
      status: "PENDING",
      createdAt: new Date(index),
    })
  const beforeAttempts = JSON.stringify(w.intents)
  await expect(
    recordServiceManualMessageInTransaction(w.tx, command),
  ).rejects.toThrow("already recorded a different")
  expect(JSON.stringify(w.intents)).toBe(beforeAttempts)
  for (const bounds of w.replayBounds)
    expect(bounds).toEqual({
      manualShares: {
        orderBy: [{ sharedAt: "desc" }, { id: "desc" }],
        take: 2,
      },
      deliveryAttempts: { take: 1, select: { id: true } },
    })
  expect(w.intents).toHaveLength(1)
  expect(first.intent.id).toBe(intent.id)
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

test("history keeps older delivered/sent truth independently of its latest three displayed attempts", async () => {
  for (const terminal of ["DELIVERED", "SENT"])
    for (const recent of ["FAILED", "PENDING"]) {
      const w = world()
      await recordServiceManualMessageInTransaction(w.tx, {
        ...input,
        clientCommandId: "terminal-history",
      })
      const row = w.intents[0]
      if (!row) throw Error("Missing synthetic intent")
      row.channel = "SMS"
      row.deliveryAttempts = [terminal, recent, recent, recent].map(
        (status, index) => ({
          id: `private-attempt-${index}`,
          channel: "SMS",
          status,
          createdAt: new Date(1000 + index),
        }),
      )
      const result = await listServiceJobMessagesInTransaction(w.tx, input)
      expect(result.messages[0]?.kind).toBe(
        terminal === "DELIVERED"
          ? "provider_delivered"
          : "provider_sent_unconfirmed",
      )
      expect(result.messages[0]?.attempts.map((a) => a.status)).toEqual([
        recent,
        recent,
        recent,
      ])
      expect(w.terminalProbes).toEqual([
        { notificationIntentId: row.id, status: "DELIVERED" },
        { notificationIntentId: row.id, status: "SENT" },
      ])
      expect(w.historyBounds).toEqual([{ take: 11, attempts: 3, shares: 3 }])
      expect(JSON.stringify(result)).not.toContain("private-attempt")
      row.status = "CANCELLED"
      w.terminalProbes.length = 0
      expect(
        (await listServiceJobMessagesInTransaction(w.tx, input)).messages[0]
          ?.kind,
      ).toBe("cancelled")
      expect(w.terminalProbes).toHaveLength(0)
      row.channel = "MANUAL"
      expect(
        (await listServiceJobMessagesInTransaction(w.tx, input)).messages[0]
          ?.kind,
      ).toBe("staff_reported_share")
      expect(w.terminalProbes).toHaveLength(0)
    }
})

test("terminal truth probes are bounded to two per displayed provider intent with the existing twenty-intent cap", async () => {
  const w = world()
  await recordServiceManualMessageInTransaction(w.tx, {
    ...input,
    clientCommandId: "bounded-history",
  })
  const template = w.intents[0]
  if (!template) throw Error("Missing intent")
  w.intents.length = 0
  for (let index = 0; index < 25; index++)
    w.intents.push({
      ...template,
      id: `provider-${index}`,
      channel: "SMS",
      createdAt: new Date(index),
      manualShares: [],
      deliveryAttempts: [],
    })
  const result = await listServiceJobMessagesInTransaction(w.tx, {
    ...input,
    limit: 50,
  })
  expect(result.messages).toHaveLength(20)
  expect(result.hasMore).toBe(true)
  expect(w.terminalProbes).toHaveLength(40)
  expect(w.historyBounds).toEqual([{ take: 21, attempts: 3, shares: 3 }])
})

test("older delivery outranks older sent evidence while failed-only messages remain failed", async () => {
  const w = world()
  await recordServiceManualMessageInTransaction(w.tx, {
    ...input,
    clientCommandId: "delivery-precedence",
  })
  const row = w.intents[0]
  if (!row) throw Error("Missing provider intent")
  row.channel = "WHATSAPP"
  row.deliveryAttempts = [
    "DELIVERED",
    "SENT",
    "FAILED",
    "FAILED",
    "FAILED",
  ].map((status, index) => ({
    id: `attempt-${index}`,
    channel: "WHATSAPP",
    status,
    createdAt: new Date(index),
  }))
  expect(
    (await listServiceJobMessagesInTransaction(w.tx, input)).messages[0]?.kind,
  ).toBe("provider_delivered")
  row.deliveryAttempts = row.deliveryAttempts.filter(
    (attempt) => attempt.status === "FAILED",
  )
  expect(
    (await listServiceJobMessagesInTransaction(w.tx, input)).messages[0]?.kind,
  ).toBe("provider_failed")
})

test("editor context returns fresh current recipient and owning identities without recording a share", async () => {
  for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
    const w = world({ role })
    const result = await readServiceManualMessageEditorContextInTransaction(
      w.tx,
      input,
    )
    expect(result).toMatchObject({
      actorUserId: "owner-u",
      tenantId: "tenant-a",
      storeId: "store-a",
      job: { id: "job-1", revision: 4 },
      order: { id: "order-1", number: "ORD-7" },
      recipient: {
        name: "Amina",
        phone: "+234 803 000 1234",
        email: "amina@example.test",
      },
    })
    expect(Number.isFinite(Date.parse(result.asOf))).toBe(true)
    expect(w.intents).toHaveLength(0)
    expect(w.locks).toEqual([])
  }
  const w = world({ phone: null })
  expect(
    (await readServiceManualMessageEditorContextInTransaction(w.tx, input))
      .recipient.phone,
  ).toBeNull()
  w.order.customerName = "Changed current name"
  expect(
    (await readServiceManualMessageEditorContextInTransaction(w.tx, input))
      .recipient.name,
  ).toBe("Changed current name")
})

async function recordedWorld() {
  const w = world()
  const result = await recordServiceManualMessageInTransaction(w.tx, {
    ...input,
    message: "x".repeat(1000),
    reason: "n".repeat(500),
    clientCommandId: "exact-original-message",
  })
  const target = {
    ...input,
    intentId: result.intent.id,
    shareId: result.share.id,
  }
  w.locks.length = 0
  return { ...w, target }
}

test("exact original retains full saved content/contact and selected share while labelling current Order name separately", async () => {
  const w = await recordedWorld()
  const original = w.intents[0]
  const share = original?.manualShares[0]
  if (!original || !share) throw Error("Missing exact record")
  original.manualShares.unshift({
    ...share,
    id: "other-share",
    note: "Different share",
    channel: "MANUAL",
  })
  w.order.customerName = "Current name changed"
  w.order.customerPhone = "+234 changed phone"
  w.order.customerEmail = "current@example.test"
  const before = JSON.stringify(w.intents)
  const result = await readServiceManualMessageOriginalInTransaction(
    w.tx,
    w.target,
  )
  expect(result.intent).toEqual({
    id: original.id,
    channel: "MANUAL",
    status: "COMPLETED",
    purpose: "assistant_manual_share",
    message: "x".repeat(1000),
    recipient: {
      phone: "+234 803 000 1234",
      email: "amina@example.test",
    },
    createdAt: original.createdAt.toISOString(),
    completedAt: original.completedAt?.toISOString(),
  })
  expect(result.share).toEqual({
    id: share.id,
    channel: "WHATSAPP",
    note: "n".repeat(500),
    sharedAt: share.sharedAt.toISOString(),
    sharedByUserId: "owner-u",
  })
  expect(result.currentOrderRecipientName).toBe("Current name changed")
  expect(result).toMatchObject({
    actorUserId: "owner-u",
    tenantId: "tenant-a",
    storeId: "store-a",
    job: { id: "job-1", revision: 4 },
    order: { id: "order-1", number: "ORD-7" },
    kind: "staff_reported_share",
    sending: "none",
    delivery: "unverified",
  })
  expect(result.intent.message).toHaveLength(1000)
  for (const privateKey of [
    "businessEventKey",
    "providerKey",
    "providerAttemptId",
    "deliveryAttempts",
    "createdByUserId",
  ])
    expect(JSON.stringify(result)).not.toContain(privateKey)
  expect(JSON.stringify(w.intents)).toBe(before)
  expect(w.locks).toEqual([])
})

test("exact original supports all three manual-share channels for every permitted role, with nullable saved contacts", async () => {
  for (const role of ["OWNER", "ADMIN", "MANAGER"])
    for (const channel of ["manual", "sms", "whatsapp"] as const) {
      const w = world({ role })
      const result = await recordServiceManualMessageInTransaction(w.tx, {
        ...input,
        channel,
        clientCommandId: "channel-role-original",
      })
      const original = await readServiceManualMessageOriginalInTransaction(
        w.tx,
        { ...input, intentId: result.intent.id, shareId: result.share.id },
      )
      expect(original.share.channel).toBe(channel.toUpperCase())
      expect(original.sending).toBe("none")
      expect(original.delivery).toBe("unverified")
    }
  const w = world({ phone: null })
  const result = await recordServiceManualMessageInTransaction(w.tx, {
    ...input,
    channel: "manual",
    clientCommandId: "nullable-original",
  })
  const row = w.intents[0]
  const share = row?.manualShares[0]
  if (!row || !share) throw Error("Missing original")
  row.customerEmail = null
  share.sharedByUserId = ""
  const original = await readServiceManualMessageOriginalInTransaction(w.tx, {
    ...input,
    intentId: result.intent.id,
    shareId: result.share.id,
  })
  expect(original.intent.recipient).toEqual({ phone: null, email: null })
  expect(original.share.sharedByUserId).toBeNull()
})

test("context and original both recheck current authority, exact Store/Job/Order and clinical refusal", async () => {
  for (const options of [
    { role: "CASHIER" },
    { role: "OPERATOR" },
    { role: "MANAGER", mode: "SCOPED" },
    { active: false },
    { clinical: true },
  ]) {
    const w = world(options)
    for (const read of [
      readServiceManualMessageEditorContextInTransaction,
      readServiceManualMessageOriginalInTransaction,
    ])
      await expect(
        read(w.tx, { ...input, intentId: "intent", shareId: "share" }),
      ).rejects.toThrow()
    expect(w.intents).toHaveLength(0)
  }
  const w = await recordedWorld()
  for (const changed of [
    { tenantId: "other" },
    { storeId: "other" },
    { jobId: "other" },
    { actorUserId: "unauthorized-u" },
  ]) {
    for (const read of [
      readServiceManualMessageEditorContextInTransaction,
      readServiceManualMessageOriginalInTransaction,
    ])
      await expect(read(w.tx, { ...w.target, ...changed })).rejects.toThrow()
  }
  w.order.id = "different-order"
  for (const read of [
    readServiceManualMessageEditorContextInTransaction,
    readServiceManualMessageOriginalInTransaction,
  ])
    await expect(read(w.tx, w.target)).rejects.toThrow("invalid Order linkage")
})

test("original refuses foreign/missing/malformed intent/share identities and corrupted manual records without fallback", async () => {
  const w = await recordedWorld()
  for (const changed of [
    { intentId: "other" },
    { shareId: "other" },
    { intentId: "" },
    { shareId: " " },
    { intentId: "x".repeat(129) },
  ])
    await expect(
      readServiceManualMessageOriginalInTransaction(w.tx, {
        ...w.target,
        ...changed,
      }),
    ).rejects.toThrow()
  for (const changed of [
    { tenantId: "other" },
    { storeId: "other" },
    { serviceJobId: "other" },
    { channel: "SMS" },
    { status: "READY" },
    { templatePurpose: "other" },
    { audienceKey: "other" },
    { completedAt: null },
    { renderedMessage: " " },
    { renderedMessage: "x".repeat(1001) },
    {
      deliveryAttempts: [
        {
          id: "private",
          channel: "SMS",
          status: "DELIVERED",
          createdAt: new Date(),
        },
      ],
    },
  ]) {
    const current = w.intents[0]
    if (!current) throw Error("Missing intent")
    w.intents[0] = { ...current, ...changed }
    await expect(
      readServiceManualMessageOriginalInTransaction(w.tx, w.target),
    ).rejects.toThrow()
    w.intents[0] = current
  }
  const share = w.intents[0]?.manualShares[0]
  if (!share) throw Error("Missing share")
  for (const changed of [
    { notificationIntentId: "other" },
    { channel: "EMAIL" },
    { note: "x".repeat(501) },
  ]) {
    const saved = { ...share }
    Object.assign(share, changed)
    await expect(
      readServiceManualMessageOriginalInTransaction(w.tx, w.target),
    ).rejects.toThrow()
    Object.assign(share, saved)
  }
})
