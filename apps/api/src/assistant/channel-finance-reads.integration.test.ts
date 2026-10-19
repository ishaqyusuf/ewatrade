import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import {
  type GeneralAnswer,
  generalAnswerSchema,
} from "@ewatrade/assistant/general/contracts"
import { PrismaClient } from "@ewatrade/db"
import {
  claimAssistantWhatsAppLink,
  confirmAssistantWhatsAppLink,
  createAssistantWhatsAppLink,
  selectAssistantWhatsAppConversation,
} from "@ewatrade/db/assistant-whatsapp"
import {
  createFinanceBook,
  getFinanceAccountBalances,
} from "@ewatrade/db/queries"
import { PrismaPg } from "@prisma/adapter-pg"
import { z } from "zod"
import { assertQaAccessAcceptanceDatabase } from "../../../../packages/db/src/queries/acceptance/qa-access/database"
import { appRouter } from "../trpc/routers/_app"
import {
  createLinkedAssistantContext,
  isLinkedAssistantIdentity,
} from "./channel-principal"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const marker = `wa-finance-${randomUUID()}`
const userId = `${marker}-user`
const tenantId = `${marker}-tenant`
const foreignTenantId = `${marker}-foreign`
const storeId = `${marker}-store`
const membershipId = `${marker}-member`
const sessionId = `${marker}-session`
const conversationId = `${marker}-chat`
const customerId = `${marker}-customer`
const phoneNumberId = "90000000000008"
const senderId = `239${Date.now().toString().slice(-10)}`
const sourceDomain = "assistant-channel-finance.test"
const envNames = [
  "APP_ENV",
  "NODE_ENV",
  "ASSISTANT_WHATSAPP_ENABLED",
  "ASSISTANT_WHATSAPP_READS_ENABLED",
  "ASSISTANT_WHATSAPP_DISPLAY_NUMBER",
  "ASSISTANT_WHATSAPP_PILOT_USER_IDS",
  "ASSISTANT_WHATSAPP_PILOT_TENANT_IDS",
  "WHATSAPP_OTP_PHONE_NUMBER_ID",
  "WHATSAPP_OTP_ACCESS_TOKEN",
  "ASSISTANT_APPROVAL_SIGNING_KEY",
] as const
const previous = Object.fromEntries(
  envNames.map((key) => [key, process.env[key]]),
)
let db: PrismaClient
let bookId = ""
let foreignBookId = ""

beforeAll(async () => {
  if (!enabled) return
  assertQaAccessAcceptanceDatabase()
  if (
    new URL(process.env.EWATRADE_DATABASE_URL ?? "").pathname !==
    "/ewatrade_qa_v1"
  )
    throw Error("Explicit ewatrade_qa_v1 local QA target required.")
  Object.assign(process.env, {
    APP_ENV: "local",
    NODE_ENV: "test",
    ASSISTANT_WHATSAPP_ENABLED: "true",
    ASSISTANT_WHATSAPP_READS_ENABLED: "true",
    ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "2348000000000",
    ASSISTANT_WHATSAPP_PILOT_USER_IDS: userId,
    ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: tenantId,
    WHATSAPP_OTP_PHONE_NUMBER_ID: phoneNumberId,
    WHATSAPP_OTP_ACCESS_TOKEN: "synthetic-no-provider-use",
    ASSISTANT_APPROVAL_SIGNING_KEY:
      "synthetic-finance-signing-key-000000000000000",
  })
  db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.EWATRADE_DATABASE_URL,
      max: 2,
    }),
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  })
  await db.$transaction(async (tx) => {
    await tx.user.create({
      data: { id: userId, email: `${marker}@example.test`, ageBand: "ADULT" },
    })
    for (const id of [tenantId, foreignTenantId]) {
      await tx.tenant.create({
        data: {
          id,
          slug: id,
          name: "Synthetic finance business",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          currencyCode: "NGN",
          metadata: { retailOps: { subscription: { planId: "pro" } } },
          dataClassification: "QA",
          qaMarkedAt: new Date(),
          qaSourceDomain: sourceDomain,
        },
      })
      await tx.membership.create({
        data: {
          id: id === tenantId ? membershipId : `${marker}-foreign-member`,
          userId,
          tenantId: id,
          role: "OWNER",
          status: "ACTIVE",
        },
      })
    }
    await tx.store.create({
      data: {
        id: storeId,
        tenantId,
        slug: storeId,
        name: "Synthetic finance Store",
        status: "ACTIVE",
      },
    })
    await tx.session.create({
      data: {
        id: sessionId,
        userId,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    })
    await tx.assistantConversation.create({
      data: {
        id: conversationId,
        tenantId,
        storeId,
        ownerUserId: userId,
        purpose: "GENERAL",
        status: "ACTIVE",
      },
    })
    await tx.customer.create({
      data: { id: customerId, tenantId, name: "Synthetic account customer" },
    })
  })
  const startsAt = new Date("2026-01-01T00:00:00.000Z")
  bookId = (
    await createFinanceBook(db, { tenantId, actorUserId: userId, startsAt })
  ).id
  foreignBookId = (
    await createFinanceBook(db, {
      tenantId: foreignTenantId,
      actorUserId: userId,
      startsAt,
    })
  ).id
}, 90_000)

