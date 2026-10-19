import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { ProductFormSnapshot } from "@ewatrade/assistant/product/contracts"
import { readAssistantWhatsAppConfig } from "@ewatrade/communications"
import {
  assistantBudgetScopeKey,
  createProductConversation,
  createSetupConversation,
} from "@ewatrade/db/assistant"
import {
  claimAssistantWhatsAppInbox,
  nextAssistantWhatsAppInbox,
  processAssistantWhatsAppControl,
  recoverAssistantWhatsAppInboxRun,
  retryAssistantWhatsAppInbox,
  selectAssistantWhatsAppScope,
  settleAssistantWhatsAppInbox,
  settleAssistantWhatsAppNotice,
} from "@ewatrade/db/assistant-whatsapp"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import {
  createLinkedAssistantContext,
  isLinkedAssistantIdentity,
} from "./channel-principal"
import {
  type ChannelTurnDependencies,
  processAssistantChannelTurn,
} from "./channel-turn"
import { createChannelWorkflowTurn } from "./channel-workflow-turn"
import { generalBudgetScopeKey } from "./general-allowance"
import type { GeneralContext } from "./general-context"
import { createGeneralAssistantTurn } from "./general-turn"
import {
  type GeneralTurnInput,
  generalTurnInputSchema,
} from "./general-turn-contract"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-purpose")
const flags = {
  ASSISTANT_REHEARSAL_MODE: "true",
  ASSISTANT_WHATSAPP_SETUP_ENABLED: "true",
  ASSISTANT_WHATSAPP_PRODUCT_ENABLED: "true",
  ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED: "false",
}
const previous = new Map(
  Object.keys(flags).map((name) => [name, process.env[name]]),
)
const suffix = fixture.marker.slice(-6)
const generalName = `Synthetic general customer ${suffix}`
const setupName = `Synthetic setup eggs ${suffix}`
const productName = `Synthetic product rice ${suffix}`
const setupText = `${setupName}, 150, 3 pieces`
const productText = `${productName}, 250, 2 pieces`
let setupId = ""
let productId = ""
let setupMessageId = ""
let productMessageId = ""
const contexts = new Map<
  string,
  { ctx: GeneralContext; input: GeneralTurnInput }
>()
let rejectedAdmissions = 0
let generalCalls = 0
let workflowCalls = 0

