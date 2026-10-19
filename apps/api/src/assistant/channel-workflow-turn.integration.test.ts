import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { ProductFormSnapshot } from "@ewatrade/assistant/product/contracts"
import {
  assistantBudgetScopeKey,
  createProductConversation,
  createSetupConversation,
} from "@ewatrade/db/assistant"
import {
  type WhatsAppConversationPrincipal,
  claimAssistantWhatsAppInbox,
  nextAssistantWhatsAppInbox,
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

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-workflow")
const flags = [
  "ASSISTANT_REHEARSAL_MODE",
  "ASSISTANT_WHATSAPP_SETUP_ENABLED",
  "ASSISTANT_WHATSAPP_PRODUCT_ENABLED",
] as const
const previous = new Map(flags.map((name) => [name, process.env[name]]))
const otherOwnerId = `${fixture.marker}-other`
let setupId = ""
let productId = ""
let workflowTurns = 0
const observed: Array<{ purpose: string; browserSession: boolean }> = []
let deps: ChannelTurnDependencies

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  Object.assign(process.env, {
    ASSISTANT_REHEARSAL_MODE: "true",
    ASSISTANT_WHATSAPP_SETUP_ENABLED: "true",
    ASSISTANT_WHATSAPP_PRODUCT_ENABLED: "true",
  })
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
    sku: "SYNTHETIC-WORKFLOW-SKU",
    barcode: "",
    showAdvanced: true,
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
  deps = {
    enabled: () => true,
    claim: (id) =>
      claimAssistantWhatsAppInbox(fixture.db, id, [fixture.userId]),
    recover: (lease) => recoverAssistantWhatsAppInboxRun(fixture.db, lease),
    context: async (principal, requestId, lease) => {
      const ctx = await createLinkedAssistantContext(
        fixture.db,
        principal,
        requestId,
        lease,
      )
      if (!isLinkedAssistantIdentity(ctx.session))
        throw Error("Expected real linked issuer")
      observed.push({
        purpose: ctx.session.purpose,
        browserSession: ctx.session.session !== null,
      })
      return ctx
    },
    createTurn: async () => {
      throw Error("A workflow must not enter the GENERAL runner")
    },
    createWorkflowTurn: async (...args) => {
      workflowTurns += 1
      // Explicit local rehearsal resolves the existing fake LanguageModelV3;
      // the actual shared runner, repository, tools, budget and finalizer execute.
      return createChannelWorkflowTurn(...args)
    },
    notice: (principal, lease, code) =>
      settleAssistantWhatsAppNotice(fixture.db, { principal, lease, code }),
    settle: (lease, errorCode) =>
      settleAssistantWhatsAppInbox(fixture.db, lease, {
        permittedUserIds: [fixture.userId],
        errorCode,
      }),
    retry: (lease) => retryAssistantWhatsAppInbox(fixture.db, lease),
    next: (bindingId) => nextAssistantWhatsAppInbox(fixture.db, bindingId),
  }
}, 90_000)

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      await fixture.db.assistantBudget.deleteMany({
        where: { scopeKey: assistantBudgetScopeKey(fixture.tenantId, "SETUP") },
      })
      await fixture.db.user.deleteMany({
        where: { id: otherOwnerId, email: `${otherOwnerId}@example.test` },
      })
    }
    await fixture.cleanup()
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, name)
      else process.env[name] = value
    }
  }
}, 60_000)

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
  if (selected.state !== "selected")
    throw Error("Expected actual workflow scope selection")
  expect(selected.conversationId).toBe(conversationId)
  expect(selected.purpose).toBe(purpose)
  const principal: WhatsAppConversationPrincipal = {
    kind: "linked_whatsapp",
    phoneNumberId: identity.phoneNumberId,
    senderId: identity.senderId,
    grantId: selected.grantId,
    grantGeneration: selected.grantGeneration,
    bindingId: selected.bindingId,
    identityGeneration: selected.identityGeneration,
    selectionGeneration: selected.selectionGeneration,
  }
  return principal
}

async function requests() {
  return (
    (
      await fixture.db.assistantBudget.findUnique({
        where: { scopeKey: assistantBudgetScopeKey(fixture.tenantId, "SETUP") },
      })
    )?.requests ?? 0
  )
}

