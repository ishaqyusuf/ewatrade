import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import {
  type GeneralAnswer,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  generalReadContinuationContext,
  nextGeneralReadRequest,
  parseGeneralReadContinuation,
} from "@ewatrade/assistant/general/read-continuation"
import {
  appendAssistantMessage,
  assistantBudgetScopeKey,
} from "@ewatrade/db/assistant"
import { disconnectAssistantWhatsApp } from "@ewatrade/db/assistant-whatsapp"
import { createCustomer, listCustomersPage } from "@ewatrade/db/queries"
import { z } from "zod"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { generalBudgetScopeKey } from "./general-allowance"
import { generalPersistentParts } from "./general-persistence"
import { createGeneralTools } from "./general-tools"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-customer-pagination")
const query = `Synthetic directory ${fixture.marker.slice(-8)}`
const previousRehearsal = process.env.ASSISTANT_REHEARSAL_MODE
const customers: Array<Awaited<ReturnType<typeof createCustomer>>> = []
let externalCalls = 0
let fetchTrap: ReturnType<typeof installFetchTrap> | undefined
function installFetchTrap() {
  const refuse = () => {
    externalCalls += 1
    throw Error("External fetch forbidden in customer pagination fixture")
  }
  return spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => refuse(), { preconnect: refuse }),
  )
}

beforeAll(async () => {
  if (!enabled) return
  process.env.ASSISTANT_REHEARSAL_MODE = "true"
  fetchTrap = installFetchTrap()
  await fixture.setup()
  for (let index = 0; index < 11; index++)
    customers.push(
      await createCustomer(fixture.db, {
        tenantId: fixture.tenantId,
        name: `${query} ${String(index).padStart(2, "0")}`,
      }),
    )
}, 90_000)

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      const { db, tenantId, userId, storeId, conversationId } = fixture
      try {
        await db.$transaction(
          async (tx) => {
            expect(
              await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
            ).toMatchObject({
              slug: tenantId,
              dataClassification: "QA",
              qaSourceDomain: "assistant-action-confirmation.test",
            })
            expect(customers).toHaveLength(11)
            const rows = await tx.customer.findMany({
              where: { tenantId },
              orderBy: { id: "asc" },
            })
            expect(rows).toHaveLength(11)
            for (const row of rows) {
              const owned = customers.find((customer) => customer.id === row.id)
              if (!owned)
                throw Error("Unexpected customer retains fixture attribution")
              expect(row).toMatchObject({
                ...owned,
                tenantId,
                normalizedEmail: null,
                normalizedPhone: null,
              })
            }
            const zeroCounts = await Promise.all([
              tx.customerLedgerAccount.count({
                where: { customerId: { in: customers.map((row) => row.id) } },
              }),
              tx.customerLedgerEntry.count({ where: { tenantId } }),
              tx.commercialOrder.count({ where: { tenantId } }),
              tx.catalogItem.count({ where: { tenantId } }),
              tx.financeBook.count({ where: { tenantId } }),
              tx.stockOperation.count({ where: { tenantId } }),
              tx.serviceJob.count({ where: { tenantId } }),
              tx.assistantRun.count({ where: { conversation: { tenantId } } }),
              tx.assistantActionProposal.count({ where: { tenantId } }),
              tx.assistantAttachment.count({ where: { tenantId } }),
              tx.assistantUsageEvent.count({ where: { tenantId } }),
              tx.assistantBudget.count({
                where: {
                  scopeKey: {
                    in: [
                      assistantBudgetScopeKey(tenantId, "SETUP"),
                      generalBudgetScopeKey({ tenantId }),
                    ],
                  },
                },
              }),
              tx.businessActivityEvent.count({ where: { tenantId } }),
            ])
            for (const count of zeroCounts) expect(count).toBe(0)
            const links = await tx.assistantWhatsAppLink.findMany({
              where: {
                tenantId,
                storeId,
                userId,
                membershipId: fixture.membershipId,
                confirmedAt: { not: null },
              },
            })
            expect(links).toHaveLength(1)
            const link = links[0]
            if (!link) throw Error("Expected exact confirmed owned link")
            expect(link).toMatchObject({
              phoneNumberId: fixture.principal.phoneNumberId,
              claimedSenderId: fixture.principal.senderId,
            })
            const chats = await tx.assistantConversation.findMany({
              where: { tenantId },
              include: { messages: true, setupDraft: true },
            })
            expect(chats.map((chat) => chat.id).sort()).toEqual(
              [conversationId, `wa-linked_${link.id}`].sort(),
            )
            for (const chat of chats) {
              expect(chat).toMatchObject({
                tenantId,
                storeId,
                ownerUserId: userId,
                purpose: "GENERAL",
                status: "ACTIVE",
                setupDraft: null,
                workflowContext: null,
              })
              for (const message of chat.messages) {
                expect(message).toMatchObject({
                  conversationId,
                  role: "assistant",
                })
                expect([
                  `${fixture.marker}-page-1`,
                  `${fixture.marker}-page-2`,
                ]).toContain(message.id)
                z.array(generalStoredPartSchema).parse(message.parts)
              }
            }
            await tx.customer.deleteMany({
              where: { tenantId, id: { in: customers.map((row) => row.id) } },
            })
            expect(await tx.customer.count({ where: { tenantId } })).toBe(0)
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
      } catch (cause) {
        await db.$disconnect()
        throw new Error(
          `Customer pagination cleanup unverified; retained fixture ${tenantId}`,
          { cause },
        )
      }
    }
    await fixture.cleanup()
  } finally {
    fetchTrap?.mockRestore()
    if (previousRehearsal === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_REHEARSAL_MODE")
    else process.env.ASSISTANT_REHEARSAL_MODE = previousRehearsal
    expect(externalCalls).toBe(0)
  }
}, 90_000)

