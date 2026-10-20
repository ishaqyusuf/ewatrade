import { expect, test } from "bun:test"
import type { PrismaClient } from "@ewatrade/db"
import type { WhatsAppOnboardingAdapters } from "./whatsapp-onboarding"
import {
  cancelWhatsAppOnboarding,
  processWhatsAppOnboardingMessage,
} from "./whatsapp-onboarding-runtime"

const now = new Date("2026-10-20T14:00:00.000Z")
const env = { BETTER_AUTH_SECRET: "unit-test-only-secret" }
const address = { senderId: "2348000000001", phoneNumberId: "123456789" }
const config = {
  phoneNumberId: address.phoneNumberId,
  accessToken: "test-only",
}
type Row = {
  id: string
  token: string
  expiresAt: Date
  formData: unknown
  userId?: string | null
  completed?: boolean
}
function harness(unknownSend = false, linked = false) {
  const rows = new Map<string, Row>()
  let inTransaction = false
  let sent = 0
  let sequence = 0
  const db = {
    $transaction: async <T>(run: (tx: unknown) => Promise<T>) => {
      inTransaction = true
      try {
        return await run(db)
      } finally {
        inTransaction = false
      }
    },
    $executeRaw: async () => 1,
    onboardingSession: {
      findMany: async () =>
        [...rows.values()].filter((row) => row.expiresAt <= now).slice(0, 50),
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        for (const [key, row] of rows)
          if (where.id.in.includes(row.id)) rows.delete(key)
        return { count: 0 }
      },
      findUnique: async ({ where }: { where: { token: string } }) =>
        structuredClone(rows.get(where.token) ?? null),
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { token: string }
        create: Omit<Row, "id">
        update: Partial<Row>
      }) => {
        const prior = rows.get(where.token)
        const row = prior
          ? { ...prior, ...update }
          : { id: `row-${rows.size}`, ...create }
        rows.set(where.token, row)
        return row
      },
      create: async ({ data }: { data: Omit<Row, "id"> }) => {
        const row = { id: `row-${rows.size}`, ...data }
        rows.set(data.token, row)
        return row
      },
      update: async ({
        where,
        data,
      }: { where: { token: string }; data: Partial<Row> }) => {
        const prior = rows.get(where.token)
        if (!prior) throw new Error("missing")
        const row = { ...prior, ...data }
        rows.set(where.token, row)
        return row
      },
    },
    assistantWhatsAppGrant: {
      findFirst: async () => (linked ? { id: "grant" } : null),
    },
  }
  const adapters: WhatsAppOnboardingAdapters = {
    legal: null,
    requestEmail: async () => {
      expect(inTransaction).toBe(false)
      return { expiresAt: new Date(now.getTime() + 600_000) }
    },
    verifyEmail: async () => {
      expect(inTransaction).toBe(false)
      return { userId: "user", sessionId: "session" }
    },
    choices: async () => [
      {
        tenantId: "tenant",
        storeId: "store",
        membershipId: "membership",
        businessName: "Business",
        storeName: "Store",
      },
    ],
    connect: async () => {
      expect(inTransaction).toBe(false)
    },
  }
  const dependencies = {
    db: db as unknown as PrismaClient,
    env,
    now: () => now,
    adapters: () => adapters,
    provider: {
      sendText: async () => {
        expect(inTransaction).toBe(false)
        sent++
        if (unknownSend) throw new Error("transport lost")
        return { messageId: `outbound-${sent}` }
      },
    },
  }
  const message = (text: string, messageId = `message-${++sequence}`) => ({
    kind: "message" as const,
    type: "text" as const,
    phoneNumberId: address.phoneNumberId,
    externalCustomerId: address.senderId,
    messageId,
    text,
    timestamp: String(now.getTime() / 1000),
  })
  return {
    rows,
    dependencies,
    message,
    get sent() {
      return sent
    },
    send: (text: string, id?: string) =>
      processWhatsAppOnboardingMessage(message(text, id), config, dependencies),
  }
}

test("durable provider receipt suppresses a duplicate after process completion", async () => {
  const h = harness()
  expect((await h.send("Hi", "original")).outcome).toBe("sent")
  expect((await h.send("Hi", "original")).outcome).toBe("duplicate")
  expect(h.sent).toBe(1)
  expect(
    [...h.rows.values()].find((row) => row.token.startsWith("wa-receipt_"))
      ?.formData,
  ).toMatchObject({ status: "SENT" })
})

test("ambiguous send stays UNKNOWN and replay cannot send again", async () => {
  const h = harness(true)
  expect((await h.send("Hi", "uncertain")).outcome).toBe("unknown")
  expect((await h.send("Hi", "uncertain")).outcome).toBe("duplicate")
  expect(h.sent).toBe(1)
  expect(
    [...h.rows.values()].find((row) => row.token.startsWith("wa-receipt_"))
      ?.formData,
  ).toMatchObject({ status: "UNKNOWN" })
})

test("verified state associates privacy owner, completed connection clears private dialogue fields", async () => {
  const h = harness()
  await h.send("owner@example.com")
  await h.send("372819")
  const verified = [...h.rows.values()].find((row) =>
    row.token.startsWith("wa-flow_"),
  )
  expect(verified?.userId).toBe("user")
  await h.send("YES")
  const complete = [...h.rows.values()].find((row) =>
    row.token.startsWith("wa-flow_"),
  )
  expect(complete?.formData).toMatchObject({ state: null, lease: null })
  expect(complete?.userId).toBe("user")
  expect(JSON.stringify([...h.rows.values()])).not.toContain("372819")
  expect(JSON.stringify([...h.rows.values()])).not.toContain(config.accessToken)
})

test("STOP clears private flow and stale events never open a messaging window", async () => {
  const h = harness()
  await h.send("owner@example.com")
  await cancelWhatsAppOnboarding(address, h.dependencies.db, env)
  expect(
    [...h.rows.values()].find((row) => row.token.startsWith("wa-flow_"))
      ?.formData,
  ).toMatchObject({ state: null, lease: null })
  const stale = h.message("Hi")
  stale.timestamp = String(now.getTime() / 1000 - 24 * 60 * 60)
  expect(
    await processWhatsAppOnboardingMessage(stale, config, h.dependencies),
  ).toEqual({ handled: true })
  expect(h.sent).toBe(1)
})

test("linked ordinary six-digit amount bypasses onboarding without persistence or send", async () => {
  const h = harness(false, true)
  expect(await h.send("123456")).toEqual({ handled: false })
  expect(h.rows.size).toBe(0)
  expect(h.sent).toBe(0)
})
