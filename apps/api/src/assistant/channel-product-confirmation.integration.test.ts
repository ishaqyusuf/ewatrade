import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import {
  type GeneralAnswer,
  generalActionSchema,
  generalMoney,
  generalReceiptSchema,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import { appendAssistantMessage } from "@ewatrade/db/assistant"
import { disconnectAssistantWhatsApp } from "@ewatrade/db/assistant-whatsapp"
import { z } from "zod"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { generalPersistentParts } from "./general-persistence"
import { generalProposalWithReview } from "./general-proposals"
import { createGeneralTools } from "./general-tools"

// Root alone selects this guarded QA suite. No import-time connection or live provider/model.
const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-product-confirm")
beforeAll(() => fixture.setup(), 90_000)
afterAll(() => fixture.cleanup(), 90_000)

suite(
  "native simple product confirmation followed by protected saved reads",
  () => {
    test("quoted Confirm creates exact original stock once; replay and saved catalog/search answers retain scope without granting access after disconnect", async () => {
      const { db, tenantId, storeId, userId, conversationId } = fixture
      const name = `Synthetic product ${fixture.marker}`
      expect(await db.catalogItem.count({ where: { tenantId } })).toBe(0)
      const review = await fixture.stagedProposal({
        text: "Add a synthetic test product at 123.45 per Piece, opening stock 7.25 Piece; no picture",
        payload: generalActionSchema.parse({
          action: "product_create",
          name,
          canonicalUnitName: "Piece",
          priceMinor: 12345,
          openingStock: "7.25",
          illustrationId: null,
        }),
        reply: "Review this saved product draft.",
        expectedReviewText: "7.25 Piece",
      })
      const pending = await db.assistantActionProposal.findUniqueOrThrow({
        where: { id: review.source.proposalId },
      })
      const canonical = await generalProposalWithReview(
        await fixture.context(`${fixture.marker}-canonical-review`),
        pending,
      )
      expect(canonical.approvalToken).toBeTruthy()
      expect(canonical.question).toBeUndefined()
      expect(canonical.payload).toMatchObject({
        action: "product_create",
        illustrationId: null,
        openingStock: "7.25",
        priceMinor: 12345,
      })
      expect(review.body).toContain(name)
      expect(review.body).toContain(generalMoney(12345, "NGN"))
      expect(await db.catalogItem.count({ where: { tenantId } })).toBe(0)
      expect(await db.stockOperation.count({ where: { tenantId } })).toBe(0)

      const confirmed = await fixture.action(
        `Confirm ${review.confirmCode}`,
        review.providerMessageId,
      )
      expect(confirmed.inbox.content).toMatchObject({
        type: "action_result",
        resultRef: {
          proposalId: pending.id,
          revision: pending.revision,
          status: "COMPLETED",
          decision: "confirm",
        },
      })
      const completed = await db.assistantActionProposal.findUniqueOrThrow({
        where: { id: pending.id },
      })
      expect(completed.status).toBe("COMPLETED")
      const receipt = generalReceiptSchema.parse(completed.executedResult)
      if (receipt.kind !== "product")
        throw Error("Expected canonical product receipt")
      expect(receipt).toMatchObject({ title: "Product added", detail: name })
      expect(confirmed.outbox.content).toContain("Product added")
      expect(confirmed.outbox.content).toContain(name)
      const item = await db.catalogItem.findUniqueOrThrow({
        where: { id: receipt.recordId },
        include: {
          product: {
            include: { currentUnitConfiguration: { include: { units: true } } },
          },
          variants: {
            include: {
              offerings: {
                include: { storeAvailability: true, productUnitOffering: true },
              },
            },
          },
          photoAssets: true,
          illustrations: true,
        },
      })
      expect(item).toMatchObject({
        tenantId,
        name,
        kind: "PRODUCT",
        status: "ACTIVE",
      })
      expect(item.photoAssets).toHaveLength(0)
      expect(item.illustrations).toHaveLength(0)
      expect(item.variants).toHaveLength(1)
      const variant = item.variants[0]
      const product = item.product
      const configuration = product?.currentUnitConfiguration
      const unit = configuration?.units[0]
      const offering = variant?.offerings[0]
      if (!variant || !product || !configuration || !unit || !offering)
        throw Error(
          "Expected canonical simple product configuration and offering",
        )
      expect(product.usage).toBe("FOR_SALE")
      expect(configuration.status).toBe("CURRENT")
      expect(configuration.units).toHaveLength(1)
      expect(unit.name).toBe("Piece")
      expect(unit.factor.toString()).toBe("1")
      expect(unit.transactionScale).toBe(2)
      expect(variant).toMatchObject({ name, isDefault: true, status: "ACTIVE" })
      expect(variant.offerings).toHaveLength(1)
      expect(offering).toMatchObject({
        tenantId,
        status: "ACTIVE",
        fixedPriceMinor: 12345,
        currencyCode: "NGN",
        productUnitOffering: { inventoryUnitId: unit.id },
      })
      expect(offering.storeAvailability).toEqual([
        expect.objectContaining({ storeId, isAvailable: true }),
      ])
      const balance = await db.stockBalanceSource.findFirstOrThrow({
        where: {
          tenantId,
          storeId,
          productId: product.id,
          variantId: variant.id,
        },
      })
      expect(balance.inventoryUnitId).toBe(unit.id)
      expect(balance.onHandQuantity.toString()).toBe("7.25")
      expect(balance.reservedQuantity.toString()).toBe("0")
      const operation = await db.stockOperation.findUniqueOrThrow({
        where: {
          tenantId_clientOperationId: {
            tenantId,
            clientOperationId: `${pending.idempotencyKey}:opening-stock:default`,
          },
        },
        include: { movements: true },
      })
      expect(operation).toMatchObject({
        tenantId,
        storeId,
        actorUserId: userId,
        source: "catalog_setup",
        type: "OPENING_STOCK",
      })
      expect(operation.movements).toHaveLength(1)
      const movement = operation.movements[0]
      if (!movement) throw Error("Expected original canonical opening movement")
      expect(movement).toMatchObject({
        balanceSourceId: balance.id,
        configurationVersionId: configuration.id,
        enteredInventoryUnitId: unit.id,
        transactionScaleSnapshot: 2,
      })
      expect(movement.enteredQuantity.toString()).toBe("7.25")
      expect(movement.signedCanonicalEffect.toString()).toBe("7.25")
      expect(movement.previousOnHandQuantity.toString()).toBe("0")
      expect(movement.resultingOnHandQuantity.toString()).toBe("7.25")
      expect(movement.unitCostMinorSnapshot).toBeNull()
      const command = await db.catalogCommandReceipt.findUniqueOrThrow({
        where: {
          tenantId_clientOperationId: {
            tenantId,
            clientOperationId: pending.idempotencyKey,
          },
        },
      })
      expect(command).toMatchObject({
        catalogItemId: item.id,
        storeId,
        commandType: "CREATE_CATALOG_ITEM",
      })
      const snapshot = async () => ({
        items: await db.catalogItem.count({ where: { tenantId } }),
        sources: await db.stockBalanceSource.count({ where: { tenantId } }),
        operations: await db.stockOperation.count({ where: { tenantId } }),
        movements: await db.stockMovement.count({
          where: { operation: { tenantId } },
        }),
        commands: await db.catalogCommandReceipt.count({ where: { tenantId } }),
        runs: await db.assistantRun.count({ where: { conversationId } }),
      })
      const beforeReplay = await snapshot()
      expect(beforeReplay).toEqual({
        items: 1,
        sources: 1,
        operations: 1,
        movements: 1,
        commands: 1,
        runs: 1,
      })
      const replay = await fixture.action(
        `Confirm ${review.confirmCode}`,
        review.providerMessageId,
      )
      expect(replay.inbox.id).not.toBe(confirmed.inbox.id)
      expect(replay.inbox.content).toEqual(confirmed.inbox.content)
      expect(replay.outbox.content).toBe(confirmed.outbox.content)
      expect(await snapshot()).toEqual(beforeReplay)
      expect(
        await db.assistantWhatsAppActionReview.findUniqueOrThrow({
          where: { id: review.proof.id },
        }),
      ).toMatchObject({
        state: "CONSUMED",
        decision: "confirm",
        consumedByIngressId: confirmed.inbox.id,
      })
      await fixture.assertNoStoredDecisionCodes()

      const ctx = await fixture.context(`${fixture.marker}-protected-reads`)
      expect(ctx.session.session).toBeNull()
      const answers: GeneralAnswer[] = []
      const tools = createGeneralTools(
        ctx,
        conversationId,
        () => {},
        (answer) => answers.push(answer),
      )
      const readItem = tools.readCatalogItem?.execute
      const readStock = tools.readOfferingStock?.execute
      const search = tools.searchRecords?.execute
      if (!readItem || !readStock || !search)
        throw Error("Expected eligible canonical catalog/search/stock tools")
      const read = z
        .object({
          status: z.literal("available"),
          storeId: z.string(),
          data: z.object({ id: z.string(), name: z.string() }),
        })
        .parse(
          await readItem(
            { itemId: item.id },
            { toolCallId: "product-read", messages: [] },
          ),
        )
      expect(read).toMatchObject({ storeId, data: { id: item.id, name } })
      const stock = z
        .object({
          status: z.literal("available"),
          data: z.object({
            availableOfferingQuantity: z.string(),
            offeringUnitName: z.string(),
          }),
        })
        .parse(
          await readStock(
            { offeringId: offering.id },
            { toolCallId: "product-stock", messages: [] },
          ),
        )
      expect(stock.data).toMatchObject({
        availableOfferingQuantity: "7.25",
        offeringUnitName: "Piece",
      })
      const searched = z
        .object({
          status: z.literal("available"),
          data: z.array(
            z.object({
              type: z.string(),
              catalogItemId: z.string().optional(),
            }),
          ),
        })
        .parse(
          await search(
            { query: name },
            { toolCallId: "product-search", messages: [] },
          ),
        )
      expect(searched.data).toEqual([
        expect.objectContaining({
          type: "catalog_item",
          catalogItemId: item.id,
        }),
      ])
      const scope = { tenantId, storeId }
      const target = {
        kind: "catalog_item",
        catalogItemId: item.id,
        origin: scope,
      }
      expect(
        answers.some(
          (answer) =>
            answer.target?.kind === "catalog_item" &&
            answer.target.catalogItemId === item.id,
        ),
      ).toBe(true)
      expect(answers.find((answer) => answer.records)?.records?.rows).toEqual([
        expect.objectContaining({ type: "catalog_item", title: name, target }),
      ])
      // The marker also occurs in the actual synthetic Owner's saved email.
      // Exercise ambiguity without extra records, writes or guessed catalog matches.
      const ambiguous = z
        .object({
          status: z.literal("available"),
          data: z.array(
            z.object({
              type: z.string(),
              catalogItemId: z.string().optional(),
              staffUserId: z.string().optional(),
            }),
          ),
        })
        .parse(
          await search(
            { query: fixture.marker },
            { toolCallId: "product-ambiguous-search", messages: [] },
          ),
        )
      expect(ambiguous.data).toHaveLength(2)
      expect(ambiguous.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "catalog_item",
            catalogItemId: item.id,
          }),
          expect.objectContaining({ type: "staff", staffUserId: userId }),
        ]),
      )
      expect(
        answers.find((answer) => answer.records?.rows.length === 2)?.detail,
      ).toContain("ask which saved record the user means before choosing one")
      const parts = generalPersistentParts(
        answers.map((data) => ({ type: "data-general-answer", data })),
      )
      const messageId = `${fixture.marker}-saved-reads`
      await db.$transaction((tx) =>
        appendAssistantMessage(tx, {
          conversationId,
          message: {
            id: messageId,
            role: "assistant",
            parts: z.array(z.json()).parse(parts),
          },
        }),
      )
      const saved = await db.assistantMessage.findUniqueOrThrow({
        where: { id: messageId },
      })
      const savedParts = z.array(generalStoredPartSchema).parse(saved.parts)
      const options = {
        trustedAppOrigin: "https://dash.ewatrade.com",
        currentScope: scope,
        scopeLabel: `${ctx.tenantContext.tenant.name} · ${ctx.tenantContext.activeStore?.name ?? "Store"}`,
        conversation: {
          conversationId,
          purpose: "GENERAL" as const,
          origin: scope,
        },
      }
      const rendered = renderWhatsAppFinalReply(savedParts, options)
      expect(rendered.kind).toBe("reply")
      const body = rendered.chunks.join("\n")
      expect(body).toContain(generalMoney(12345, "NGN"))
      expect(body).toContain("7.25 Piece")
      expect(body).toContain(
        `https://dash.ewatrade.com/sales?catalogDetail=${encodeURIComponent(item.id)}`,
      )
      expect(body).toContain(
        `/assistant/c/${encodeURIComponent(conversationId)}`,
      )
      expect(body).toContain("Select the original business and Store")
      expect(body).toContain("Limited page, not a total")
      expect(body).toContain("ask which saved record the user means")
      const mismatch = renderWhatsAppFinalReply(savedParts, {
        ...options,
        currentScope: { tenantId, storeId: `${fixture.marker}-other-store` },
      }).chunks.join("\n")
      expect(mismatch).not.toContain("/sales?catalogDetail=")
      expect(mismatch).not.toContain("/assistant/c/")
      expect(
        await disconnectAssistantWhatsApp(db, {
          phoneNumberId: fixture.principal.phoneNumberId,
          senderId: fixture.principal.senderId,
        }),
      ).toEqual({ disconnected: true })
      expect(
        await readItem(
          { itemId: item.id },
          { toolCallId: "product-after-revoke", messages: [] },
        ),
      ).toMatchObject({ status: "unavailable" })
      expect(await snapshot()).toEqual(beforeReplay)
      expect(await db.financeBook.count({ where: { tenantId } })).toBe(0)
    }, 240_000)
  },
)