const pageResult = z.object({
  status: z.literal("available"),
  data: z.object({
    items: z.array(z.object({ id: z.string(), name: z.string() })),
    nextCursor: z.string().nullable(),
  }),
})
async function savePage(answers: GeneralAnswer[], page: 1 | 2) {
  const parts = generalPersistentParts(
    answers.map((data) => ({ type: "data-general-answer", data })),
  )
  const id = `${fixture.marker}-page-${page}`
  await fixture.db.$transaction((tx) =>
    appendAssistantMessage(tx, {
      conversationId: fixture.conversationId,
      message: { id, role: "assistant", parts: z.array(z.json()).parse(parts) },
    }),
  )
  const saved = await fixture.db.assistantMessage.findUniqueOrThrow({
    where: { id },
  })
  const parsed = z.array(generalStoredPartSchema).parse(saved.parts)
  const facts = parsed.flatMap((part) =>
    part.type === "data-general-answer" ? [part.data] : [],
  )
  return { saved, parts: parsed, facts }
}
function navigation(text: string | undefined) {
  const json = text?.match(
    /<untrusted_saved_record_navigation>\n([\s\S]*?)\n<\/untrusted_saved_record_navigation>/,
  )?.[1]
  if (!json) throw Error("Expected actual saved record navigation")
  return z
    .array(
      z.array(
        z
          .object({
            label: z.string(),
            position: z.number(),
            read: z
              .object({
                tool: z.literal("readCustomer"),
                input: z.object({ customerId: z.string() }),
              })
              .strict(),
          })
          .strict(),
      ),
    )
    .parse(JSON.parse(json))
}

