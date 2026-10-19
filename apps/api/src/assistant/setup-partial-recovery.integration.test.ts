import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { setupEntityKey } from "@ewatrade/assistant/setup/contracts"
import { createSetupAssistantTools } from "@ewatrade/assistant/setup/tools"
import {
  appendAssistantMessage,
  assistantBudgetScopeKey,
  readSetupDraft,
} from "@ewatrade/db/assistant"
import { customersRouter } from "../trpc/routers/customers"
import { setupAssistantRouter } from "../trpc/routers/setup-assistant"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { createAssistantChatRepository } from "./chat-repository"
import { requireSetupAssistantScope } from "./setup-context"

// Root alone selects the guarded QA database; importing this file never connects.
const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-setup-partial")
const names = {
  first: "Synthetic first setup customer",
  blocked: "Synthetic conflicting setup customer",
  corrected: "Synthetic corrected setup customer",
  skipped: "Synthetic skipped setup customer",
  independent: "Synthetic independently saved customer",
}
const conflictEmail = `${fixture.marker}-conflict@example.test`
const correctedEmail = `${fixture.marker}-corrected@example.test`
const keys = {
  first: setupEntityKey("customer", names.first),
  blocked: setupEntityKey("customer", names.blocked),
  skipped: setupEntityKey("customer", names.skipped),
}
const previousRehearsal = process.env.ASSISTANT_REHEARSAL_MODE
let setupId = ""
let draftId = ""
let independentCustomerId = ""
let sourceMessageId = ""

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  process.env.ASSISTANT_REHEARSAL_MODE = "true"
}, 90_000)

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      const { db, tenantId, storeId, userId, conversationId } = fixture
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
            if (!link) throw Error("Exact owned link required before cleanup")
            const bootstrap = `wa-linked_${link.id}`
            const chats = await tx.assistantConversation.findMany({
              where: { tenantId },
              include: {
                setupDraft: { include: { entities: true } },
                messages: true,
              },
            })
            const allowed = new Set([
              conversationId,
              bootstrap,
              ...(setupId ? [setupId] : []),
            ])
            for (const chat of chats) {
              expect(allowed.has(chat.id)).toBe(true)
              expect(chat).toMatchObject({
                tenantId,
                storeId,
                ownerUserId: userId,
                status: "ACTIVE",
                workflowContext: null,
                purpose: chat.id === setupId ? "SETUP" : "GENERAL",
              })
              if (chat.id !== setupId)
                expect(chat).toMatchObject({
                  setupDraft: null,
                  messages: [],
                  lastSequence: 0,
                })
              else {
                expect(chat.setupDraft?.id).toBe(draftId)
                for (const entity of chat.setupDraft?.entities ?? []) {
                  expect(Object.values(keys)).toContain(entity.key)
                  expect(entity.kind).toBe("CUSTOMER")
                  expect(entity.source).toMatchObject({
                    messageId: sourceMessageId,
                  })
                }
                for (const message of chat.messages) {
                  expect(["user", "assistant"]).toContain(message.role)
                  expect(Array.isArray(message.parts)).toBe(true)
                  if (!Array.isArray(message.parts))
                    throw Error("Unexpected saved message format")
                  for (const part of message.parts) {
                    expect(part).toMatchObject({ type: "text" })
                  }
                  if (message.role === "user")
                    expect(message.id).toBe(sourceMessageId)
                }
              }
            }
            const entities = draftId
              ? await tx.setupDraftEntity.findMany({ where: { draftId } })
              : []
            const customers = await tx.customer.findMany({
              where: { tenantId },
            })
            expect(customers.length).toBeLessThanOrEqual(3)
            for (const customer of customers) {
              if (customer.id === independentCustomerId) {
                expect(customer).toMatchObject({
                  name: names.independent,
                  email: conflictEmail,
                  phone: null,
                })
                continue
              }
              const entity = entities.find(
                (row) => row.committedRecordId === customer.id,
              )
              if (!entity)
                throw Error(
                  "Customer has no exact owned Setup receipt; retain attribution",
                )
              expect(entity.state).toBe("COMMITTED")
              if (entity.key === keys.first)
                expect(customer).toMatchObject({
                  name: names.first,
                  email: null,
                  phone: null,
                })
              else {
                expect(entity.key).toBe(keys.blocked)
                expect(customer).toMatchObject({
                  name: names.corrected,
                  email: correctedEmail,
                  phone: null,
                })
              }
            }
            const usage = await tx.assistantUsageEvent.findMany({
              where: { tenantId },
            })
            expect(usage).toHaveLength(1)
            for (const row of usage)
              expect(row).toMatchObject({
                actorUserId: userId,
                runId: null,
                attachmentId: null,
                provider: "ewatrade-rehearsal",
                model: "rehearsal-v1",
                requestClass: "opening",
                outcome: "fallback",
                stepCount: 0,
                inputTokens: null,
                cachedInputTokens: null,
                outputTokens: null,
                totalTokens: null,
                audioSeconds: null,
                imageCount: null,
              })
            const zeros = await Promise.all([
              tx.catalogItem.count({ where: { tenantId } }),
              tx.financeBook.count({ where: { tenantId } }),
              tx.commercialOrder.count({ where: { tenantId } }),
              tx.stockOperation.count({ where: { tenantId } }),
              tx.assistantActionProposal.count({ where: { tenantId } }),
              tx.assistantAttachment.count({ where: { tenantId } }),
              tx.assistantRun.count({ where: { conversation: { tenantId } } }),
              tx.customerLedgerAccount.count({ where: { tenantId } }),
              tx.customerLedgerEntry.count({ where: { tenantId } }),
              tx.businessActivityEvent.count({ where: { tenantId } }),
              tx.assistantBudget.count({
                where: { scopeKey: assistantBudgetScopeKey(tenantId, "SETUP") },
              }),
            ])
            for (const count of zeros) expect(count).toBe(0)
            expect(
              (
                await tx.assistantUsageEvent.deleteMany({
                  where: {
                    tenantId,
                    actorUserId: userId,
                    id: { in: usage.map((row) => row.id) },
                    provider: "ewatrade-rehearsal",
                    model: "rehearsal-v1",
                    requestClass: "opening",
                    outcome: "fallback",
                  },
                })
              ).count,
            ).toBe(1)
            expect(
              await tx.assistantUsageEvent.count({ where: { tenantId } }),
            ).toBe(0)
            await tx.customer.deleteMany({
              where: { tenantId, id: { in: customers.map((row) => row.id) } },
            })
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
      } catch (cause) {
        await db.$disconnect()
        throw new Error(
          `Ordinary Setup cleanup unverified; retained fixture ${tenantId}`,
          { cause },
        )
      }
    }
    await fixture.cleanup()
  } finally {
    if (previousRehearsal === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_REHEARSAL_MODE")
    else process.env.ASSISTANT_REHEARSAL_MODE = previousRehearsal
  }
}, 90_000)

