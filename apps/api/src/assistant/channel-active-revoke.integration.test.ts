import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { readAssistantWhatsAppConfig } from "@ewatrade/communications"
import {
  type WhatsAppInboxLease,
  claimAssistantWhatsAppInbox,
  disconnectAssistantWhatsApp,
  nextAssistantWhatsAppInbox,
  processAssistantWhatsAppControl,
  recoverAssistantWhatsAppInboxRun,
  retryAssistantWhatsAppInbox,
  settleAssistantWhatsAppInbox,
} from "@ewatrade/db/assistant-whatsapp"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { createLinkedAssistantContext } from "./channel-principal"
import { prepareAssistantWhatsAppReview } from "./channel-review-staging"
import {
  type ChannelTurnDependencies,
  processAssistantChannelTurn,
} from "./channel-turn"
import { generalBudgetScopeKey } from "./general-allowance"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"
import { createGeneralAssistantTurn } from "./general-turn"
import * as modelResolution from "./model-resolution"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-active-revoke")
let workerSettled = true
beforeAll(() => fixture.setup(), 90_000)

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve: () => resolve() }
}
async function bounded<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = 90_000,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

afterAll(async () => {
  if (enabled && fixture.db) {
    if (!workerSettled) {
      await fixture.db.$disconnect()
      throw new Error(
        `Active revoke worker remains unsettled; retained all fixture attribution ${fixture.tenantId}`,
      )
    }
    const { db, tenantId, userId } = fixture
    try {
      await db.$transaction(
        async (tx) => {
          const tenant = await tx.tenant.findUnique({ where: { id: tenantId } })
          if (tenant) {
            expect(tenant).toMatchObject({
              slug: tenantId,
              dataClassification: "QA",
              qaSourceDomain: "assistant-action-confirmation.test",
            })
            for (const run of await tx.assistantRun.findMany({
              where: { conversation: { tenantId } },
            }))
              expect(run).toMatchObject({
                actorUserId: userId,
                conversationId: fixture.conversationId,
              })
            // No domain writes are expected; unexpected effects retain their attribution.
            expect(await tx.customer.count({ where: { tenantId } })).toBe(0)
            expect(await tx.catalogItem.count({ where: { tenantId } })).toBe(0)
            expect(await tx.financeBook.count({ where: { tenantId } })).toBe(0)
            expect(
              await tx.commercialOrder.count({ where: { tenantId } }),
            ).toBe(0)
            expect(
              await tx.assistantActionProposal.count({ where: { tenantId } }),
            ).toBe(0)
            expect(
              await tx.assistantAttachment.count({ where: { tenantId } }),
            ).toBe(0)
          }
          await tx.assistantBudget.deleteMany({
            where: { scopeKey: generalBudgetScopeKey({ tenantId }) },
          })
        },
        { maxWait: 10_000, timeout: 30_000 },
      )
    } catch (error) {
      await db.$disconnect()
      throw new Error(
        `Active revoke cleanup unverified; retained fixture ${tenantId}`,
        { cause: error },
      )
    }
  }
  await fixture.cleanup()
}, 90_000)