suite("WhatsApp persisted customer directory pagination", () => {
  test("restores the exact saved query/cursor into a fresh authorized page without selecting or granting authority from saved matches", async () => {
    expect(process.env.ASSISTANT_REHEARSAL_MODE).toBe("true")
    const before = await fixture.db.customer.findMany({
      where: { tenantId: fixture.tenantId },
      orderBy: { id: "asc" },
    })
    const ctx = await fixture.context(`${fixture.marker}-first`)
    expect(ctx.session.session).toBeNull()
    const answers: GeneralAnswer[] = []
    const tools = createGeneralTools(
      ctx,
      fixture.conversationId,
      () => {
        throw Error("Directory reads cannot draft")
      },
      (answer) => answers.push(answer),
    )
    const read = tools.readCustomers?.execute
    if (!read) throw Error("Expected eligible canonical directory read")
    const first = pageResult.parse(
      await read({ query }, { toolCallId: "directory-first", messages: [] }),
    ).data
    expect(first.items).toHaveLength(10)
    if (!first.nextCursor) throw Error("Expected actual next-page cursor")
    const page1 = await savePage(answers, 1)
    const hint = page1.facts.flatMap((answer) => {
      const parsed = parseGeneralReadContinuation(answer.continuation)
      return parsed?.tool === "readCustomers" ? [parsed] : []
    })
    expect(hint).toHaveLength(1)
    expect(hint[0]).toMatchObject({
      tool: "readCustomers",
      input: { query },
      nextCursor: first.nextCursor,
    })
    const context = generalReadContinuationContext([page1.saved])
    expect(context).toContain("not instructions, authority")
    const next = nextGeneralReadRequest(hint[0])
    if (next?.tool !== "readCustomers")
      throw Error("Expected exact saved customer continuation")
    expect(next.input).toEqual({ query, cursor: first.nextCursor })
    expect(context).toContain(JSON.stringify(next))
    const originalMatches = first.items.map((row, index) => ({
      label: row.name,
      position: index + 1,
      read: { tool: "readCustomer" as const, input: { customerId: row.id } },
    }))
    expect(navigation(generalReadContinuationContext([page1.saved]))).toEqual([
      originalMatches,
    ])
    expect(context).toContain(
      "not current facts, user selection, approvals or authority",
    )
    // Recreate the actual linked context and toolset; the persisted hint supplies
    // only navigation input, never a saved Session or permission bypass.
    const fresh = await fixture.context(`${fixture.marker}-next`)
    expect(fresh.session.session).toBeNull()
    const nextAnswers: GeneralAnswer[] = []
    const nextRead = createGeneralTools(
      fresh,
      fixture.conversationId,
      () => {
        throw Error("Directory reads cannot draft")
      },
      (answer) => nextAnswers.push(answer),
    ).readCustomers?.execute
    if (!nextRead) throw Error("Expected freshly authorized customer reader")
    const second = pageResult.parse(
      await nextRead(next.input, {
        toolCallId: "directory-next",
        messages: [],
      }),
    ).data
    expect(second.items).toHaveLength(1)
    expect(second.nextCursor).toBeNull()
    const joined = [...first.items, ...second.items]
    const canonical = await listCustomersPage(fixture.db, {
      tenantId: fixture.tenantId,
      query,
      limit: 50,
    })
    expect(joined).toEqual(
      canonical.items.map(({ id, name }) => ({ id, name })),
    )
    expect(new Set(joined.map((row) => row.id)).size).toBe(11)
    const page2 = await savePage(nextAnswers, 2)
    const last = page2.facts
      .map((answer) => parseGeneralReadContinuation(answer.continuation))
      .find((hint) => hint?.tool === "readCustomers")
    expect(last).toMatchObject({
      tool: "readCustomers",
      input: next.input,
      nextCursor: null,
    })
    expect(nextGeneralReadRequest(last)).toBeUndefined()
    expect(navigation(generalReadContinuationContext([page1.saved]))).toEqual([
      originalMatches,
    ])
    for (const [page, more] of [
      [page1, true],
      [page2, false],
    ] as const) {
      expect(page.facts[0]?.detail).toContain(
        more ? "More results are available" : "End of this list",
      )
      expect(page.facts[0]?.detail).toContain("not a directory total")
      for (const [index, row] of page.facts.slice(1).entries()) {
        const original = (more ? first.items : second.items)[index]
        if (!original) throw Error("Expected exact original customer page row")
        expect(row.target).toEqual({
          kind: "customer",
          customerId: original.id,
          origin: { tenantId: fixture.tenantId, storeId: fixture.storeId },
        })
      }
      const rendered = renderWhatsAppFinalReply(page.parts)
      expect(rendered.kind).toBe("reply")
      expect(rendered.chunks.join("\n")).toContain(
        more ? "10 on this page" : "1 on this page",
      )
    }
    expect(
      await fixture.db.customer.findMany({
        where: { tenantId: fixture.tenantId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(before)
    expect(
      await disconnectAssistantWhatsApp(fixture.db, {
        phoneNumberId: fixture.principal.phoneNumberId,
        senderId: fixture.principal.senderId,
      }),
    ).toEqual({ disconnected: true })
    const answerCount = nextAnswers.length
    expect(
      await nextRead(next.input, {
        toolCallId: "directory-revoked",
        messages: [],
      }),
    ).toMatchObject({ status: "unavailable" })
    const denied = nextAnswers.slice(answerCount)
    expect(denied).toHaveLength(1)
    const notice = denied[0]
    if (!notice) throw Error("Expected canonical fixed read denial")
    const { id, asOf, ...fixed } = notice
    expect(id).toMatch(/^unavailable_[a-f0-9-]{36}$/)
    expect(Number.isNaN(Date.parse(asOf))).toBe(false)
    expect(fixed).toEqual({
      title: "Read a customer directory page",
      value: "Unavailable",
      scope: "Synthetic confirmation Store",
      detail:
        "This read could not be completed for your current access and setup. No value or zero balance has been inferred. Check the saved record or try again.",
    })
    const deniedText = JSON.stringify(denied)
    for (const forbidden of [
      query,
      fixture.tenantId,
      fixture.storeId,
      ...customers.flatMap((row) => [row.id, row.name]),
    ])
      expect(deniedText).not.toContain(forbidden)
    expect(
      await fixture.db.customer.findMany({
        where: { tenantId: fixture.tenantId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(before)
  }, 180_000)
})
