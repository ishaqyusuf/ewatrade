import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import type { PrismaClient } from "../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "./acceptance/service-commerce/database"
import {
  type AssistantScope,
  type SetupDraftEntityInput,
  assistantBudgetScopeKey,
  beginAssistantRun,
  commitProductConversation,
  completeAssistantRun,
  createProductConversation,
  listProductConversations,
  productConversationHasRunningTurn,
  readAssistantConversation,
  readSetupDraft,
  updateProductConversationSnapshot,
  upsertSetupDraftEntities,
} from "./assistant"
import type { CreateCatalogItemInput } from "./catalog"

setDefaultTimeout(180_000)

function snapshot(storeId: string, name = "Acceptance eggs") {
  return {
    form: {
      kind: "product",
      name,
      description: "",
      unitName: "Egg",
      price: "150",
      openingStockQuantity: "",
      usage: "FOR_SALE",
    },
    storeId,
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
    optionGroups: [{ id: "group", name: "", values: "" }],
    variantDrafts: {},
    additionalUnits: [],
  }
}

function seed(name = "Acceptance eggs"): SetupDraftEntityInput {
  return {
    key: "product",
    kind: "PRODUCT",
    state: "PROPOSED",
    payload: {
      kind: "product",
      name,
      unitName: "Egg",
      priceMinor: 15_000,
      usage: "FOR_SALE",
    },
    source: { kind: "form" },
    openQuestions: [],
  }
}

function command(scope: AssistantScope): CreateCatalogItemInput {
  return {
    actorUserId: scope.userId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    clientOperationId: "replaced-by-product-workflow",
    kind: "product",
    name: "Acceptance eggs",
    usage: "FOR_SALE",
    unitConfiguration: {
      canonicalBalanceScale: 18,
      units: [
        {
          key: "egg",
          name: "Egg",
          factor: "1",
          stockBehavior: "canonical_shared",
          transactionScale: 2,
        },
      ],
    },
    variants: [
      {
        key: "default",
        name: "Acceptance eggs",
        isDefault: true,
        offerings: [
          {
            key: "egg",
            name: "Egg",
            pricingPolicy: "fixed",
            inventoryUnitKey: "egg",
            fixedPriceMinor: 15_000,
            storeAvailability: [{ storeId: scope.storeId, isAvailable: true }],
          },
        ],
      },
    ],
  }
}

type Fixture = {
  db: PrismaClient
  scope: AssistantScope
  otherActorId: string
  otherStoreId: string
  otherTenantId: string
}

async function withFixture(run: (fixture: Fixture) => Promise<void>) {
  const { prisma: db } = await import("../client")
  const users: string[] = []
  const tenants: string[] = []
  const unique = randomUUID()
  try {
    const owner = await db.user.create({
      data: {
        email: `product-assistant-owner-${unique}@example.invalid`,
        name: "Product assistant acceptance owner",
      },
    })
    users.push(owner.id)
    const admin = await db.user.create({
      data: {
        email: `product-assistant-admin-${unique}@example.invalid`,
        name: "Product assistant acceptance admin",
      },
    })
    users.push(admin.id)
    const tenant = await db.tenant.create({
      data: {
        name: "Product assistant acceptance",
        slug: `product-assistant-${unique}`,
        type: "MERCHANT",
        enabledModes: ["MERCHANT"],
        dataClassification: "QA",
        users: {
          create: [
            { userId: owner.id, role: "OWNER", status: "ACTIVE" },
            { userId: admin.id, role: "ADMIN", status: "ACTIVE" },
          ],
        },
      },
    })
    tenants.push(tenant.id)
    const foreign = await db.tenant.create({
      data: {
        name: "Foreign product assistant acceptance",
        slug: `product-assistant-foreign-${unique}`,
        type: "MERCHANT",
        enabledModes: ["MERCHANT"],
        dataClassification: "QA",
      },
    })
    tenants.push(foreign.id)
    const store = await db.store.create({
      data: {
        tenantId: tenant.id,
        name: "Product assistant acceptance Store",
        slug: "product-assistant-one",
        status: "ACTIVE",
        currencyCode: "NGN",
        countryCode: "NG",
      },
    })
    const otherStore = await db.store.create({
      data: {
        tenantId: tenant.id,
        name: "Other product assistant Store",
        slug: "product-assistant-two",
        status: "ACTIVE",
      },
    })
    const publication = currentEffectiveLegalPublication()
    if (!publication)
      throw new Error("Acceptance requires current approved Terms")
    await db.legalAcceptance.create({
      data: {
        userId: owner.id,
        version: publication.version,
        documentHash: publication.documentHash,
        surface: "product-assistant-acceptance",
      },
    })
    await run({
      db,
      scope: { tenantId: tenant.id, storeId: store.id, userId: owner.id },
      otherActorId: admin.id,
      otherStoreId: otherStore.id,
      otherTenantId: foreign.id,
    })
  } finally {
    if (tenants.length) {
      const tenantId = { in: tenants }
      await db.assistantBudget.deleteMany({
        where: {
          scopeKey: {
            in: tenants.map((id) => assistantBudgetScopeKey(id, "SETUP")),
          },
        },
      })
      await db.assistantConversation.deleteMany({ where: { tenantId } })
      await db.catalogCommandReceipt.deleteMany({ where: { tenantId } })
      await db.catalogPriceChange.deleteMany({ where: { tenantId } })
      await db.catalogItem.deleteMany({ where: { tenantId } })
      await db.store.deleteMany({ where: { tenantId } })
      await db.membership.deleteMany({ where: { tenantId } })
      await db.tenant.deleteMany({ where: { id: tenantId } })
      expect(await db.tenant.count({ where: { id: tenantId } })).toBe(0)
    }
    await db.user.deleteMany({ where: { id: { in: users } } })
    expect(await db.user.count({ where: { id: { in: users } } })).toBe(0)
  }
}