const generalKey = generalBudgetScopeKey({ tenantId: fixture.tenantId })
const setupKey = assistantBudgetScopeKey(fixture.tenantId, "SETUP")
const productKey = assistantBudgetScopeKey(fixture.tenantId, "PRODUCT_CREATE")

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  Object.assign(process.env, flags)
  const scope = {
    tenantId: fixture.tenantId,
    storeId: fixture.storeId,
    userId: fixture.userId,
  }
  setupId = (
    await createSetupConversation(fixture.db, scope, [], { status: "ACTIVE" })
  ).id
  const snapshot: ProductFormSnapshot = {
    form: {
      kind: "product",
      name: "",
      description: "",
      unitName: "Piece",
      price: "",
      openingStockQuantity: "",
      usage: "FOR_SALE",
    },
    storeId: fixture.storeId,
    category: "",
    illustrationId: null,
    photoAssetIds: [],
    sku: "",
    barcode: "",
    showAdvanced: false,
    showUnits: false,
    showDescription: false,
    showOpeningStock: false,
    selectedHelperKey: null,
    canonicalTransactionScale: 2,
    optionGroups: [],
    variantDrafts: {},
    additionalUnits: [],
  }
  productId = (
    await createProductConversation(fixture.db, scope, {
      id: `product_${randomUUID()}`,
      snapshot,
      seed: null,
      opening: "Describe the one product to prepare its saved draft.",
    })
  ).id
}, 90_000)

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      const { db, tenantId, userId, storeId } = fixture
      try {
        await db.$transaction(
          async (tx) => {
            const tenant = await tx.tenant.findUnique({
              where: { id: tenantId },
            })
            if (tenant) {
              expect(tenant).toMatchObject({
                slug: tenantId,
                dataClassification: "QA",
                qaSourceDomain: "assistant-action-confirmation.test",
              })
              const purposes = new Map([
                [fixture.conversationId, "GENERAL"],
                [setupId, "SETUP"],
                [productId, "PRODUCT_CREATE"],
              ])
              // Canonical link confirmation creates one empty chat before the fixture selects its named chat.
              const links = await tx.assistantWhatsAppLink.findMany({
                where: {
                  tenantId,
                  storeId,
                  userId,
                  membershipId: fixture.membershipId,
                  confirmedAt: { not: null },
                },
                select: {
                  id: true,
                  phoneNumberId: true,
                  claimedSenderId: true,
                },
              })
              expect(links).toHaveLength(1)
              const link = links[0]
              if (!link) throw Error("Exact confirmed fixture link is required")
              expect(link).toMatchObject({
                phoneNumberId: fixture.principal.phoneNumberId,
                claimedSenderId: fixture.principal.senderId,
              })
              const bootstrapId = `wa-linked_${link.id}`
              for (const chat of await tx.assistantConversation.findMany({
                where: { tenantId },
                include: {
                  setupDraft: true,
                  _count: {
                    select: { messages: true, runs: true, proposals: true },
                  },
                },
              })) {
                if (chat.id === bootstrapId) {
                  expect(chat).toMatchObject({
                    tenantId,
                    storeId,
                    ownerUserId: userId,
                    purpose: "GENERAL",
                    status: "ACTIVE",
                    lastSequence: 0,
                    workflowContext: null,
                    setupDraft: null,
                    _count: { messages: 0, runs: 0, proposals: 0 },
                  })
                  continue
                }
                expect(chat).toMatchObject({
                  tenantId,
                  storeId,
                  ownerUserId: userId,
                  purpose: purposes.get(chat.id),
                })
                expect(purposes.has(chat.id)).toBe(true)
              }
              for (const run of await tx.assistantRun.findMany({
                where: { conversation: { tenantId } },
              })) {
                expect(run.actorUserId).toBe(userId)
                expect(purposes.has(run.conversationId)).toBe(true)
              }
              for (const proposal of await tx.assistantActionProposal.findMany({
                where: { tenantId },
              }))
                expect(proposal).toMatchObject({
                  actorUserId: userId,
                  storeId,
                  conversationId: fixture.conversationId,
                  action: "customer_create",
                  status: "PENDING",
                  payload: { action: "customer_create", name: generalName },
                })
              for (const draft of await tx.setupDraft.findMany({
                where: { tenantId },
                include: { entities: true },
              })) {
                expect([setupId, productId]).toContain(draft.conversationId)
                expect(draft.storeId).toBe(storeId)
                for (const entity of draft.entities) {
                  expect(entity.committedRecordId).toBeNull()
                  expect(["PROPOSED", "NEEDS_INPUT"]).toContain(entity.state)
                  const messageId =
                    draft.conversationId === setupId
                      ? setupMessageId
                      : productMessageId
                  expect(entity.source).toMatchObject({ messageId })
                  expect(
                    await tx.assistantMessage.count({
                      where: {
                        id: messageId,
                        conversationId: draft.conversationId,
                      },
                    }),
                  ).toBe(1)
                }
              }
              // Any unexpected domain effect keeps the complete synthetic attribution.
              expect(await tx.customer.count({ where: { tenantId } })).toBe(0)
              expect(await tx.catalogItem.count({ where: { tenantId } })).toBe(
                0,
              )
              expect(
                await tx.commercialOrder.count({ where: { tenantId } }),
              ).toBe(0)
              expect(await tx.financeBook.count({ where: { tenantId } })).toBe(
                0,
              )
              expect(
                await tx.stockOperation.count({ where: { tenantId } }),
              ).toBe(0)
              expect(
                await tx.assistantAttachment.count({ where: { tenantId } }),
              ).toBe(0)
            }
            expect(
              await tx.assistantBudget.count({
                where: { scopeKey: productKey },
              }),
            ).toBe(0)
            await tx.assistantBudget.deleteMany({
              where: { scopeKey: { in: [generalKey, setupKey] } },
            })
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
      } catch (error) {
        await db.$disconnect()
        throw new Error(
          `Purpose cleanup unverified; retained fixture ${tenantId}`,
          {
            cause: error,
          },
        )
      }
    }
    await fixture.cleanup()
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, name)
      else process.env[name] = value
    }
  }
}, 90_000)