async function sentReply(
  inboxId: string,
  conversationId: string,
  purpose: "SETUP" | "PRODUCT_CREATE",
) {
  const inbox = await fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({
    where: { id: inboxId },
  })
  expect(inbox.state).toBe("COMPLETED")
  expect(inbox.executionAuthorityDigest).toMatch(/^[a-f0-9]{64}$/)
  const run = await fixture.db.assistantRun.findFirstOrThrow({
    where: {
      requestId: inbox.requestId,
      actorUserId: fixture.userId,
      conversationId,
    },
    include: { assistantMessage: true },
  })
  expect(run.status).toBe("COMPLETED")
  expect(run.assistantMessage?.role).toBe("assistant")
  expect(run.assistantMessage?.conversationId).toBe(conversationId)
  expect(
    await fixture.db.assistantMessage.count({
      where: { id: inbox.userMessageId, conversationId },
    }),
  ).toBe(1)
  const rows = await fixture.db.assistantWhatsAppOutbox.findMany({
    where: { inboxId },
    orderBy: { chunkIndex: "asc" },
  })
  expect(rows.length).toBeGreaterThan(0)
  const body = rows.map((row) => row.content ?? "").join("\n")
  expect(body).toContain(
    purpose === "SETUP" ? "Setup draft revision" : "Product draft revision",
  )
  expect(body).toContain(
    `${purpose === "SETUP" ? "setupConversation" : "catalogConversation"}=${encodeURIComponent(conversationId)}`,
  )
  for (const row of rows) {
    expect(row.rendererVersion).toBe("whatsapp-workflow-v1")
    expect((await fixture.fakeAcceptedDelivery(row.id)).body).toBe(
      row.content ?? "",
    )
  }
  return { inbox, run, body }
}