suite("active WhatsApp run revocation barrier", () => {
  test("Disconnect after canonical admission fences stale tools and persisted reply while preserving known usage without rerun", async () => {
    const { db, tenantId, userId } = fixture
    const reachedModel = deferred()
    const releaseModel = deferred()
    const sensitiveMarker = `Private admitted result ${fixture.marker}`
    let modelCalls = 0
    let capturedContext: GeneralContext | undefined
    let capturedLease: WhatsAppInboxLease | undefined
    const model = new MockLanguageModelV3({
      provider: "ewatrade-rehearsal",
      modelId: "active-revoke-stub-v1",
      doStream: async () => {
        modelCalls += 1
        if (modelCalls !== 1)
          throw Error("Revoked run must never rerun its model")
        reachedModel.resolve()
        await releaseModel.promise
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start" as const, id: "fixed-result" },
              {
                type: "text-delta" as const,
                id: "fixed-result",
                delta: sensitiveMarker,
              },
              { type: "text-end" as const, id: "fixed-result" },
              {
                type: "finish" as const,
                finishReason: { unified: "stop" as const, raw: "stop" },
                usage: {
                  inputTokens: {
                    total: 5,
                    noCache: 5,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  outputTokens: { total: 3, text: 3, reasoning: 0 },
                },
              },
            ],
            chunkDelayInMs: 0,
          }),
        }
      },
    })
    // Only the provider model boundary is replaced. Run admission, budgets, tools and persistence are real.
    const modelSpy = spyOn(
      modelResolution,
      "resolveGeneralAssistantModel",
    ).mockImplementation(async () => ({
      model,
      provider: "ewatrade-rehearsal",
      modelId: "active-revoke-stub-v1",
      providerOptions: {},
      rehearsal: true,
    }))
    const deps: ChannelTurnDependencies = {
      enabled: () => Boolean(readAssistantWhatsAppConfig()),
      control: (id) => processAssistantWhatsAppControl(db, id, [userId]),
      claim: (id) => claimAssistantWhatsAppInbox(db, id, [userId]),
      recover: (lease) => recoverAssistantWhatsAppInboxRun(db, lease),
      context: async (principal, requestId, lease) => {
        const ctx = await createLinkedAssistantContext(
          db,
          principal,
          requestId,
          lease,
        )
        capturedContext = ctx
        capturedLease = lease
        return ctx
      },
      createTurn: createGeneralAssistantTurn,
      settle: (lease, errorCode) =>
        settleAssistantWhatsAppInbox(db, lease, {
          permittedUserIds: [userId],
          errorCode,
        }),
      retry: (lease) => retryAssistantWhatsAppInbox(db, lease),
      next: (bindingId) => nextAssistantWhatsAppInbox(db, bindingId),
    }
    let pendingWorker:
      | Promise<Awaited<ReturnType<typeof processAssistantChannelTurn>>>
      | undefined
    try {
      const inbox = await fixture.incoming(
        "Provide the approved active-run fault result.",
      )
      workerSettled = false
      pendingWorker = processAssistantChannelTurn(inbox.id, deps).finally(
        () => {
          workerSettled = true
        },
      )
      const reached = await bounded(
        Promise.race([
          reachedModel.promise.then(() => true),
          pendingWorker.then(() => false),
        ]),
        "Actual model admission barrier",
      )
      expect(reached).toBe(true)
      if (!capturedContext || !capturedLease)
        throw Error("Actual admitted linked context and lease missing")
      const oldContext = capturedContext
      const oldLease = capturedLease
      const answers: GeneralAnswer[] = []
      const staleTools = createGeneralTools(
        oldContext,
        fixture.conversationId,
        () => {
          throw Error("Revoked tool cannot draft")
        },
        (answer) => answers.push(answer),
      )
      const [activeRun, admittedBudget, activeInbox] = await Promise.all([
        db.assistantRun.findFirstOrThrow({
          where: { requestId: inbox.requestId, actorUserId: userId },
        }),
        db.assistantBudget.findUniqueOrThrow({
          where: { scopeKey: generalBudgetScopeKey({ tenantId }) },
        }),
        db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: inbox.id },
        }),
      ])
      expect(activeRun).toMatchObject({
        status: "RUNNING",
        assistantMessageId: null,
        conversationId: fixture.conversationId,
      })
      expect(admittedBudget.requests).toBe(1)
      expect(activeInbox).toMatchObject({
        state: "PROCESSING",
        leaseOwner: oldLease.owner,
        leaseGeneration: oldLease.generation,
      })
      expect(activeInbox.executionAuthorityDigest).toMatch(/^[a-f0-9]{64}$/)
      expect(modelCalls).toBe(1)

      const principal = fixture.principal
      expect(
        await disconnectAssistantWhatsApp(db, {
          phoneNumberId: principal.phoneNumberId,
          senderId: principal.senderId,
        }),
      ).toEqual({ disconnected: true })
      // Release immediately after durable revoke, keeping the canonical turn's existing deadline unchanged.
      releaseModel.resolve()
      const result = await bounded(pendingWorker, "Revoked worker finalization")
      expect(["busy", "cancelled"]).toContain(result.status)
      const cancelled = await db.assistantWhatsAppInbox.findUniqueOrThrow({
        where: { id: inbox.id },
      })
      expect(cancelled).toMatchObject({
        state: "CANCELLED",
        errorCode: "CHANNEL_DISCONNECTED",
        content: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
      })
      expect(cancelled.completedAt).not.toBeNull()
      expect(cancelled.executionAuthorityDigest).toBe(
        activeInbox.executionAuthorityDigest,
      )
      const identity = await db.assistantWhatsAppIdentity.findFirstOrThrow({
        where: { userId },
      })
      expect(identity.revokedAt).not.toBeNull()
      expect(identity.activeBindingId).toBeNull()
      expect(identity.generation).toBeGreaterThan(principal.identityGeneration)
      const grant = await db.assistantWhatsAppGrant.findUniqueOrThrow({
        where: { id: principal.grantId },
      })
      expect(grant.revokedAt).not.toBeNull()
      expect(grant.generation).toBeGreaterThan(principal.grantGeneration)

      const read = staleTools.searchRecords?.execute
      const draft = staleTools.draftAction?.execute
      if (!read || !draft)
        throw Error("Expected actual tools from the pre-revocation context")
      expect(
        await read(
          { query: "Synthetic" },
          { toolCallId: "stale-read", messages: [] },
        ),
      ).toMatchObject({ status: "unavailable" })
      expect(
        await draft(
          { action: "customer_create", name: "Must never be created" },
          { toolCallId: "stale-draft", messages: [] },
        ),
      ).toMatchObject({ status: "unavailable" })
      expect(answers.every((answer) => answer.value === "Unavailable")).toBe(
        true,
      )
      expect(JSON.stringify(answers)).not.toContain(sensitiveMarker)
      await expect(
        fixture.context(`${fixture.marker}-revoked-context`, oldLease),
      ).rejects.toThrow()
      await expect(
        recoverAssistantWhatsAppInboxRun(db, oldLease),
      ).rejects.toThrow()

      // Disconnect revokes the channel, not the actor's app transcript or already-known model usage.
      const savedRun = await db.assistantRun.findUniqueOrThrow({
        where: { id: activeRun.id },
        include: { assistantMessage: true, usageEvents: true },
      })
      expect(savedRun.status).toBe("COMPLETED")
      expect(JSON.stringify(savedRun.assistantMessage?.parts)).toContain(
        sensitiveMarker,
      )
      expect(savedRun.usageEvents).toHaveLength(1)
      expect(savedRun.usageEvents[0]).toMatchObject({
        tenantId,
        actorUserId: userId,
        inputTokens: 5,
        outputTokens: 3,
        totalTokens: 8,
        outcome: "success",
        stepCount: 1,
      })
      expect(await prepareAssistantWhatsAppReview(db, oldLease)).toBeUndefined()
      expect(
        await settleAssistantWhatsAppInbox(db, oldLease, {
          permittedUserIds: [userId],
        }),
      ).toBeNull()
      expect(
        await db.assistantWhatsAppOutbox.count({
          where: { inboxId: inbox.id },
        }),
      ).toBe(0)
      expect(
        await db.assistantWhatsAppAttempt.count({
          where: { outbox: { inbox: { bindingId: principal.bindingId } } },
        }),
      ).toBe(0)
      expect(await processAssistantChannelTurn(inbox.id, deps)).toEqual({
        status: "idle",
      })
      const budget = await db.assistantBudget.findUniqueOrThrow({
        where: { scopeKey: generalBudgetScopeKey({ tenantId }) },
      })
      expect(budget).toMatchObject({ requests: 1, tokens: 8 })
      expect(
        await db.assistantRun.count({
          where: { conversationId: fixture.conversationId },
        }),
      ).toBe(1)
      expect(modelCalls).toBe(1)
      expect(
        await db.assistantActionProposal.count({ where: { tenantId } }),
      ).toBe(0)
      expect(await db.customer.count({ where: { tenantId } })).toBe(0)
      expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(0)
      expect(await db.financeBook.count({ where: { tenantId } })).toBe(0)
    } finally {
      releaseModel.resolve()
      try {
        if (pendingWorker)
          await bounded(pendingWorker, "Barrier cleanup worker drain")
      } finally {
        modelSpy.mockRestore()
      }
    }
  }, 240_000)
})