async function accounting() {
  const budgets = await fixture.db.assistantBudget.findMany({
    where: { scopeKey: { in: [generalKey, setupKey, productKey] } },
    select: { scopeKey: true, requests: true, tokens: true },
    orderBy: { scopeKey: "asc" },
  })
  const runs = await fixture.db.assistantRun.count({
    where: { conversation: { tenantId: fixture.tenantId } },
  })
  return { budgets, runs }
}

async function rejectedWithoutAdmission(
  work: () => Promise<unknown>,
  code?: string,
) {
  const before = await accounting()
  if (code) await expect(work()).rejects.toMatchObject({ code })
  else await expect(work()).rejects.toThrow()
  expect(await accounting()).toEqual(before)
  rejectedAdmissions += 1
}

function staleInput(input: GeneralTurnInput): GeneralTurnInput {
  return {
    ...input,
    requestId: randomUUID(),
    message: { ...input.message, id: randomUUID() },
  }
}

async function select(
  conversationId: string,
  purpose: "SETUP" | "PRODUCT_CREATE",
) {
  const identity = await fixture.db.assistantWhatsAppIdentity.findFirstOrThrow({
    where: { userId: fixture.userId },
  })
  const grant = await fixture.db.assistantWhatsAppGrant.findUniqueOrThrow({
    where: { id: fixture.principal.grantId },
  })
  // The original persisted app Session authorizes selection, never a fabricated linked Session.
  const selected = await selectAssistantWhatsAppScope(
    fixture.db,
    { userId: fixture.userId, sessionId: fixture.sessionId },
    identity.phoneNumberId,
    {
      identityId: identity.id,
      grantId: grant.id,
      storeId: fixture.storeId,
      requestId: randomUUID(),
      expectedIdentityGeneration: identity.generation,
      expectedSelectionGeneration: identity.selectionGeneration,
      expectedGrantGeneration: grant.generation,
      action: { kind: "resume", conversationId, purpose },
    },
  )
  expect(selected).toMatchObject({ state: "selected", conversationId, purpose })
}

