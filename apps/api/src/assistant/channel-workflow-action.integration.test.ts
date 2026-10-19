import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  WHATSAPP_WORKFLOW_ACTION_DISABLED_REPLY,
  WHATSAPP_WORKFLOW_ACTION_INVALID_REPLY,
} from "@ewatrade/assistant/channels/workflow-action-result"
import { whatsAppWorkflowActionSourceSchema } from "@ewatrade/assistant/channels/workflow-action-review"
import {
  type ProductFormSnapshot,
  productWorkflowContextSchema,
} from "@ewatrade/assistant/product/contracts"
import { setupEntityPayloadSchema } from "@ewatrade/assistant/setup/contracts"
import {
  assistantBudgetScopeKey,
  createProductConversation,
  createSetupConversation,
  readSetupDraft,
} from "@ewatrade/db/assistant"
import {
  type WhatsAppConversationPrincipal,
  type WhatsAppWorkflowReviewMaterial,
  acceptAssistantWhatsAppIngress,
  claimAssistantWhatsAppInbox,
  deriveAssistantWhatsAppWorkflowReviewCode,
  nextAssistantWhatsAppInbox,
  recoverAssistantWhatsAppInboxRun,
  retryAssistantWhatsAppInbox,
  selectAssistantWhatsAppScope,
  settleAssistantWhatsAppInbox,
  settleAssistantWhatsAppNotice,
} from "@ewatrade/db/assistant-whatsapp"
import { catalogRouter } from "../trpc/routers/catalog"
import { setupAssistantRouter } from "../trpc/routers/setup-assistant"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { createLinkedAssistantContext } from "./channel-principal"
import {
  type ChannelTurnDependencies,
  processAssistantChannelTurn,
} from "./channel-turn"
import {
  createAssistantWhatsAppWorkflowReceiptContext,
  processAssistantWhatsAppWorkflowAction,
} from "./channel-workflow-action-turn"
import { prepareAssistantWhatsAppWorkflowReview } from "./channel-workflow-review-staging"
import { createChannelWorkflowTurn } from "./channel-workflow-turn"
import type { GeneralContext } from "./general-context"
import {
  commitSetupDraft,
  defaultSetupCommitDependencies,
} from "./setup-commit"
import { requireSetupAssistantScope } from "./setup-context"

// Source-only unless the root explicitly selects the existing guarded local QA DB suite.
const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-native-workflow")
const flags = [
  "ASSISTANT_REHEARSAL_MODE",
  "ASSISTANT_WHATSAPP_SETUP_ENABLED",
  "ASSISTANT_WHATSAPP_PRODUCT_ENABLED",
  "ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED",
] as const
const previous = new Map(flags.map((name) => [name, process.env[name]]))
const rawDecisionCodes: string[] = []
const names = {
  product: "Synthetic selected eggs",
  service: "Synthetic selected haircut service",
  unselected: "Synthetic unselected rice",
  nativeProduct: "Synthetic native product",
}
let setupId = ""
let productId = ""
let principal: WhatsAppConversationPrincipal
let browser: GeneralContext
let deps: ChannelTurnDependencies

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  // This is the fixture's actual browser Session, captured before selecting a workflow.
  browser = await fixture.browserContext()
  Object.assign(process.env, {
    ASSISTANT_REHEARSAL_MODE: "true",
    ASSISTANT_WHATSAPP_SETUP_ENABLED: "true",
    ASSISTANT_WHATSAPP_PRODUCT_ENABLED: "true",
    ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED: "true",
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
      opening: "Describe the product to prepare its saved draft.",
    })
  ).id
  deps = {
    enabled: () => true,
    claim: (id) =>
      claimAssistantWhatsAppInbox(fixture.db, id, [fixture.userId]),
    recover: (lease) => recoverAssistantWhatsAppInboxRun(fixture.db, lease),
    context: (proof, requestId, lease) =>
      createLinkedAssistantContext(fixture.db, proof, requestId, lease),
    createTurn: async () => {
      throw Error("Workflow fixture must never use the GENERAL runner")
    },
    createWorkflowTurn: createChannelWorkflowTurn,
    notice: (proof, lease, code) =>
      settleAssistantWhatsAppNotice(fixture.db, {
        principal: proof,
        lease,
        code,
      }),
    settle: async (lease, errorCode) => {
      const workflowReview = errorCode
        ? undefined
        : await prepareAssistantWhatsAppWorkflowReview(fixture.db, lease).catch(
            () => undefined,
          )
      return settleAssistantWhatsAppInbox(fixture.db, lease, {
        permittedUserIds: [fixture.userId],
        errorCode,
        workflowReview,
      })
    },
    retry: (lease) => retryAssistantWhatsAppInbox(fixture.db, lease),
    next: (bindingId) => nextAssistantWhatsAppInbox(fixture.db, bindingId),
  }
}, 90_000)