async function start(fixture: Fixture, id = `prd_acceptance_${randomUUID()}`) {
  const conversation = await createProductConversation(
    fixture.db,
    fixture.scope,
    {
      id,
      snapshot: snapshot(fixture.scope.storeId),
      seed: seed(),
      opening: "Tell me about the product you want to add.",
    },
  )
  if (!conversation.setupDraft) throw new Error("Product fixture has no draft")
  return { ...conversation, setupDraft: conversation.setupDraft }
}

describeWithServiceCommerceDatabase(
  "Focused product assistant persistence",
  () => {
    test("start replay keeps one draft/opening and hides actor, tenant and Store mismatches", async () => {
      await withFixture(async (fixture) => {
        const { db, scope } = fixture
        const id = `prd_acceptance_${randomUUID()}`
        const [conversation, concurrent] = await Promise.all([
          start(fixture, id),
          start(fixture, id),
        ])
        expect(concurrent.id).toBe(conversation.id)
        const replay = await createProductConversation(db, scope, {
          id: conversation.id,
          snapshot: snapshot(scope.storeId),
          seed: seed(),
          opening: "This duplicate must not be appended.",
        })
        expect(replay.id).toBe(conversation.id)
        expect(replay.workflowContext).toMatchObject({
          snapshot: snapshot(scope.storeId),
          handoffDigest: expect.any(String),
        })
        await expect(
          createProductConversation(db, scope, {
            id: conversation.id,
            snapshot: snapshot(
              scope.storeId,
              "Changed replay must not overwrite",
            ),
            seed: seed("Changed replay must not overwrite"),
            opening: "This conflicting duplicate must not be appended.",
          }),
        ).rejects.toMatchObject({ code: "CONVERSATION_CLOSED" })
        expect(
          await db.assistantMessage.count({
            where: { conversationId: conversation.id },
          }),
        ).toBe(1)
        expect(
          await db.setupDraft.count({
            where: { conversationId: conversation.id },
          }),
        ).toBe(1)
        const draft = await readSetupDraft(db, conversation.setupDraft.id)
        expect(draft.entities).toHaveLength(1)
        expect(draft.entities[0]?.payload).toMatchObject({
          name: "Acceptance eggs",
        })
        for (const denied of [
          { ...scope, userId: fixture.otherActorId },
          { ...scope, tenantId: fixture.otherTenantId },
          { ...scope, storeId: fixture.otherStoreId },
        ]) {
          await expect(
            readAssistantConversation(db, denied, conversation.id),
          ).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" })
          expect(await listProductConversations(db, denied)).toEqual([])
          await expect(
            commitProductConversation(
              db,
              denied,
              { conversationId: conversation.id, expectedRevision: 0 },
              () => command(scope),
            ),
          ).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" })
        }
        expect(
          (await listProductConversations(db, scope)).map((row) => row.id),
        ).toEqual([conversation.id])
        expect(
          await db.catalogItem.count({ where: { tenantId: scope.tenantId } }),
        ).toBe(0)
      })
    })

    test("stale revisions and running turns fence creation and snapshot updates", async () => {
      await withFixture(async (fixture) => {
        const { db, scope } = fixture
        const conversation = await start(fixture)
        const create = (expectedRevision: number, manual = false) =>
          commitProductConversation(
            db,
            scope,
            {
              conversationId: conversation.id,
              expectedRevision,
              ...(manual ? { manualEntity: seed("Manual edit") } : {}),
            },
            () => command(scope),
          )
        await expect(create(1)).rejects.toMatchObject({
          code: "CONVERSATION_CLOSED",
        })
        await expect(create(1, true)).rejects.toMatchObject({
          code: "CONVERSATION_CLOSED",
        })
        const run = await beginAssistantRun(db, {
          actorUserId: scope.userId,
          conversationId: conversation.id,
          model: "acceptance",
          promptVersion: "product-acceptance",
          provider: "rehearsal",
          requestId: randomUUID(),
          userMessage: {
            id: `msg_${randomUUID()}`,
            role: "user",
            parts: [{ type: "text", text: "Confirm the counting unit" }],
          },
        })
        await expect(create(0)).rejects.toMatchObject({
          code: "CONVERSATION_CLOSED",
        })
        await expect(create(0, true)).rejects.toMatchObject({
          code: "CONVERSATION_CLOSED",
        })
        const update = (expectedRevision: number) =>
          updateProductConversationSnapshot(db, scope, {
            conversationId: conversation.id,
            expectedRevision,
            snapshot: snapshot(scope.storeId, "Updated eggs"),
            seed: seed("Updated eggs"),
          })
        await expect(update(0)).rejects.toMatchObject({
          code: "CONVERSATION_CLOSED",
        })
        await db.assistantRun.update({
          where: { id: run.run.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        })
        await update(0)
        expect(
          (await readSetupDraft(db, conversation.setupDraft.id)).revision,
        ).toBe(1)
        await expect(update(0)).rejects.toMatchObject({
          code: "CONVERSATION_CLOSED",
        })
        await expect(create(0)).rejects.toMatchObject({
          code: "CONVERSATION_CLOSED",
        })
        const updated = await readAssistantConversation(
          db,
          scope,
          conversation.id,
        )
        expect(updated.workflowContext).toMatchObject({
          snapshot: snapshot(scope.storeId, "Updated eggs"),
        })
        expect(updated.workflowContext).toMatchObject({
          handoffDigest: (
            conversation.workflowContext as { handoffDigest: string }
          ).handoffDigest,
        })
        const originalHandoffReplay = await start(fixture, conversation.id)
        expect(originalHandoffReplay.workflowContext).toEqual(
          updated.workflowContext,
        )
        expect(
          await db.catalogItem.count({ where: { tenantId: scope.tenantId } }),
        ).toBe(0)
        expect(
          await db.catalogCommandReceipt.count({
            where: { tenantId: scope.tenantId },
          }),
        ).toBe(0)
      })
    })

    test("an orphaned running turn expires once and permits a fresh admitted turn", async () => {
      await withFixture(async (fixture) => {
        const { db, scope } = fixture
        const conversation = await start(fixture)
        const originalDraft = await readSetupDraft(
          db,
          conversation.setupDraft.id,
        )
        const admit = () =>
          beginAssistantRun(db, {
            actorUserId: scope.userId,
            conversationId: conversation.id,
            model: "acceptance",
            promptVersion: "product-acceptance",
            provider: "rehearsal",
            requestId: randomUUID(),
            userMessage: {
              id: `msg_${randomUUID()}`,
              role: "user",
              parts: [{ type: "text", text: "Count these in eggs" }],
            },
          })
        const old = await admit()
        expect(
          await productConversationHasRunningTurn(db, conversation.id),
        ).toBe(true)
        await expect(admit()).rejects.toMatchObject({
          code: "CONVERSATION_CLOSED",
        })
        await db.assistantRun.update({
          where: { id: old.run.id },
          data: { startedAt: new Date(Date.now() - 180_000) },
        })
        expect(
          await productConversationHasRunningTurn(db, conversation.id),
        ).toBe(false)
        const expired = await db.assistantRun.findUniqueOrThrow({
          where: { id: old.run.id },
        })
        expect(expired).toMatchObject({
          status: "FAILED",
          errorCode: "TURN_INTERRUPTED",
        })
        expect(expired.completedAt).toBeInstanceOf(Date)
        expect(
          await productConversationHasRunningTurn(db, conversation.id),
        ).toBe(false)
        expect(
          (
            await db.assistantRun.findUniqueOrThrow({
              where: { id: old.run.id },
            })
          ).completedAt,
        ).toEqual(expired.completedAt)
        const fresh = await admit()
        expect(fresh.replay).toBe(false)
        expect(fresh.run.id).not.toBe(old.run.id)
        expect(fresh.run.status).toBe("RUNNING")
        await upsertSetupDraftEntities(db, {
          draftId: conversation.setupDraft.id,
          entities: [seed("Current turn eggs")],
          productRun: { runId: fresh.run.id, scope },
        })
        await expect(
          upsertSetupDraftEntities(db, {
            draftId: conversation.setupDraft.id,
            entities: [seed("Obsolete turn must not overwrite")],
            productRun: { runId: old.run.id, scope },
          }),
        ).rejects.toMatchObject({ code: "CONVERSATION_CLOSED" })
        const currentDraft = await readSetupDraft(
          db,
          conversation.setupDraft.id,
        )
        expect(currentDraft.revision).toBe(originalDraft.revision + 1)
        expect(currentDraft.entities[0]?.payload).toMatchObject({
          name: "Current turn eggs",
        })
        const budgetScopeKey = assistantBudgetScopeKey(scope.tenantId, "SETUP")
        await db.assistantBudget.create({
          data: {
            scopeKey: budgetScopeKey,
            windowStartedAt: new Date(),
            requests: 2,
            tokens: 0,
          },
        })
        const lateMessageId = `msg_${randomUUID()}`
        const late: Parameters<typeof completeAssistantRun>[1] = {
          runId: old.run.id,
          tenantId: scope.tenantId,
          actorUserId: scope.userId,
          provider: "rehearsal",
          model: "acceptance",
          status: "COMPLETED",
          usage: { totalTokens: 123 },
          budgetScopeKey,
          assistantMessage: {
            id: lateMessageId,
            role: "assistant",
            parts: [{ type: "text", text: "Obsolete reply must not append" }],
          },
        }
        await Promise.all([
          completeAssistantRun(db, late),
          completeAssistantRun(db, late),
        ])
        const retained = await db.assistantRun.findUniqueOrThrow({
          where: { id: old.run.id },
        })
        expect(retained).toMatchObject({
          status: "FAILED",
          errorCode: "TURN_INTERRUPTED",
        })
        expect(retained.completedAt).toEqual(expired.completedAt)
        const usage = await db.assistantUsageEvent.findMany({
          where: { runId: old.run.id },
        })
        expect(usage).toHaveLength(1)
        expect(usage[0]).toMatchObject({ outcome: "failed", totalTokens: 123 })
        expect(
          (
            await db.assistantBudget.findUniqueOrThrow({
              where: { scopeKey: budgetScopeKey },
            })
          ).tokens,
        ).toBe(123)
        expect(
          await db.assistantMessage.findUnique({
            where: { id: lateMessageId },
          }),
        ).toBeNull()
        expect(
          await productConversationHasRunningTurn(db, conversation.id),
        ).toBe(true)
        expect(
          await db.assistantMessage.count({
            where: { conversationId: conversation.id },
          }),
        ).toBe(3)
      })
    })

    test("explicit concurrent creation commits one canonical graph/receipt and rechecks authority on replay", async () => {
      await withFixture(async (fixture) => {
        const { db, scope } = fixture
        const conversation = await start(fixture)
        expect(
          await db.catalogItem.count({ where: { tenantId: scope.tenantId } }),
        ).toBe(0)
        let prepared = 0
        const create = (expectedRevision = 0) =>
          commitProductConversation(
            db,
            scope,
            { conversationId: conversation.id, expectedRevision },
            () => {
              prepared += 1
              return command(scope)
            },
          )
        const [created, replayed] = await Promise.all([create(), create()])
        expect(replayed).toEqual(created)
        expect(prepared).toBe(1)
        const graph = await db.catalogItem.findUniqueOrThrow({
          where: { id: created.recordId },
          include: {
            product: {
              include: {
                currentUnitConfiguration: { include: { units: true } },
              },
            },
            variants: {
              include: { offerings: { include: { storeAvailability: true } } },
            },
          },
        })
        expect(graph.kind).toBe("PRODUCT")
        expect(graph.product?.usage).toBe("FOR_SALE")
        expect(graph.product?.currentUnitConfiguration?.units).toHaveLength(1)
        expect(graph.product?.currentUnitConfiguration?.units[0]?.name).toBe(
          "Egg",
        )
        expect(graph.variants).toHaveLength(1)
        expect(graph.variants[0]?.offerings).toHaveLength(1)
        expect(graph.variants[0]?.offerings[0]?.fixedPriceMinor).toBe(15_000)
        expect(
          graph.variants[0]?.offerings[0]?.storeAvailability[0]?.storeId,
        ).toBe(scope.storeId)
        expect(
          await db.catalogItem.count({ where: { tenantId: scope.tenantId } }),
        ).toBe(1)
        const receipts = await db.catalogCommandReceipt.findMany({
          where: { tenantId: scope.tenantId },
        })
        expect(receipts).toHaveLength(1)
        expect(receipts[0]?.clientOperationId).toBe(
          `product-${conversation.id}`,
        )
        const draft = await readSetupDraft(db, conversation.setupDraft.id)
        expect(draft.entities[0]).toMatchObject({
          state: "COMMITTED",
          committedRecordId: created.recordId,
        })
        expect(
          (await readAssistantConversation(db, scope, conversation.id)).status,
        ).toBe("COMPLETED")
        expect(await create(999)).toEqual(created)
        expect(prepared).toBe(1)
        await expect(
          beginAssistantRun(db, {
            actorUserId: scope.userId,
            conversationId: conversation.id,
            model: "acceptance",
            promptVersion: "product-acceptance",
            provider: "rehearsal",
            requestId: randomUUID(),
            userMessage: {
              id: `msg_${randomUUID()}`,
              role: "user",
              parts: [{ type: "text", text: "Late turn" }],
            },
          }),
        ).rejects.toMatchObject({ code: "CONVERSATION_CLOSED" })
        await db.membership.update({
          where: {
            tenantId_userId: { tenantId: scope.tenantId, userId: scope.userId },
          },
          data: { status: "SUSPENDED" },
        })
        await expect(create()).rejects.toMatchObject({
          code: "CONVERSATION_NOT_FOUND",
        })
        expect(prepared).toBe(1)
      })
    })

    test("manual creation from a blank chat closes the same workflow and focused replay cannot duplicate it", async () => {
      await withFixture(async (fixture) => {
        const { db, scope } = fixture
        const blank = snapshot(scope.storeId)
        blank.form.name = ""
        blank.form.unitName = ""
        blank.form.price = ""
        const conversation = await createProductConversation(db, scope, {
          id: `prd_acceptance_${randomUUID()}`,
          snapshot: blank,
          seed: null,
          opening: "Tell me about the product you want to add.",
        })
        if (!conversation.setupDraft)
          throw new Error("Blank fixture has no draft")
        const draftId = conversation.setupDraft.id
        expect((await readSetupDraft(db, draftId)).entities).toHaveLength(0)
        const canonical = command(scope)
        if (canonical.kind !== "product")
          throw new Error("Fixture command must be a product")
        const baseOffering = canonical.variants[0]?.offerings[0]
        if (!baseOffering)
          throw new Error("Fixture command has no base offering")
        const name = "Reviewed manual eggs"
        const fullCommand: CreateCatalogItemInput = {
          ...canonical,
          name,
          description: "Details reviewed in the ordinary form",
          unitConfiguration: {
            ...canonical.unitConfiguration,
            units: [
              ...canonical.unitConfiguration.units,
              {
                key: "tray",
                name: "Tray",
                factor: "30",
                stockBehavior: "alternate_transaction",
                transactionScale: 2,
              },
            ],
          },
          variants: [
            {
              key: "default",
              name,
              isDefault: true,
              offerings: [
                { ...baseOffering, sku: "EGG-MANUAL" },
                {
                  key: "tray",
                  name: "Tray",
                  pricingPolicy: "fixed",
                  inventoryUnitKey: "tray",
                  fixedPriceMinor: 450_000,
                },
              ],
            },
          ],
        }
        const created = await commitProductConversation(
          db,
          scope,
          {
            conversationId: conversation.id,
            expectedRevision: 0,
            manualEntity: seed(name),
          },
          () => fullCommand,
        )
        const graph = await db.catalogItem.findUniqueOrThrow({
          where: { id: created.recordId },
          include: {
            product: {
              include: {
                currentUnitConfiguration: { include: { units: true } },
              },
            },
            variants: {
              include: {
                offerings: { include: { productUnitOffering: true } },
              },
            },
          },
        })
        expect(graph.name).toBe(name)
        expect(graph.description).toBe(fullCommand.description)
        expect(graph.product?.currentUnitConfiguration?.units).toHaveLength(2)
        expect(graph.variants[0]?.offerings).toHaveLength(2)
        expect(
          graph.variants[0]?.offerings.find(
            (offering) => offering.key === "egg",
          )?.productUnitOffering?.sku,
        ).toBe("EGG-MANUAL")
        expect(
          graph.variants[0]?.offerings.find(
            (offering) => offering.key === "tray",
          )?.fixedPriceMinor,
        ).toBe(450_000)
        expect(
          (await readAssistantConversation(db, scope, conversation.id)).status,
        ).toBe("COMPLETED")
        expect((await readSetupDraft(db, draftId)).entities[0]).toMatchObject({
          key: "product",
          state: "COMMITTED",
          committedRecordId: created.recordId,
        })
        expect(await listProductConversations(db, scope)).toEqual([])
        const focusedReplay = await commitProductConversation(
          db,
          scope,
          {
            conversationId: conversation.id,
            expectedRevision: 0,
          },
          () => {
            throw new Error("Focused replay must not prepare another product")
          },
        )
        expect(focusedReplay).toEqual(created)
        expect(
          await db.catalogItem.count({ where: { tenantId: scope.tenantId } }),
        ).toBe(1)
        expect(
          await db.catalogCommandReceipt.count({
            where: { tenantId: scope.tenantId },
          }),
        ).toBe(1)
      })
    })

    test("a late canonical command failure rolls back product graph and receipt; the saved draft can retry", async () => {
      await withFixture(async (fixture) => {
        const { db, scope } = fixture
        const conversation = await start(fixture)
        const input = { conversationId: conversation.id, expectedRevision: 0 }
        // Photo attachment validation happens after the Catalog graph writes.
        await expect(
          commitProductConversation(db, scope, input, () => ({
            ...command(scope),
            photoAssetIds: [`missing_${randomUUID()}`],
          })),
        ).rejects.toMatchObject({ code: "PHOTO_NOT_FOUND" })
        expect(
          await db.catalogItem.count({ where: { tenantId: scope.tenantId } }),
        ).toBe(0)
        expect(
          await db.catalogCommandReceipt.count({
            where: { tenantId: scope.tenantId },
          }),
        ).toBe(0)
        const draft = await readSetupDraft(db, conversation.setupDraft.id)
        expect(draft.revision).toBe(0)
        expect(draft.entities[0]).toMatchObject({
          state: "PROPOSED",
          committedRecordId: null,
        })
        expect(
          (await readAssistantConversation(db, scope, conversation.id)).status,
        ).toBe("ACTIVE")
        const created = await commitProductConversation(db, scope, input, () =>
          command(scope),
        )
        expect(
          await db.catalogItem.count({ where: { tenantId: scope.tenantId } }),
        ).toBe(1)
        expect(
          (await readSetupDraft(db, conversation.setupDraft.id)).entities[0]
            ?.committedRecordId,
        ).toBe(created.recordId)
      })
    })
  },
)