suite("actual linked three-purpose draft and allowance isolation", () => {
  test("GENERAL stays separate while Setup and Product share only their canonical allowance; stale and wrong-purpose admissions spend nothing", async () => {
    const { db, userId, tenantId } = fixture
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
        expect(isLinkedAssistantIdentity(ctx.session)).toBe(true)
        if (!isLinkedAssistantIdentity(ctx.session))
          throw Error("Expected linked authority")
        expect(ctx.session.session).toBeNull()
        return ctx
      },
      createTurn: async (ctx, rawInput, signal) => {
        const input = generalTurnInputSchema.parse(rawInput)
        generalCalls += 1
        contexts.set("GENERAL", { ctx, input })
        await rejectedWithoutAdmission(
          () => createChannelWorkflowTurn(ctx, input, signal),
          "WORKFLOW_NOT_READY",
        )
        return createGeneralAssistantTurn(ctx, input, signal)
      },
      createWorkflowTurn: async (ctx, rawInput, signal) => {
        const input = generalTurnInputSchema.parse(rawInput)
        workflowCalls += 1
        if (!isLinkedAssistantIdentity(ctx.session))
          throw Error("Expected linked authority")
        const purpose = ctx.session.purpose
        contexts.set(purpose, { ctx, input })
        await rejectedWithoutAdmission(
          () => createGeneralAssistantTurn(ctx, input, signal),
          "FORBIDDEN",
        )
        await rejectedWithoutAdmission(
          () =>
            createChannelWorkflowTurn(
              ctx,
              {
                ...input,
                conversationId:
                  purpose === "SETUP" ? fixture.conversationId : setupId,
              },
              signal,
            ),
          "CONVERSATION_NOT_FOUND",
        )
        const stale = contexts.get(purpose === "SETUP" ? "GENERAL" : "SETUP")
        if (!stale) throw Error("Expected previous real linked context")
        await rejectedWithoutAdmission(() =>
          purpose === "SETUP"
            ? createGeneralAssistantTurn(
                stale.ctx,
                staleInput(stale.input),
                signal,
              )
            : createChannelWorkflowTurn(
                stale.ctx,
                staleInput(stale.input),
                signal,
              ),
        )
        return createChannelWorkflowTurn(ctx, input, signal)
      },
      notice: (principal, lease, code) =>
        settleAssistantWhatsAppNotice(db, { principal, lease, code }),
      settle: (lease, errorCode) =>
        settleAssistantWhatsAppInbox(db, lease, {
          permittedUserIds: [userId],
          errorCode,
        }),
      retry: (lease) => retryAssistantWhatsAppInbox(db, lease),
      next: (bindingId) => nextAssistantWhatsAppInbox(db, bindingId),
    }
    expect(await accounting()).toEqual({ budgets: [], runs: 0 })
    const general = await fixture.incoming(`add customer ${generalName}`)
    expect(await processAssistantChannelTurn(general.id, deps)).toMatchObject({
      status: "completed",
    })
    expect(await accounting()).toEqual({
      budgets: [{ scopeKey: generalKey, requests: 1, tokens: 0 }],
      runs: 1,
    })
    const proposal = await db.assistantActionProposal.findFirstOrThrow({
      where: { tenantId },
    })
    expect(proposal).toMatchObject({
      conversationId: fixture.conversationId,
      actorUserId: userId,
      status: "PENDING",
      action: "customer_create",
      payload: { name: generalName },
    })

    await select(setupId, "SETUP")
    const setup = await fixture.incoming(setupText)
    setupMessageId = setup.userMessageId
    expect(await processAssistantChannelTurn(setup.id, deps)).toMatchObject({
      status: "completed",
    })
    expect((await accounting()).runs).toBe(2)
    expect(
      await db.assistantBudget.findUnique({ where: { scopeKey: generalKey } }),
    ).toMatchObject({ requests: 1, tokens: 0 })
    expect(
      await db.assistantBudget.findUnique({ where: { scopeKey: setupKey } }),
    ).toMatchObject({ requests: 1, tokens: 0 })
    const setupReply = (
      await db.assistantWhatsAppOutbox.findMany({
        where: { inboxId: setup.id },
        orderBy: { chunkIndex: "asc" },
      })
    )
      .map((row) => row.content ?? "")
      .join("\n")
    expect(setupReply).toContain(setupId)
    expect(setupReply).toContain(setupName)
    expect(setupReply).not.toContain(generalName)
    expect(setupReply).not.toContain(productName)

    await select(productId, "PRODUCT_CREATE")
    const product = await fixture.incoming(productText)
    productMessageId = product.userMessageId
    expect(await processAssistantChannelTurn(product.id, deps)).toMatchObject({
      status: "completed",
    })
    expect((await accounting()).runs).toBe(3)
    expect(
      await db.assistantBudget.findUnique({ where: { scopeKey: generalKey } }),
    ).toMatchObject({ requests: 1, tokens: 0 })
    expect(
      await db.assistantBudget.findUnique({ where: { scopeKey: setupKey } }),
    ).toMatchObject({ requests: 2, tokens: 0 })
    expect(
      await db.assistantBudget.findUnique({ where: { scopeKey: productKey } }),
    ).toBeNull()
    expect(generalCalls).toBe(1)
    expect(workflowCalls).toBe(2)
    expect(rejectedAdmissions).toBe(7)

    for (const [inbox, conversationId] of [
      [general, fixture.conversationId],
      [setup, setupId],
      [product, productId],
    ] as const) {
      expect(
        await db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: inbox.id },
          include: { binding: true },
        }),
      ).toMatchObject({ state: "COMPLETED", binding: { conversationId } })
      const run = await db.assistantRun.findFirstOrThrow({
        where: {
          requestId: inbox.requestId,
          actorUserId: userId,
          conversationId,
        },
      })
      expect(run).toMatchObject({
        status: "COMPLETED",
        provider: "ewatrade-rehearsal",
        model: "rehearsal-v1",
      })
      expect(
        await db.assistantUsageEvent.count({
          where: {
            runId: run.id,
            tenantId,
            actorUserId: userId,
            outcome: "success",
          },
        }),
      ).toBe(1)
      const outboxes = await db.assistantWhatsAppOutbox.findMany({
        where: { inboxId: inbox.id },
      })
      expect(outboxes.length).toBeGreaterThan(0)
      if (conversationId === productId) {
        const body = outboxes.map((row) => row.content ?? "").join("\n")
        expect(body).toContain(conversationId)
        expect(body).toContain(productName)
        expect(body).not.toContain(generalName)
        expect(body).not.toContain(setupName)
      } else {
        // Canonical scope selection clears earlier queued disclosure, retaining its audit.
        for (const row of outboxes)
          expect(row).toMatchObject({ state: "CANCELLED", content: null })
      }
    }
    expect(
      await db.setupDraft.findUnique({
        where: { conversationId: fixture.conversationId },
      }),
    ).toBeNull()
    const setupDraft = await db.setupDraft.findUniqueOrThrow({
      where: { conversationId: setupId },
      include: { entities: true },
    })
    const productDraft = await db.setupDraft.findUniqueOrThrow({
      where: { conversationId: productId },
      include: { entities: true },
    })
    expect(setupDraft.id).not.toBe(productDraft.id)
    for (const [draft, name, priceMinor, openingStock, messageId, quote] of [
      [setupDraft, setupName, 15000, "3", setupMessageId, setupText],
      [productDraft, productName, 25000, "2", productMessageId, productText],
    ] as const) {
      expect(draft.entities).toHaveLength(1)
      const entity = draft.entities[0]
      if (!entity) throw Error("Expected the exact purpose-owned draft")
      expect(entity).toMatchObject({
        kind: "PRODUCT",
        payload: { name, priceMinor, openingStock },
        source: { messageId, quote },
        committedRecordId: null,
      })
      expect(["PROPOSED", "NEEDS_INPUT"]).toContain(entity.state)
    }
    expect(productDraft.entities[0]?.key).toBe("product")
    expect(
      await db.assistantActionProposal.count({ where: { tenantId } }),
    ).toBe(1)
    expect(
      await db.assistantActionProposal.findUnique({
        where: { id: proposal.id },
      }),
    ).toMatchObject({
      revision: proposal.revision,
      payloadHash: proposal.payloadHash,
      payload: { name: generalName },
      status: "PENDING",
    })
    expect(await db.customer.count({ where: { tenantId } })).toBe(0)
    expect(await db.catalogItem.count({ where: { tenantId } })).toBe(0)
    expect(await db.financeBook.count({ where: { tenantId } })).toBe(0)
    expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(0)
    expect(
      await db.assistantWhatsAppWorkflowReview.count({
        where: { conversationId: { in: [setupId, productId] } },
      }),
    ).toBe(0)
  }, 420_000)
})