afterAll(async () => {
  for (const key of envNames) {
    if (previous[key] === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = previous[key]
  }
  if (!db) return
  try {
    const owned = await db.financeBook.findMany({
      where: { tenantId: { in: [tenantId, foreignTenantId] } },
      select: { id: true },
    })
    if (owned.length) {
      await db.financeAccount.deleteMany({
        where: { bookId: { in: owned.map((book) => book.id) } },
      })
      await db.financeBook.deleteMany({
        where: { id: { in: owned.map((book) => book.id) } },
      })
    }
    await db.tenant.deleteMany({
      where: {
        id: { in: [tenantId, foreignTenantId] },
        qaSourceDomain: sourceDomain,
      },
    })
    await db.user.deleteMany({
      where: { id: userId, email: `${marker}@example.test` },
    })
    expect(
      await db.tenant.count({
        where: { id: { in: [tenantId, foreignTenantId] } },
      }),
    ).toBe(0)
    expect(await db.user.count({ where: { id: userId } })).toBe(0)
  } finally {
    await db.$disconnect()
  }
}, 60_000)

const resultSchema = z.object({
  status: z.string(),
  data: z.unknown().optional(),
})

suite("WhatsApp finance reads through actual linked canonical callers", () => {
  test("owned recorded balances/supplier/customer/service reads retain Book, role, plan and source gates", async () => {
    const actor = { userId, tenantId, storeId, membershipId, sessionId }
    const link = await createAssistantWhatsAppLink(db, actor, phoneNumberId)
    expect(
      await claimAssistantWhatsAppLink(db, {
        code: link.code,
        phoneNumberId,
        senderId,
        messageId: `${marker}-claim`,
      }),
    ).toBe(true)
    const grant = await confirmAssistantWhatsAppLink(db, actor, {
      linkId: link.id,
      expectedRevision: 2,
      phoneNumberId,
    })
    const binding = await selectAssistantWhatsAppConversation(
      db,
      {
        kind: "linked_whatsapp",
        grantId: grant.id,
        grantGeneration: grant.generation,
        identityGeneration: 1,
        phoneNumberId,
        senderId,
      },
      conversationId,
    )
    const freshContext = async () =>
      (await createLinkedAssistantContext(
        db,
        binding,
        marker,
      )) as GeneralContext
    const ctx = await freshContext()
    expect(isLinkedAssistantIdentity(ctx.session)).toBe(true)
    expect(ctx.session.session).toBeNull()
    const answers: GeneralAnswer[] = []
    const tools = createGeneralTools(
      ctx,
      conversationId,
      () => {},
      (answer) => answers.push(answer),
    )
    const execute = async (name: string, input: Record<string, unknown>) => {
      const tool = tools[name]?.execute
      if (!tool) throw Error(`Expected eligible shared read ${name}`)
      return resultSchema.parse(
        await tool(input, { toolCallId: `${marker}-${name}`, messages: [] }),
      )
    }
    const canonical = await getFinanceAccountBalances(db, {
      tenantId,
      actorUserId: userId,
      bookId,
    })
    const balances = await execute("readMoneyAccountBalances", {})
    expect(balances.status).toBe("available")
    const page = z
      .object({
        bookId: z.string(),
        currencyCode: z.string(),
        accounts: z.array(
          z.object({ id: z.string(), balanceMinor: z.string() }),
        ),
      })
      .parse(balances.data)
    expect(page.bookId).toBe(bookId)
    expect(page.currencyCode).toBe("NGN")
    expect(page.accounts).toHaveLength(3)
    for (const account of page.accounts) {
      expect(account.balanceMinor).toBe(
        canonical.accounts.find((row) => row.id === account.id)?.balanceMinor ??
          "unavailable",
      )
      expect(account.balanceMinor).toBe("0")
    }
    const suppliers = await execute("readSuppliers", {})
    expect(suppliers).toMatchObject({
      status: "available",
      data: { bookId, data: [], nextCursor: null },
    })
    expect(await execute("readCustomerAccounts", { customerId })).toMatchObject(
      {
        status: "available",
        data: { customer: { id: customerId }, accounts: [], nextCursor: null },
      },
    )
    expect(await execute("readServices", {})).toMatchObject({
      status: "available",
      data: { items: [], totalCount: 0 },
    })
    const serviceAnswer = answers.find(
      (answer) => answer.title === "Service work queue",
    )
    expect(serviceAnswer?.value).toBe("0 jobs on this page")
    expect(serviceAnswer?.continuation).toMatchObject({
      version: 1,
      tool: "readServices",
      input: {},
      nextCursor: null,
    })
    expect(
      answers.every((answer) => generalAnswerSchema.safeParse(answer).success),
    ).toBe(true)
    const balanceAnswer = answers.find(
      (answer) => answer.title === "Account balances",
    )
    expect(balanceAnswer?.accounts?.rows).toHaveLength(3)
    if (!balanceAnswer) throw Error("Canonical balance answer missing")
    const reply = renderWhatsAppFinalReply([
      { type: "data-general-answer", data: balanceAnswer },
    ])
    expect(reply.kind).toBe("reply")
    expect(reply.chunks.join("\n")).toContain(
      "not checked against a bank balance or a cash count",
    )
    expect(reply.chunks.join("\n")).toContain("₦0.00")
    await expect(
      appRouter
        .createCaller({
          ...ctx,
          assistantReadCapabilityId: "finance.money_account_balances.read",
        })
        .finance.balances({ bookId: foreignBookId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(
      (await execute("readMoneyAccountBalances", { bookId: foreignBookId }))
        .status,
    ).not.toBe("available")

    for (const role of ["MANAGER", "CASHIER"] as const) {
      await db.membership.update({
        where: { id: membershipId },
        data: { role },
      })
      const restricted = await freshContext()
      const restrictedTools = createGeneralTools(
        restricted,
        conversationId,
        () => {},
        () => {},
      )
      expect(restrictedTools.readMoneyAccountBalances).toBeUndefined()
      expect(restrictedTools.readSuppliers).toBeUndefined()
      expect(restrictedTools.readCustomerAccounts).toBeUndefined()
      await expect(
        appRouter
          .createCaller({
            ...restricted,
            assistantReadCapabilityId: "finance.money_account_balances.read",
          })
          .finance.balances({ bookId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        appRouter
          .createCaller({
            ...restricted,
            assistantReadCapabilityId: "customers.accounts.read",
          })
          .customerLedger.accounts({ customerId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
    }
    await db.membership.update({
      where: { id: membershipId },
      data: { role: "OWNER" },
    })
    await db.tenant.update({
      where: { id: tenantId },
      data: { metadata: { retailOps: { subscription: { planId: "free" } } } },
    })
    const free = await freshContext()
    expect(
      createGeneralTools(
        free,
        conversationId,
        () => {},
        () => {},
      ).readMoneyAccountBalances,
    ).toBeUndefined()
    await expect(
      appRouter
        .createCaller({
          ...free,
          assistantReadCapabilityId: "finance.money_account_balances.read",
        })
        .finance.balances({ bookId }),
    ).rejects.toBeDefined()
    await db.tenant.update({
      where: { id: tenantId },
      data: { metadata: { retailOps: { subscription: { planId: "pro" } } } },
    })
    const pro = await freshContext()
    process.env.APP_ENV = "production"
    try {
      expect(
        createGeneralTools(
          pro,
          conversationId,
          () => {},
          () => {},
        ).readMoneyAccountBalances,
      ).toBeUndefined()
      await expect(
        appRouter
          .createCaller({
            ...pro,
            assistantReadCapabilityId: "finance.money_account_balances.read",
          })
          .finance.balances({ bookId }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      // Production refuses this local QA identity before the capability query;
      // the pure read-policy matrix separately verifies source-rollout FORBIDDEN.
    } finally {
      process.env.APP_ENV = "local"
    }
    expect(
      await db.financeJournalEntry.count({
        where: { bookId: { in: [bookId, foreignBookId] } },
      }),
    ).toBe(0)
    expect(await db.session.count({ where: { userId } })).toBe(1)
  }, 240_000)
})