suite("ordinary persisted Setup partial-success recovery", () => {
  test("a canonical duplicate refuses one customer; correction requires explicit reconfirm and preserves committed and skipped records through retry", async () => {
    const { db, tenantId, userId, sessionId } = fixture
    let externalCalls = 0
    const fetchTrap = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async () => {
          externalCalls += 1
          throw Error("External fetch forbidden in ordinary Setup fixture")
        },
        {
          preconnect: () => {
            externalCalls += 1
            throw Error(
              "External preconnect forbidden in ordinary Setup fixture",
            )
          },
        },
      ),
    )
    try {
      expect(process.env.ASSISTANT_REHEARSAL_MODE).toBe("true")
      const browser = await fixture.browserContext()
      expect(browser.session.session?.id).toBe(sessionId)
      expect(browser.session.user.id).toBe(userId)
      const scope = requireSetupAssistantScope(browser)
      const caller = setupAssistantRouter.createCaller(browser)
      setupId = (await caller.start()).conversationId
      const initial = await caller.state({ expectedConversationId: setupId })
      if (!initial.enabled || !initial.draft)
        throw Error("Canonical active Setup draft required")
      draftId = initial.draft.id
      const repo = createAssistantChatRepository(db, scope)
      const { context } = await repo.loadBusinessContext()
      sourceMessageId = `${fixture.marker}-source`
      const originalText = `Add ${names.first}; add ${names.blocked} at ${conflictEmail}; keep ${names.skipped} for later. No opening balances.`
      await appendAssistantMessage(db, {
        conversationId: setupId,
        message: {
          id: sourceMessageId,
          role: "user",
          parts: [{ type: "text", text: originalText }],
        },
      })
      const tools = createSetupAssistantTools({
        context,
        sourceMessageId,
        authorize: () => repo.isActorStillAuthorized(setupId),
        readDraft: () => repo.readDraftEntities(draftId),
        writeEntities: (entities) => repo.writeDraftEntities(draftId, entities),
        removeEntities: (selected) =>
          repo.removeDraftEntities(draftId, selected),
      })
      const stage = tools.setup_draft_upsert_customers.execute
      if (!stage) throw Error("Canonical customer draft tool required")
      expect(
        await stage(
          {
            customers: [
              { name: names.first, quote: names.first },
              {
                name: names.blocked,
                email: conflictEmail,
                quote: names.blocked,
              },
              { name: names.skipped, quote: names.skipped },
            ],
          },
          { toolCallId: "ordinary-customer-drafts", messages: [] },
        ),
      ).toMatchObject({ status: "success" })
      const review = await caller.state({ expectedConversationId: setupId })
      if (!review.enabled || !review.draft) throw Error("Saved review required")
      expect(review.draft.entities.map((row) => row.key)).toEqual([
        keys.first,
        keys.blocked,
        keys.skipped,
      ])
      for (const row of review.draft.entities)
        expect(row).toMatchObject({
          state: "PROPOSED",
          committedRecordId: null,
          source: { messageId: sourceMessageId },
          openQuestions: [],
        })
      await caller.setEntityState({
        conversationId: setupId,
        keys: [keys.first, keys.blocked],
        state: "CONFIRMED",
      })
      await caller.setEntityState({
        conversationId: setupId,
        keys: [keys.skipped],
        state: "SKIPPED",
      })
      // A legitimate independent app command claims this contact after draft review.
      const independent = await customersRouter
        .createCaller(browser)
        .create({ name: names.independent, email: conflictEmail })
      independentCustomerId = independent.id
      const skipped = (await readSetupDraft(db, draftId)).entities.find(
        (row) => row.key === keys.skipped,
      )
      if (!skipped) throw Error("Exact skipped record required")
      const commit = () => caller.commit({ conversationId: setupId })
      const firstResults: Array<
        Awaited<ReturnType<typeof commit>>["results"][number]
      > = []
      // Retain the production five-second per-request time budget; at most two records remain.
      let remaining = 2
      for (let attempt = 0; attempt < 3 && remaining; attempt++) {
        const result = await commit()
        expect(result.interrupted).toBe(false)
        firstResults.push(...result.results)
        remaining = result.remaining
      }
      expect(remaining).toBe(0)
      expect(firstResults.map((row) => [row.key, row.state])).toEqual([
        [keys.first, "COMMITTED"],
        [keys.blocked, "FAILED"],
      ])
      expect(
        firstResults.find((row) => row.key === keys.blocked),
      ).toMatchObject({
        errorCode: "DUPLICATE_CUSTOMER",
      })
      const partial = await readSetupDraft(db, draftId)
      const committed = partial.entities.find((row) => row.key === keys.first)
      const failed = partial.entities.find((row) => row.key === keys.blocked)
      if (!committed?.committedRecordId || !failed)
        throw Error("Actual partial outcomes required")
      expect(failed).toMatchObject({
        state: "FAILED",
        errorCode: "DUPLICATE_CUSTOMER",
        committedRecordId: null,
      })
      const firstCustomer = await db.customer.findUniqueOrThrow({
        where: { id: committed.committedRecordId },
      })
      expect(firstCustomer).toMatchObject({
        tenantId,
        name: names.first,
        phone: null,
        email: null,
      })
      expect(await db.customer.count({ where: { tenantId } })).toBe(2)
      expect(await commit()).toMatchObject({
        results: [],
        remaining: 0,
        interrupted: false,
      })
      expect(await readSetupDraft(db, draftId)).toEqual(partial)
      const partialApp = await caller.state({ expectedConversationId: setupId })
      if (!partialApp.enabled || !partialApp.draft)
        throw Error("Saved partial app state required")
      expect(
        partialApp.messages.some((message) =>
          JSON.stringify(message.parts).includes("1 record could not be added"),
        ),
      ).toBe(true)
      await caller.updateEntity({
        conversationId: setupId,
        key: keys.blocked,
        payload: {
          kind: "customer",
          name: names.corrected,
          email: correctedEmail,
        },
      })
      const corrected = await readSetupDraft(db, draftId)
      expect(
        corrected.entities.find((row) => row.key === keys.blocked),
      ).toMatchObject({
        state: "PROPOSED",
        errorCode: null,
        committedRecordId: null,
        payload: {
          kind: "customer",
          name: names.corrected,
          email: correctedEmail,
        },
      })
      expect(await commit()).toMatchObject({
        results: [],
        remaining: 0,
        interrupted: false,
      })
      expect(await db.customer.count({ where: { tenantId } })).toBe(2)
      expect(
        (await readSetupDraft(db, draftId)).entities.find(
          (row) => row.key === keys.first,
        ),
      ).toEqual(committed)
      await expect(
        caller.updateEntity({
          conversationId: setupId,
          key: keys.first,
          payload: {
            kind: "customer",
            name: "Cannot overwrite an added customer",
          },
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await caller.setEntityState({
        conversationId: setupId,
        keys: [keys.blocked],
        state: "CONFIRMED",
      })
      const result = await commit()
      expect(result).toMatchObject({
        interrupted: false,
        remaining: 0,
        results: [{ key: keys.blocked, state: "COMMITTED" }],
      })
      const final = await readSetupDraft(db, draftId)
      const receipt = final.entities.find((row) => row.key === keys.blocked)
      if (!receipt?.committedRecordId)
        throw Error("Corrected customer receipt required")
      expect(receipt).toMatchObject({ state: "COMMITTED", errorCode: null })
      expect(receipt.committedRecordId).not.toBe(committed.committedRecordId)
      expect(receipt.committedRecordId).not.toBe(independentCustomerId)
      expect(result.results[0]?.recordId).toBe(receipt.committedRecordId)
      expect(
        await db.customer.findUniqueOrThrow({
          where: { id: receipt.committedRecordId },
        }),
      ).toMatchObject({
        tenantId,
        name: names.corrected,
        email: correctedEmail,
      })
      expect(final.entities.find((row) => row.key === keys.first)).toEqual(
        committed,
      )
      expect(final.entities.find((row) => row.key === keys.skipped)).toEqual(
        skipped,
      )
      expect(
        await db.customer.findUniqueOrThrow({
          where: { id: firstCustomer.id },
        }),
      ).toEqual(firstCustomer)
      expect(
        await db.customer.findUniqueOrThrow({ where: { id: independent.id } }),
      ).toMatchObject(independent)
      expect(await db.customer.count({ where: { tenantId } })).toBe(3)
      expect(
        await db.customer.count({ where: { tenantId, name: names.skipped } }),
      ).toBe(0)
      const saved = await caller.state({ expectedConversationId: setupId })
      if (!saved.enabled || !saved.draft)
        throw Error("Saved final app state required")
      expect(saved.followUp.committed).toBe(2)
      expect(
        saved.messages.some((message) =>
          JSON.stringify(message.parts).includes("2 customers from this setup"),
        ),
      ).toBe(true)
      expect(await commit()).toMatchObject({
        results: [],
        remaining: 0,
        interrupted: false,
      })
      expect(await readSetupDraft(db, draftId)).toEqual(final)
      const replay = await caller.state({ expectedConversationId: setupId })
      if (!replay.enabled || !replay.draft)
        throw Error("Receipt replay state required")
      expect(replay.messages).toEqual(saved.messages)
      expect(replay.draft.entities).toEqual(saved.draft.entities)
      expect(await db.customer.count({ where: { tenantId } })).toBe(3)
    } finally {
      fetchTrap.mockRestore()
      expect(externalCalls).toBe(0)
    }
  }, 300_000)
})