suite("actual linked Setup and Product workflow continuation", () => {
  test("Setup uses the shared draft tools and exact saved chat; disabled gate returns its fixed app notice without spending another allowance", async () => {
    await select(setupId, "SETUP")
    const before = await requests()
    const inbox = await fixture.incoming("Synthetic setup eggs, 150, 3 pieces")
    expect(await processAssistantChannelTurn(inbox.id, deps)).toMatchObject({
      status: "completed",
    })
    const saved = await sentReply(inbox.id, setupId, "SETUP")
    expect(saved.body).toContain("Synthetic setup eggs")
    const draft = await fixture.db.setupDraft.findUniqueOrThrow({
      where: { conversationId: setupId },
      include: { entities: true },
    })
    expect(draft.revision).toBeGreaterThan(0)
    expect(draft.entities).toHaveLength(1)
    expect(draft.entities[0]).toMatchObject({
      kind: "PRODUCT",
      payload: {
        name: "Synthetic setup eggs",
        priceMinor: 15000,
        openingStock: "3",
      },
    })
    expect(await requests()).toBe(before + 1)
    expect(
      await fixture.db.catalogItem.count({
        where: { tenantId: fixture.tenantId },
      }),
    ).toBe(0)
    expect(
      await fixture.db.session.count({ where: { userId: fixture.userId } }),
    ).toBe(1)

    process.env.ASSISTANT_WHATSAPP_SETUP_ENABLED = "false"
    try {
      const disabled = await fixture.incoming("Draft list")
      expect(
        await processAssistantChannelTurn(disabled.id, deps),
      ).toMatchObject({ status: "completed" })
      const notice = await fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({
        where: { id: disabled.id },
      })
      expect(notice.content).toEqual({
        type: "channel_notice",
        code: "WORKFLOW_NOT_READY",
      })
      expect(notice.runId).toBeNull()
      expect(
        await fixture.db.assistantRun.count({
          where: { requestId: disabled.requestId },
        }),
      ).toBe(0)
      const output = await fixture.db.assistantWhatsAppOutbox.findFirstOrThrow({
        where: { inboxId: disabled.id },
      })
      expect(output.renderKind).toBe("notice")
      expect(output.content).toContain(
        `setupConversation=${encodeURIComponent(setupId)}`,
      )
      expect(output.content).not.toContain("undefined")
      await fixture.fakeAcceptedDelivery(output.id)
      expect(await requests()).toBe(before + 1)
    } finally {
      process.env.ASSISTANT_WHATSAPP_SETUP_ENABLED = "true"
    }
  }, 300_000)

  test("completed workflow run recovers after worker interruption without another model turn, draft replay or allowance", async () => {
    await select(setupId, "SETUP")
    const before = await requests()
    const inbox = await fixture.incoming(
      "Synthetic recovery eggs, 200, 1 piece",
    )
    const interrupted: ChannelTurnDependencies = {
      ...deps,
      settle: async () => {
        throw Error("Synthetic crash after canonical workflow commit")
      },
    }
    await expect(
      processAssistantChannelTurn(inbox.id, interrupted),
    ).rejects.toThrow("Assistant channel turn interrupted")
    const run = await fixture.db.assistantRun.findFirstOrThrow({
      where: { requestId: inbox.requestId, conversationId: setupId },
    })
    expect(run.status).toBe("COMPLETED")
    expect(run.assistantMessageId).not.toBeNull()
    const revision = (
      await fixture.db.setupDraft.findUniqueOrThrow({
        where: { conversationId: setupId },
      })
    ).revision
    const calls = workflowTurns
    expect(await requests()).toBe(before + 1)
    await fixture.db.assistantWhatsAppInbox.update({
      where: { id: inbox.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    })
    expect(await processAssistantChannelTurn(inbox.id, deps)).toMatchObject({
      status: "completed",
    })
    await sentReply(inbox.id, setupId, "SETUP")
    expect(workflowTurns).toBe(calls)
    expect(await requests()).toBe(before + 1)
    expect(
      (
        await fixture.db.setupDraft.findUniqueOrThrow({
          where: { conversationId: setupId },
        })
      ).revision,
    ).toBe(revision)
    expect(
      await fixture.db.assistantRun.count({
        where: { requestId: inbox.requestId, conversationId: setupId },
      }),
    ).toBe(1)
  }, 300_000)

  test("Product keeps one canonical draft and richer form context; another owner or Manager cannot select that workflow", async () => {
    const principal = await select(productId, "PRODUCT_CREATE")
    const before = await requests()
    const inbox = await fixture.incoming(
      "Synthetic product eggs, 250, 2 pieces",
    )
    expect(await processAssistantChannelTurn(inbox.id, deps)).toMatchObject({
      status: "completed",
    })
    const saved = await sentReply(inbox.id, productId, "PRODUCT_CREATE")
    expect(saved.body).toContain("Synthetic product eggs")
    expect(saved.body).toContain("richer form details")
    const row = await fixture.db.assistantConversation.findUniqueOrThrow({
      where: { id: productId },
      include: { setupDraft: { include: { entities: true } } },
    })
    expect(row.workflowContext).toMatchObject({
      snapshot: { sku: "SYNTHETIC-WORKFLOW-SKU", showAdvanced: true },
    })
    expect(row.setupDraft?.entities).toHaveLength(1)
    expect(row.setupDraft?.entities[0]).toMatchObject({
      key: "product",
      kind: "PRODUCT",
      payload: { name: "Synthetic product eggs", priceMinor: 25000 },
    })
    expect(await requests()).toBe(before + 1)
    expect(
      await fixture.db.catalogItem.count({
        where: { tenantId: fixture.tenantId },
      }),
    ).toBe(0)
    expect(observed.some((entry) => entry.purpose === "PRODUCT_CREATE")).toBe(
      true,
    )
    expect(observed.every((entry) => !entry.browserSession)).toBe(true)

    await fixture.db.user.create({
      data: {
        id: otherOwnerId,
        email: `${otherOwnerId}@example.test`,
        ageBand: "ADULT",
      },
    })
    const otherChat = await fixture.db.assistantConversation.create({
      data: {
        tenantId: fixture.tenantId,
        storeId: fixture.storeId,
        ownerUserId: otherOwnerId,
        purpose: "PRODUCT_CREATE",
        status: "ACTIVE",
      },
    })
    await expect(select(otherChat.id, "PRODUCT_CREATE")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
    const otherStore = await fixture.db.store.create({
      data: {
        tenantId: fixture.tenantId,
        slug: `${fixture.marker}-other-store`,
        name: "Synthetic other workflow Store",
        status: "ACTIVE",
      },
    })
    const wrongStoreChat = await fixture.db.assistantConversation.create({
      data: {
        tenantId: fixture.tenantId,
        storeId: otherStore.id,
        ownerUserId: fixture.userId,
        purpose: "PRODUCT_CREATE",
        status: "ACTIVE",
      },
    })
    await expect(
      select(wrongStoreChat.id, "PRODUCT_CREATE"),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(
      (
        await fixture.db.assistantWhatsAppIdentity.findFirstOrThrow({
          where: { userId: fixture.userId },
        })
      ).activeBindingId,
    ).toBe(principal.bindingId)
    await fixture.db.membership.update({
      where: { id: fixture.membershipId },
      data: { role: "MANAGER" },
    })
    try {
      await expect(select(productId, "PRODUCT_CREATE")).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      })
    } finally {
      await fixture.db.membership.update({
        where: { id: fixture.membershipId },
        data: { role: "OWNER" },
      })
    }
  }, 300_000)
})