afterAll(async () => {
  try {
    if (enabled && fixture.db)
      await fixture.db.assistantBudget.deleteMany({
        where: { scopeKey: assistantBudgetScopeKey(fixture.tenantId, "SETUP") },
      })
    await fixture.cleanup()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
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
    throw Error("Expected exact authorized workflow selection")
  principal = {
    kind: "linked_whatsapp",
    phoneNumberId: identity.phoneNumberId,
    senderId: identity.senderId,
    grantId: selected.grantId,
    grantGeneration: selected.grantGeneration,
    bindingId: selected.bindingId,
    identityGeneration: selected.identityGeneration,
    selectionGeneration: selected.selectionGeneration,
  }
}

async function draft(conversationId: string) {
  const row = await fixture.db.setupDraft.findUniqueOrThrow({
    where: { conversationId },
    select: { id: true },
  })
  return readSetupDraft(fixture.db, row.id)
}

async function freshProductConversation() {
  const original = await fixture.db.assistantConversation.findUniqueOrThrow({
    where: { id: productId },
    select: { workflowContext: true },
  })
  const { snapshot } = productWorkflowContextSchema.parse(
    original.workflowContext,
  )
  return createProductConversation(
    fixture.db,
    {
      tenantId: fixture.tenantId,
      storeId: fixture.storeId,
      userId: fixture.userId,
    },
    {
      id: `product_${randomUUID()}`,
      snapshot,
      seed: null,
      opening: "Describe the product to prepare its saved draft.",
    },
  )
}

async function addMatchingProduct(name: string) {
  expect(browser.session.session?.id).toBe(fixture.sessionId)
  return catalogRouter.createCaller(browser).createSimpleItem({
    clientOperationId: `workflow-negative-${randomUUID()}`,
    kind: "product",
    name,
    canonicalUnitName: "Piece",
    storeId: fixture.storeId,
    priceMinor: 100,
  })
}
function named(state: Awaited<ReturnType<typeof draft>>, name: string) {
  const found = state.entities.find(
    (row) => setupEntityPayloadSchema.parse(row.payload).name === name,
  )
  if (!found) throw Error("Expected exact original named draft record")
  return found
}

async function runWorkflow(text: string, conversationId: string) {
  const inbox = await fixture.incoming(text)
  expect(inbox.kind).toBe("TURN")
  expect(await processAssistantChannelTurn(inbox.id, deps)).toMatchObject({
    status: "completed",
  })
  const run = await fixture.db.assistantRun.findFirstOrThrow({
    where: {
      conversationId,
      requestId: inbox.requestId,
      actorUserId: fixture.userId,
    },
    include: { assistantMessage: true },
  })
  expect(run.status).toBe("COMPLETED")
  expect(run.provider).toBe("ewatrade-rehearsal")
  expect(run.assistantMessage?.conversationId).toBe(conversationId)
  const outputs = await fixture.db.assistantWhatsAppOutbox.findMany({
    where: { inboxId: inbox.id },
    orderBy: { chunkIndex: "asc" },
  })
  expect(outputs.length).toBeGreaterThan(0)
  return { inbox, run, outputs }
}

async function review(keys: string[], conversationId: string) {
  const before = await draft(conversationId)
  const result = await runWorkflow(
    `Review ${keys.length === 1 ? "draft" : "drafts"} ${keys.join(", ")}`,
    conversationId,
  )
  expect((await draft(conversationId)).revision).toBe(before.revision)
  expect((await draft(conversationId)).entities).toHaveLength(
    before.entities.length,
  )
  expect(result.outputs).toHaveLength(1)
  const outbox = result.outputs[0]
  if (!outbox) throw Error("Expected one immutable workflow review")
  expect(outbox.renderKind).toBe("workflow_action_review")
  const proof =
    await fixture.db.assistantWhatsAppWorkflowReview.findUniqueOrThrow({
      where: { reviewOutboxId: outbox.id },
    })
  const source = whatsAppWorkflowActionSourceSchema.parse(proof.source)
  expect(source.selection.map((row) => row.key)).toEqual(keys)
  expect(source.draftRevision).toBe(before.revision)
  const material = {
    bindingId: proof.bindingId,
    purpose: source.purpose,
    conversationId: source.conversationId,
    draftId: source.draftId,
    draftRevision: source.draftRevision,
    sourceDigest: proof.sourceDigest,
    reviewDigest: proof.reviewDigest,
    authorityDigest: proof.authorityDigest,
    identityGeneration: proof.identityGeneration,
    grantGeneration: proof.grantGeneration,
    selectionGeneration: proof.selectionGeneration,
    reviewOutboxId: proof.reviewOutboxId,
    nonce: proof.nonce,
    keyVersion: proof.keyVersion,
    expiresAt: proof.expiresAt,
  } satisfies WhatsAppWorkflowReviewMaterial
  const confirmCode = deriveAssistantWhatsAppWorkflowReviewCode(
    material,
    "confirm",
    fixture.signingKey,
  )
  const cancelCode = deriveAssistantWhatsAppWorkflowReviewCode(
    material,
    "cancel",
    fixture.signingKey,
  )
  rawDecisionCodes.push(confirmCode, cancelCode)
  expect(outbox.content).not.toContain(confirmCode)
  expect(JSON.stringify(proof)).not.toContain(confirmCode)
  const sent = await fixture.fakeAcceptedDelivery(outbox.id)
  expect(sent.body).toContain(
    `Confirm ${source.purpose === "SETUP" ? "setup" : "product"} ${confirmCode}`,
  )
  return {
    ...result,
    source,
    proof,
    outbox,
    confirmCode,
    cancelCode,
    providerMessageId: sent.providerMessageId,
  }
}

async function confirm(
  source: Awaited<ReturnType<typeof review>>,
  receiptOnly = false,
  decision: "confirm" | "cancel" = "confirm",
) {
  const code = decision === "confirm" ? source.confirmCode : source.cancelCode
  const text = `${decision === "confirm" ? "Confirm" : "Cancel"} ${source.source.purpose === "SETUP" ? "setup" : "product"} ${code}`
  const inbox = await fixture.incoming(text, source.providerMessageId)
  expect(inbox.kind).toBe("ACTION")
  expect(JSON.stringify(inbox.content)).not.toContain(code)
  const claimed = await fixture.claim(inbox.id)
  const ctx = receiptOnly
    ? await createAssistantWhatsAppWorkflowReceiptContext(
        fixture.db,
        principal,
        claimed.lease,
      )
    : await createLinkedAssistantContext(
        fixture.db,
        principal,
        inbox.requestId,
        claimed.lease,
      )
  if (receiptOnly) expect("session" in ctx).toBe(false)
  const result = await processAssistantWhatsAppWorkflowAction(
    ctx,
    claimed.lease,
  )
  expect(result.status).toBe("completed")
  if (result.status !== "completed")
    throw Error("Expected immutable action result")
  const saved = await fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({
    where: { id: inbox.id },
  })
  expect(saved.state).toBe("COMPLETED")
  expect(saved.runId).toBeNull()
  expect(
    await fixture.db.assistantRun.count({
      where: { requestId: inbox.requestId },
    }),
  ).toBe(0)
  expect(
    await fixture.db.assistantWhatsAppOutbox.count({
      where: { inboxId: inbox.id },
    }),
  ).toBe(1)
  const outbox = await fixture.db.assistantWhatsAppOutbox.findUniqueOrThrow({
    where: { id: result.outboxId },
  })
  expect(outbox.renderKind).toBe("workflow_action_result")
  const delivered = await fixture.fakeAcceptedDelivery(outbox.id)
  expect(delivered.body).toBe(outbox.content ?? "")
  return { inbox: saved, outbox }
}

async function assertNoDecisionCodes() {
  const persisted = JSON.stringify({
    messages: await fixture.db.assistantMessage.findMany({
      where: { conversation: { tenantId: fixture.tenantId } },
    }),
    inbox: await fixture.db.assistantWhatsAppInbox.findMany({
      where: { binding: { identity: { userId: fixture.userId } } },
    }),
    outbox: await fixture.db.assistantWhatsAppOutbox.findMany({
      where: { inbox: { binding: { identity: { userId: fixture.userId } } } },
    }),
    proof: await fixture.db.assistantWhatsAppWorkflowReview.findMany({
      where: { binding: { identity: { userId: fixture.userId } } },
    }),
  })
  for (const code of rawDecisionCodes) expect(persisted).not.toContain(code)
}

suite(
  "native reviewed workflow confirmation through the real canonical bridge",
  () => {
    test("Setup creates only the two exact selected records and atomically saves proof, outcomes and reply", async () => {
      await select(setupId, "SETUP")
      const seeded = await runWorkflow(
        `${names.product}, 150, 3 pieces\n${names.service}, 250\n${names.unselected}, 500, 2 bags`,
        setupId,
      )
      for (const row of seeded.outputs)
        await fixture.fakeAcceptedDelivery(row.id)
      const egg = named(await draft(setupId), names.product)
      const eggPayload = setupEntityPayloadSchema.parse(egg.payload)
      if (eggPayload.kind !== "product") throw Error("Expected the egg product")
      // The owner explicitly chooses no suggested illustration for this simple
      // native review; illustrated records retain their canonical app review.
      await setupAssistantRouter.createCaller(browser).updateEntity({
        conversationId: setupId,
        key: egg.key,
        payload: { ...eggPayload, illustrationId: null },
      })
      const before = await draft(setupId)
      expect(before.entities).toHaveLength(3)
      expect(named(before, names.product).payload).toMatchObject({
        illustrationId: null,
      })
      const selected = [
        named(before, names.product),
        named(before, names.service),
      ]
      const unselected = named(before, names.unselected)
      const exact = await review(
        selected.map((row) => row.key),
        setupId,
      )
      const confirmed = await confirm(exact)
      const saved = await draft(setupId)
      for (const row of selected) {
        const actual = saved.entities.find((entity) => entity.id === row.id)
        expect(actual?.state).toBe("COMMITTED")
        expect(actual?.committedRecordId).not.toBeNull()
        expect(
          await fixture.db.catalogItem.count({
            where: {
              id: actual?.committedRecordId ?? "",
              tenantId: fixture.tenantId,
            },
          }),
        ).toBe(1)
      }
      expect(
        saved.entities.find((row) => row.id === unselected.id),
      ).toMatchObject({
        state: unselected.state,
        payload: unselected.payload,
        committedRecordId: null,
      })
      expect(
        await fixture.db.catalogItem.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(2)
      expect(
        await fixture.db.customer.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(0)
      const proof =
        await fixture.db.assistantWhatsAppWorkflowReview.findUniqueOrThrow({
          where: { id: exact.proof.id },
        })
      expect(proof).toMatchObject({
        state: "CONSUMED",
        decision: "confirm",
        consumedByIngressId: confirmed.inbox.id,
      })
      expect(proof.completedAt).not.toBeNull()
      expect(proof.resultRef).toMatchObject({
        version: "workflow-result-v1",
        purpose: "SETUP",
        results: selected.map((row) => ({
          entityId: row.id,
          key: row.key,
          state: "COMMITTED",
        })),
      })
      expect(confirmed.outbox.content).toContain(names.product)
      expect(confirmed.outbox.content).toContain(names.service)
      expect(confirmed.outbox.content).not.toContain(names.unselected)
      await assertNoDecisionCodes()
    }, 300_000)

    test("default-off native writes and a subsequent canonical app edit cannot execute the old selected proof", async () => {
      const before = await draft(setupId)
      const pending = named(before, names.unselected)
      const exact = await review([pending.key], setupId)
      Reflect.deleteProperty(
        process.env,
        "ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED",
      )
      try {
        const disabled = await confirm(exact)
        expect(disabled.outbox.content).toBe(
          WHATSAPP_WORKFLOW_ACTION_DISABLED_REPLY,
        )
        expect(
          (
            await fixture.db.assistantWhatsAppWorkflowReview.findUniqueOrThrow({
              where: { id: exact.proof.id },
            })
          ).state,
        ).toBe("PENDING")
      } finally {
        process.env.ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED = "true"
      }
      const payload = setupEntityPayloadSchema.parse(pending.payload)
      if (payload.kind !== "product")
        throw Error("Expected the exact uncommitted product")
      await setupAssistantRouter.createCaller(browser).updateEntity({
        conversationId: setupId,
        key: pending.key,
        payload: { ...payload, priceMinor: 55000 },
      })
      const stale = await confirm(exact)
      expect(stale.outbox.content).toBe(WHATSAPP_WORKFLOW_ACTION_INVALID_REPLY)
      expect(
        await fixture.db.catalogItem.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(2)
      expect(
        (await draft(setupId)).entities.find((row) => row.id === pending.id),
      ).toMatchObject({
        state: "PROPOSED",
        committedRecordId: null,
        payload: { priceMinor: 55000 },
      })
      expect(
        (
          await fixture.db.assistantWhatsAppWorkflowReview.findUniqueOrThrow({
            where: { id: exact.proof.id },
          })
        ).state,
      ).toBe("PENDING")
      await assertNoDecisionCodes()
    }, 300_000)

    test("Product closes its canonical chat yet delivers and replays only the same saved receipt without normal TURN authority", async () => {
      await select(productId, "PRODUCT_CREATE")
      const seeded = await runWorkflow(
        `${names.nativeProduct}, 300, 2 pieces`,
        productId,
      )
      for (const row of seeded.outputs)
        await fixture.fakeAcceptedDelivery(row.id)
      const state = await draft(productId)
      expect(state.entities).toHaveLength(1)
      expect(state.entities[0]?.key).toBe("product")
      const exact = await review(["product"], productId)
      const confirmed = await confirm(exact)
      expect(
        (
          await fixture.db.assistantConversation.findUniqueOrThrow({
            where: { id: productId },
          })
        ).status,
      ).toBe("COMPLETED")
      expect((await draft(productId)).entities[0]).toMatchObject({
        key: "product",
        state: "COMMITTED",
      })
      expect(
        await fixture.db.catalogItem.count({
          where: { tenantId: fixture.tenantId, name: names.nativeProduct },
        }),
      ).toBe(1)
      expect(confirmed.outbox.content).toContain(names.nativeProduct)
      const runs = await fixture.db.assistantRun.count({
        where: { conversationId: productId },
      })
      await expect(
        createLinkedAssistantContext(
          fixture.db,
          principal,
          `${fixture.marker}-terminal-turn`,
        ),
      ).rejects.toThrow()
      expect(
        await acceptAssistantWhatsAppIngress(
          fixture.db,
          {
            phoneNumberId: principal.phoneNumberId,
            senderId: principal.senderId,
            providerMessageId: `${fixture.marker}-no-terminal-turn`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            text: "Create another product without a new chat",
          },
          [fixture.userId],
        ),
      ).toMatchObject({ kind: "ignored" })
      const duplicate = await confirm(exact, true)
      expect(duplicate.inbox.id).not.toBe(confirmed.inbox.id)
      expect(duplicate.inbox.content).toEqual(confirmed.inbox.content)
      expect(duplicate.outbox.content).toBe(confirmed.outbox.content)
      expect(
        await fixture.db.catalogItem.count({
          where: { tenantId: fixture.tenantId, name: names.nativeProduct },
        }),
      ).toBe(1)
      expect(
        await fixture.db.assistantRun.count({
          where: { conversationId: productId },
        }),
      ).toBe(runs)
      expect(
        (
          await fixture.db.assistantWhatsAppWorkflowReview.findUniqueOrThrow({
            where: { id: exact.proof.id },
          })
        ).consumedByIngressId,
      ).toBe(confirmed.inbox.id)
      await assertNoDecisionCodes()
    }, 300_000)

    test("a browser customer commit with an actual stale outer read reuses the WhatsApp committed record", async () => {
      await select(setupId, "SETUP")
      const customerName = "Synthetic raced name-only customer"
      const seeded = await runWorkflow(`${customerName} owes me 10`, setupId)
      for (const row of seeded.outputs)
        await fixture.fakeAcceptedDelivery(row.id)
      const initial = named(await draft(setupId), customerName)
      const caller = setupAssistantRouter.createCaller(browser)
      await caller.updateEntity({
        conversationId: setupId,
        key: initial.key,
        payload: { kind: "customer", name: customerName },
      })
      await caller.setEntityState({
        conversationId: setupId,
        keys: [initial.key],
        state: "CONFIRMED",
      })
      const exact = await review([initial.key], setupId)
      expect(browser.session.session?.id).toBe(fixture.sessionId)
      const scope = requireSetupAssistantScope(browser)
      const canonical = defaultSetupCommitDependencies()
      let signalSnapshot: () => void = () => {}
      let releaseSnapshot: () => void = () => {}
      const paused = new Promise<void>((resolve) => {
        signalSnapshot = resolve
      })
      const resume = new Promise<void>((resolve) => {
        releaseSnapshot = resolve
      })
      let firstRead = true
      // Pause only the real outer read. The production transaction locks and
      // rereads the same draft after WhatsApp wins, without contact deduplication.
      const browserCommit = commitSetupDraft(
        fixture.db,
        { ...scope, conversationId: setupId },
        exact.source.draftId,
        {
          ...canonical,
          readSetupDraft: async (...args) => {
            const snapshot = await canonical.readSetupDraft(...args)
            if (firstRead) {
              firstRead = false
              expect(
                snapshot.entities.find((row) => row.id === initial.id),
              ).toMatchObject({ state: "CONFIRMED", committedRecordId: null })
              signalSnapshot()
              await resume
            }
            return snapshot
          },
        },
        { keys: [initial.key] },
      )
      let confirmed: Awaited<ReturnType<typeof confirm>> | undefined
      let browserResult:
        | Awaited<ReturnType<typeof commitSetupDraft>>
        | undefined
      try {
        await Promise.race([
          paused,
          browserCommit.then(() => {
            throw Error(
              "Expected the browser commit to pause on its actual read",
            )
          }),
        ])
        confirmed = await confirm(exact)
      } finally {
        releaseSnapshot()
        browserResult = await browserCommit
      }
      if (!confirmed || !browserResult) throw Error("Both commits must finish")
      const customers = await fixture.db.customer.findMany({
        where: { tenantId: fixture.tenantId, name: customerName },
      })
      expect(customers).toHaveLength(1)
      const customer = customers[0]
      if (!customer) throw Error("Expected the canonical customer")
      expect(customer.phone).toBeNull()
      expect(customer.email).toBeNull()
      expect(
        (await draft(setupId)).entities.find((row) => row.id === initial.id),
      ).toMatchObject({ state: "COMMITTED", committedRecordId: customer.id })
      expect(browserResult.results).toContainEqual(
        expect.objectContaining({
          key: initial.key,
          state: "COMMITTED",
          recordId: customer.id,
        }),
      )
      const proof =
        await fixture.db.assistantWhatsAppWorkflowReview.findUniqueOrThrow({
          where: { id: exact.proof.id },
        })
      expect(proof).toMatchObject({
        state: "CONSUMED",
        consumedByIngressId: confirmed.inbox.id,
        resultRef: {
          results: [
            {
              entityId: initial.id,
              key: initial.key,
              state: "COMMITTED",
              recordId: customer.id,
            },
          ],
        },
      })
      expect(proof.completedAt).not.toBeNull()
      await assertNoDecisionCodes()
    }, 300_000)

    test("quoted workflow Cancel replays the same saved cancellation and opposite Confirm never creates a record or run", async () => {
      const conversation = await freshProductConversation()
      await select(conversation.id, "PRODUCT_CREATE")
      const name = `Synthetic cancelled product ${randomUUID()}`
      const seeded = await runWorkflow(
        `${name}, 125, 2 pieces`,
        conversation.id,
      )
      for (const row of seeded.outputs)
        await fixture.fakeAcceptedDelivery(row.id)
      const exact = await review(["product"], conversation.id)
      const before = await draft(conversation.id)
      const runs = await fixture.db.assistantRun.count({
        where: { conversationId: conversation.id },
      })
      const budget = await fixture.db.assistantBudget.findUniqueOrThrow({
        where: { scopeKey: assistantBudgetScopeKey(fixture.tenantId, "SETUP") },
        select: { requests: true, tokens: true },
      })
      const cancelled = await confirm(exact, false, "cancel")
      expect(cancelled.outbox.content).toBe(
        "Workflow review cancelled. No records were added by this confirmation.",
      )
      expect(cancelled.inbox.content).toMatchObject({
        type: "workflow_action_result",
        reviewId: exact.proof.id,
        resultRef: {
          purpose: "PRODUCT_CREATE",
          results: exact.source.selection.map((selected) => ({
            entityId: selected.entityId,
            key: selected.key,
            state: "CANCELLED",
          })),
        },
      })
      const replay = await confirm(exact, false, "cancel")
      expect(replay.inbox.id).not.toBe(cancelled.inbox.id)
      expect(replay.inbox.content).toEqual(cancelled.inbox.content)
      expect(replay.outbox.content).toBe(cancelled.outbox.content)
      const opposite = await confirm(exact)
      expect(opposite.outbox.content).toBe(
        WHATSAPP_WORKFLOW_ACTION_INVALID_REPLY,
      )
      const proof =
        await fixture.db.assistantWhatsAppWorkflowReview.findUniqueOrThrow({
          where: { id: exact.proof.id },
        })
      expect(proof).toMatchObject({
        state: "CONSUMED",
        decision: "cancel",
        consumedByIngressId: cancelled.inbox.id,
      })
      expect(proof.completedAt).not.toBeNull()
      expect(await draft(conversation.id)).toEqual(before)
      expect(
        await fixture.db.assistantRun.count({
          where: { conversationId: conversation.id },
        }),
      ).toBe(runs)
      expect(
        await fixture.db.assistantBudget.findUniqueOrThrow({
          where: {
            scopeKey: assistantBudgetScopeKey(fixture.tenantId, "SETUP"),
          },
          select: { requests: true, tokens: true },
        }),
      ).toEqual(budget)
      expect(
        await fixture.db.catalogItem.count({
          where: { tenantId: fixture.tenantId, name },
        }),
      ).toBe(0)
      expect(
        await fixture.db.assistantConversation.findUniqueOrThrow({
          where: { id: conversation.id },
          select: { status: true },
        }),
      ).toEqual({ status: "ACTIVE" })
      await assertNoDecisionCodes()
    }, 300_000)

    test("Product possible matches require app review before proof issue and a new match before Confirm leaves proof pending with no duplicate", async () => {
      const existingConversation = await freshProductConversation()
      await select(existingConversation.id, "PRODUCT_CREATE")
      const existingName = `Synthetic existing match ${randomUUID()}`
      const initial = await runWorkflow(
        `${existingName}, 150, 2 pieces`,
        existingConversation.id,
      )
      for (const row of initial.outputs)
        await fixture.fakeAcceptedDelivery(row.id)
      const existingRecord = await addMatchingProduct(existingName)
      const before = await draft(existingConversation.id)
      const appReview = await runWorkflow(
        "Review draft product",
        existingConversation.id,
      )
      expect(appReview.outputs.every((row) => row.renderKind === "reply")).toBe(
        true,
      )
      const appBody = appReview.outputs
        .map((row) => row.content ?? "")
        .join("\n")
      expect(appBody).toContain(
        `catalogConversation=${encodeURIComponent(existingConversation.id)}`,
      )
      expect(appBody).toContain("If no confirmation review is issued")
      expect(
        await fixture.db.assistantWhatsAppWorkflowReview.count({
          where: { conversationId: existingConversation.id },
        }),
      ).toBe(0)
      expect(await draft(existingConversation.id)).toEqual(before)
      expect(
        await fixture.db.catalogItem.findMany({
          where: { tenantId: fixture.tenantId, name: existingName },
          select: { id: true },
        }),
      ).toEqual([{ id: existingRecord.id }])
      for (const row of appReview.outputs)
        await fixture.fakeAcceptedDelivery(row.id)

      const freshConversation = await freshProductConversation()
      await select(freshConversation.id, "PRODUCT_CREATE")
      const freshName = `Synthetic later match ${randomUUID()}`
      const seeded = await runWorkflow(
        `${freshName}, 200, 3 pieces`,
        freshConversation.id,
      )
      for (const row of seeded.outputs)
        await fixture.fakeAcceptedDelivery(row.id)
      expect(
        await fixture.db.catalogItem.count({
          where: { tenantId: fixture.tenantId, name: freshName },
        }),
      ).toBe(0)
      const exact = await review(["product"], freshConversation.id)
      const reviewedDraft = await draft(freshConversation.id)
      const runs = await fixture.db.assistantRun.count({
        where: { conversationId: freshConversation.id },
      })
      const matchingRecord = await addMatchingProduct(freshName)
      const refused = await confirm(exact)
      expect(refused.outbox.content).toBe(
        WHATSAPP_WORKFLOW_ACTION_INVALID_REPLY,
      )
      expect(refused.inbox.content).toEqual({
        type: "workflow_action_refusal",
        reason: "invalid",
      })
      expect(
        await fixture.db.assistantWhatsAppWorkflowReview.findUniqueOrThrow({
          where: { id: exact.proof.id },
        }),
      ).toMatchObject({
        state: "PENDING",
        decision: null,
        consumedByIngressId: null,
        completedAt: null,
        resultRef: null,
      })
      expect(await draft(freshConversation.id)).toEqual(reviewedDraft)
      expect(
        await fixture.db.catalogItem.findMany({
          where: { tenantId: fixture.tenantId, name: freshName },
          select: { id: true },
        }),
      ).toEqual([{ id: matchingRecord.id }])
      expect(
        await fixture.db.assistantRun.count({
          where: { conversationId: freshConversation.id },
        }),
      ).toBe(runs)
      expect(
        await fixture.db.assistantConversation.findUniqueOrThrow({
          where: { id: freshConversation.id },
          select: { status: true },
        }),
      ).toEqual({ status: "ACTIVE" })
      await assertNoDecisionCodes()
    }, 600_000)
  },
)
