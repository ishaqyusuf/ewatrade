import { verifyOrderReplacementPreview } from "./general-order-replacement.integration-check"
import { verifyOrderMetadataAmendment } from "./general-order-metadata.integration-check"
import { verifyStockTransferComposition } from "./general-stock-transfer.integration-check"
import { verifyStockAdjustmentComposition } from "./general-stock-adjustment.integration-check"
import { verifyStockCountComposition } from "./general-stock-count.integration-check"
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  beginAssistantRunInTransaction,
  completeAssistantRun,
} from "@ewatrade/db/assistant"
import {
  readGeneralActiveRun,
  readGeneralProposals,
  startGeneralConversation,
} from "@ewatrade/db/assistant-general"
import {
  getActiveTenantForUser,
  getConfiguredCatalogOfferingAvailability,
} from "@ewatrade/db/queries"
import type { Prisma, PrismaClient } from "@ewatrade/db/types"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import { OpenAPIHono } from "@hono/zod-openapi"
import { resolveModel } from "./chat-route"
import { generalBudgetScopeKey } from "./general-allowance"
import {
  verifyAvailabilityCommand,
  verifyAvailabilityProposal,
} from "./general-availability-command.integration-check"
import { verifyOrderCancellation } from "./general-order-cancellation.integration-check"
import { verifyCloseoutComposition } from "./general-closeout.integration-check"
import { verifyCatalogPages } from "./general-catalog-page.integration-check"
import { registerGeneralAssistantChatRoutes } from "./general-chat-route"
import type { GeneralContext } from "./general-context"
import { verifyDirectoryCounts } from "./general-counts.integration-check"
import { verifyLowStock } from "./general-low-stock.integration-check"
import { verifyCatalogItemScope } from "./general-catalog-item.integration-check"
import { verifyReceivables } from "./general-receivables.integration-check"
import { verifyOpenOrderPages } from "./general-open-order.integration-check"
import { verifyOrderContactCount } from "./general-order-contact-count.integration-check"
import { verifyOperationalOrderSummary } from "./general-order-summary.integration-check"
import { verifyStockReceiptComposition } from "./general-stock-receipt.integration-check"
import { verifySalePayment } from "./general-sale-payment.integration-check"
import { verifyPricingMatrix } from "./general-pricing-matrix.integration-check"
import { verifyGeneralProductDetails } from "./general-product-details.integration-check"
import { verifyGeneralPriceUpdate } from "./general-product-price.integration-check"
import { verifyGeneralProductTransport } from "./general-product-transport.integration-check"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  editGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"
import { verifyUnitCommands } from "./general-unit-command.integration-check"
import { verifyUnitProposals } from "./general-unit-proposal.integration-check"
const enabled = process.env.RUN_GENERAL_ASSISTANT_INTEGRATION === "1"
if (enabled) setDefaultTimeout(600_000)
;(enabled ? describe : describe.skip)(
  "General proposals on isolated Development",
  () => {
    test("exact review, atomic receipt rollback, replay, expiry, edits, cancellation and revocation", async () => {
      if (
        process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
        ![
          "/ewatrade_general_assistant_20261009",
          "/ewatrade_general_assistant_main_20261009",
        ].includes(new URL(process.env.EWATRADE_DATABASE_URL ?? "").pathname)
      )
        throw Error("Isolated Development target required")
      const { prisma: db } = await import("@ewatrade/db")
      const [actual] = await db.$queryRaw<
        Array<{ database: string }>
      >`SELECT current_database() AS database`
      if (
        actual?.database !==
        new URL(process.env.EWATRADE_DATABASE_URL ?? "").pathname.slice(1)
      )
        throw Error(
          "Runtime database does not match the verified isolated target",
        )
      const marker = randomUUID()
      console.info(`General proposal QA run: ${marker}`)
      let tenantId: string | undefined
      let userId: string | undefined
      try {
        const user = await db.user.create({
          data: {
            email: `general-${marker}@example.invalid`,
            name: "General proposal QA",
            ageBand: "ADULT",
          },
        })
        userId = user.id
        // Catalog writes require the effective Terms outside local/preview.
        const terms = currentEffectiveLegalPublication()
        if (terms)
          await db.legalAcceptance.create({
            data: {
              userId: user.id,
              version: terms.version,
              documentHash: terms.documentHash,
              surface: "general-assistant-integration",
            },
          })
        const tenant = await db.tenant.create({
          data: {
            slug: `general-${marker}`,
            name: "General proposal QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantId = tenant.id
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "QA Store",
            slug: "qa",
            status: "ACTIVE",
          },
        })
        const session = await db.session.create({
          data: {
            userId: user.id,
            token: `general-${marker}`,
            expiresAt: new Date(Date.now() + 60 * 60_000),
          },
        })
        const tenantContext = await getActiveTenantForUser(db, {
          userId: user.id,
          tenantSlug: tenant.slug,
          storeId: store.id,
        })
        if (!tenantContext) throw Error("Fixture context missing")
        const ctx: GeneralContext = {
          db,
          session: { session, user },
          tenantContext,
          tenantSlug: tenant.slug,
          tenantId: tenant.id,
          activeStoreId: store.id,
          requestHeaders: new Headers(),
          requestId: marker,
          cfRay: null,
          isInternalRequest: false,
          forcePrimary: false,
          origin: null,
          clientIp: null,
          privacyClientIp: null,
          userAgent: null,
          qaSessionScope: null,
        }
        const scope = {
          tenantId: tenant.id,
          storeId: store.id,
          userId: user.id,
        }
        if (process.env.RUN_GENERAL_ORDER_REPLACEMENT === "1") {
          await verifyOrderReplacementPreview(ctx)
          return
        }
        if (process.env.RUN_GENERAL_ORDER_METADATA === "1") {
          await verifyOrderMetadataAmendment(ctx)
          return
        }
        if (process.env.RUN_GENERAL_ORDER_CANCELLATION === "1") {
          await verifyOrderCancellation(ctx)
          return
        }
        if (process.env.RUN_GENERAL_CATALOG_SCOPE === "1" || process.env.RUN_GENERAL_CATALOG_HISTORY === "1") {
          await verifyCatalogItemScope(ctx)
          return
        }
        if (process.env.RUN_GENERAL_RECEIVABLES === "1") {
          await verifyReceivables(ctx)
          return
        }
        if (process.env.RUN_GENERAL_ORDER_CONTACT_COUNT === "1") {
          await verifyOrderContactCount(ctx)
          return
        }
        if (process.env.RUN_GENERAL_OPEN_ORDER === "1") {
          await verifyOpenOrderPages(ctx)
          return
        }
        if (process.env.RUN_GENERAL_CATALOG_PAGE === "1") {
          await verifyCatalogPages(ctx)
          return
        }
        if (process.env.RUN_GENERAL_LOOKUPS === "1") {
          await verifyDirectoryCounts(ctx)
          await verifyOperationalOrderSummary(ctx)
          return
        }
        if (process.env.RUN_GENERAL_COUNTS === "1") {
          await verifyDirectoryCounts(ctx)
          return
        }
        if (process.env.RUN_GENERAL_LOW_STOCK === "1" || process.env.RUN_GENERAL_BALANCE_PAGE === "1") {
          await verifyLowStock(ctx)
          return
        }
        if (process.env.RUN_GENERAL_ORDER_SUMMARY === "1") {
          await verifyOperationalOrderSummary(ctx)
          return
        }
        if (process.env.RUN_GENERAL_PRICING_MATRIX === "1") {
          await verifyPricingMatrix(ctx)
          return
        }
        if (process.env.RUN_GENERAL_UNIT_COMMAND === "1") {
          await verifyUnitCommands(ctx)
          await verifyUnitProposals(ctx)
          return
        }
        if (process.env.RUN_GENERAL_AVAILABILITY_COMMAND === "1") {
          await verifyAvailabilityCommand(ctx)
          await verifyAvailabilityProposal(ctx)
          return
        }
        if (process.env.RUN_GENERAL_PRODUCT_TRANSPORT === "1") {
          await verifyGeneralProductTransport(ctx, session.token)
          return
        }
        if (
          process.env.RUN_GENERAL_STOCK_TRANSFER === "1" &&
          process.env.RUN_GENERAL_STOCK_TRANSFER_PROBE === "1"
        ) {
          console.info("Transfer diagnostic only: API transport acceptance skipped")
        } else {
          await verifyGeneralTransport(ctx, session.token)
        }
        const conversation = await startGeneralConversation(db, scope)
        const drafted = await draftGeneralProposal(ctx, conversation.id, {
          action: "customer_create",
          name: "Atomic customer",
        })
        expect(JSON.stringify(drafted)).not.toContain("approvalToken")
        expect(
          await db.customer.count({ where: { tenantId: tenant.id } }),
        ).toBe(0)
        const [row] = await readGeneralProposals(db, scope, conversation.id)
        if (!row) throw Error("Proposal missing")
        const app = generalProposalForApp(row)
        expect(app.approvalToken).toBeTruthy()
        const command = {
          proposalId: app.id,
          revision: app.revision,
          decision: "confirm" as const,
          approvalToken: app.approvalToken,
        }
        // Inject failure after the domain write, immediately before proposal receipt.
        const failingDb = new Proxy(db, {
          get(target, property) {
            if (property === "$transaction")
              return (
                operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
                options: unknown,
              ) =>
                target.$transaction(
                  async (tx) =>
                    operation(
                      new Proxy(tx, {
                        get(txTarget, key) {
                          if (key === "assistantActionProposal")
                            return new Proxy(txTarget.assistantActionProposal, {
                              get(delegate, method) {
                                if (method === "update")
                                  return async (args: {
                                    data?: { status?: string }
                                  }) => {
                                    if (args.data?.status === "COMPLETED")
                                      throw Error("Injected receipt failure")
                                    return delegate.update(
                                      args as Parameters<
                                        typeof delegate.update
                                      >[0],
                                    )
                                  }
                                const value = Reflect.get(delegate, method)
                                return typeof value === "function"
                                  ? value.bind(delegate)
                                  : value
                              },
                            })
                          const value = Reflect.get(txTarget, key)
                          return typeof value === "function"
                            ? value.bind(txTarget)
                            : value
                        },
                      }),
                    ),
                  options as NonNullable<
                    Parameters<PrismaClient["$transaction"]>[1]
                  >,
                )
            const value = Reflect.get(target, property)
            return typeof value === "function" ? value.bind(target) : value
          },
        }) as PrismaClient
        if (process.env.RUN_GENERAL_STOCK_TRANSFER === "1") {
          await verifyStockTransferComposition(ctx, failingDb, conversation.id)
          return
        }
        if (process.env.RUN_GENERAL_STOCK_ADJUSTMENT === "1") {
          await verifyStockAdjustmentComposition(ctx, failingDb, conversation.id)
          return
        }
        if (process.env.RUN_GENERAL_CLOSEOUT === "1") {
          await verifyCloseoutComposition(ctx, failingDb, conversation.id)
          return
        }
        if (process.env.RUN_GENERAL_STOCK_COUNT === "1") {
          await verifyStockCountComposition(ctx, failingDb, conversation.id)
          return
        }
        if (process.env.RUN_GENERAL_STOCK_RECEIPT === "1") {
          await verifyStockReceiptComposition(ctx, failingDb, conversation.id)
          return
        }
        if (process.env.RUN_GENERAL_SALE_PAYMENT === "1") {
          await verifySalePayment(ctx, failingDb, conversation.id)
          return
        }
        await expect(
          decideGeneralProposal({ ...ctx, db: failingDb }, command),
        ).rejects.toThrow("Injected receipt failure")
        expect(
          await db.customer.count({ where: { tenantId: tenant.id } }),
        ).toBe(0)
        expect(
          (
            await db.assistantActionProposal.findUniqueOrThrow({
              where: { id: app.id },
            })
          ).status,
        ).toBe("PENDING")
        const result = await decideGeneralProposal(ctx, command)
        expect(result.receipt?.kind).toBe("customer")
        expect(await decideGeneralProposal(ctx, command)).toEqual(result)
        expect(
          await db.customer.count({ where: { tenantId: tenant.id } }),
        ).toBe(1)
        const second = await draftGeneralProposal(ctx, conversation.id, {
          action: "customer_create",
          name: "Edited customer",
        })
        const secondRow = await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: second.proposalId },
        })
        const old = generalProposalForApp(secondRow)
        const edited = await editGeneralProposal(ctx, {
          proposalId: old.id,
          revision: old.revision,
          payload: { action: "customer_create", name: "Updated customer" },
        })
        expect(edited.revision).toBe(old.revision + 1)
        expect(edited.approvalToken).not.toBe(old.approvalToken)
        await expect(
          decideGeneralProposal(ctx, {
            proposalId: old.id,
            revision: edited.revision,
            decision: "confirm",
            approvalToken: old.approvalToken,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        await decideGeneralProposal(ctx, {
          proposalId: edited.id,
          revision: edited.revision,
          decision: "cancel",
        })
        await expect(
          decideGeneralProposal(ctx, {
            proposalId: edited.id,
            revision: edited.revision,
            decision: "confirm",
            approvalToken: edited.approvalToken,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        const third = await draftGeneralProposal(ctx, conversation.id, {
          action: "customer_create",
          name: "Expired customer",
        })
        const thirdRow = await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: third.proposalId },
        })
        const beforeExpiry = generalProposalForApp(thirdRow)
        await db.assistantActionProposal.update({
          where: { id: thirdRow.id },
          data: { expiresAt: new Date(Date.now() - 1) },
        })
        await expect(
          decideGeneralProposal(ctx, {
            proposalId: thirdRow.id,
            revision: 1,
            decision: "confirm",
            approvalToken: beforeExpiry.approvalToken,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(
          await db.customer.count({ where: { tenantId: tenant.id } }),
        ).toBe(1)
        const concurrentDraft = await draftGeneralProposal(
          ctx,
          conversation.id,
          { action: "customer_create", name: "Concurrent customer" },
        )
        const concurrentApp = generalProposalForApp(
          await db.assistantActionProposal.findUniqueOrThrow({
            where: { id: concurrentDraft.proposalId },
          }),
        )
        const concurrentCommand = {
          proposalId: concurrentApp.id,
          revision: 1,
          decision: "confirm" as const,
          approvalToken: concurrentApp.approvalToken,
        }
        const concurrentResults = await Promise.all([
          decideGeneralProposal(ctx, concurrentCommand),
          decideGeneralProposal(ctx, concurrentCommand),
        ])
        expect(concurrentResults[0]?.receipt).toEqual(
          concurrentResults[1]?.receipt,
        )
        expect(
          await db.customer.count({
            where: { tenantId: tenant.id, name: "Concurrent customer" },
          }),
        ).toBe(1)
        const productDraft = await draftGeneralProposal(ctx, conversation.id, {
          action: "product_create",
          name: "QA Rice",
          canonicalUnitName: "bag",
          priceMinor: 2500,
        })
        const productApp = generalProposalForApp(
          await db.assistantActionProposal.findUniqueOrThrow({
            where: { id: productDraft.proposalId },
          }),
        )
        const productCommand = {
          proposalId: productApp.id,
          revision: 1,
          decision: "confirm" as const,
          approvalToken: productApp.approvalToken,
        }
        await expect(
          decideGeneralProposal({ ...ctx, db: failingDb }, productCommand),
        ).rejects.toThrow("Injected receipt failure")
        expect(
          await db.catalogItem.count({ where: { tenantId: tenant.id } }),
        ).toBe(0)
        const productResult = await decideGeneralProposal(ctx, productCommand)
        expect(productResult.receipt?.kind).toBe("product")
        expect(
          (await decideGeneralProposal(ctx, productCommand)).receipt,
        ).toEqual(productResult.receipt)
        expect(
          await db.catalogItem.count({ where: { tenantId: tenant.id } }),
        ).toBe(1)
        const offering = await db.sellableOffering.findFirstOrThrow({
          include: {
            productUnitOffering: { include: { inventoryUnit: true } },
          },
          where: {
            tenantId: tenant.id,
            catalogItemId: productResult.receipt?.recordId,
          },
        })
        const beforeStockRead = await db.stockBalanceSource.count({
          where: { tenantId: tenant.id },
        })
        await getConfiguredCatalogOfferingAvailability(db, {
          tenantId: tenant.id,
          storeId: store.id,
          offeringId: offering.id,
        }).catch(() => null)
        expect(
          await db.stockBalanceSource.count({ where: { tenantId: tenant.id } }),
        ).toBe(beforeStockRead)
        const unit = offering.productUnitOffering?.inventoryUnit
        if (!unit) throw Error("Product unit fixture missing")
        const product = await db.catalogProduct.findUniqueOrThrow({
          where: { catalogItemId: productResult.receipt?.recordId },
        })
        // Seed only this new QA fixture; proposal execution still uses stock checks.
        const balanceKey = {
          storeId: store.id,
          variantId: offering.variantId,
          inventoryUnitId: unit.id,
          custodyType: "STORE" as const,
          custodyReferenceId: "",
        }
        await db.stockBalanceSource.upsert({
          where: {
            storeId_variantId_inventoryUnitId_custodyType_custodyReferenceId:
              balanceKey,
          },
          create: {
            ...balanceKey,
            tenantId: tenant.id,
            productId: product.id,
            kind: "SHARED_POOL",
            onHandQuantity: "10",
          },
          update: { onHandQuantity: "10" },
        })
        const orderDraft = await draftGeneralProposal(ctx, conversation.id, {
          action: "order_create",
          lines: [
            {
              offeringId: offering.id,
              quantity: "2",
              expectedFixedPriceMinor: 2500,
              expectedConfigurationVersionId:
                offering.productUnitOffering?.inventoryUnit
                  .configurationVersionId,
            },
          ],
        })
        const orderApp = generalProposalForApp(
          await db.assistantActionProposal.findUniqueOrThrow({
            where: { id: orderDraft.proposalId },
          }),
        )
        const orderCommand = {
          proposalId: orderApp.id,
          revision: 1,
          decision: "confirm" as const,
          approvalToken: orderApp.approvalToken,
        }
        await expect(
          decideGeneralProposal({ ...ctx, db: failingDb }, orderCommand),
        ).rejects.toThrow("Injected receipt failure")
        expect(
          await db.commercialOrder.count({ where: { tenantId: tenant.id } }),
        ).toBe(0)
        const orderResult = await decideGeneralProposal(ctx, orderCommand)
        expect(orderResult.receipt?.kind).toBe("order")
        expect(
          (await decideGeneralProposal(ctx, orderCommand)).receipt,
        ).toEqual(orderResult.receipt)
        expect(
          await db.commercialOrder.count({ where: { tenantId: tenant.id } }),
        ).toBe(1)
        const paymentDraft = await draftGeneralProposal(ctx, conversation.id, {
          action: "payment_record",
          orderId: orderResult.receipt?.recordId,
          amountMinor: 1000,
          method: "cash",
        })
        const paymentApp = generalProposalForApp(
          await db.assistantActionProposal.findUniqueOrThrow({
            where: { id: paymentDraft.proposalId },
          }),
        )
        const paymentCommand = {
          proposalId: paymentApp.id,
          revision: 1,
          decision: "confirm" as const,
          approvalToken: paymentApp.approvalToken,
        }
        await expect(
          decideGeneralProposal({ ...ctx, db: failingDb }, paymentCommand),
        ).rejects.toThrow("Injected receipt failure")
        expect(
          (
            await db.commercialOrder.findUniqueOrThrow({
              where: { id: orderResult.receipt?.recordId },
            })
          ).amountPaidMinor,
        ).toBe(0)
        const paymentResult = await decideGeneralProposal(ctx, paymentCommand)
        expect(paymentResult.receipt?.kind).toBe("payment")
        expect(
          (await decideGeneralProposal(ctx, paymentCommand)).receipt,
        ).toEqual(paymentResult.receipt)
        expect(
          (
            await db.commercialOrder.findUniqueOrThrow({
              where: { id: orderResult.receipt?.recordId },
            })
          ).amountPaidMinor,
        ).toBe(1000)
        const staleDraft = await draftGeneralProposal(ctx, conversation.id, {
          action: "payment_record",
          orderId: orderResult.receipt?.recordId,
          amountMinor: 500,
          method: "cash",
        })
        const staleApp = generalProposalForApp(
          await db.assistantActionProposal.findUniqueOrThrow({
            where: { id: staleDraft.proposalId },
          }),
        )
        const otherDraft = await draftGeneralProposal(ctx, conversation.id, {
          action: "payment_record",
          orderId: orderResult.receipt?.recordId,
          amountMinor: 500,
          method: "cash",
        })
        const otherApp = generalProposalForApp(
          await db.assistantActionProposal.findUniqueOrThrow({
            where: { id: otherDraft.proposalId },
          }),
        )
        await decideGeneralProposal(ctx, {
          proposalId: otherApp.id,
          revision: 1,
          decision: "confirm",
          approvalToken: otherApp.approvalToken,
        })
        await expect(
          decideGeneralProposal(ctx, {
            proposalId: staleApp.id,
            revision: 1,
            decision: "confirm",
            approvalToken: staleApp.approvalToken,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(
          (
            await db.commercialOrder.findUniqueOrThrow({
              where: { id: orderResult.receipt?.recordId },
            })
          ).amountPaidMinor,
        ).toBe(1500)
        if (!orderResult.receipt) throw Error("Order receipt missing")
        await verifyGeneralPriceUpdate(
          ctx,
          failingDb,
          conversation.id,
          offering.id,
          orderResult.receipt.recordId,
        )
        await verifyGeneralProductDetails(
          ctx,
          failingDb,
          conversation.id,
          offering.id,
          orderResult.receipt.recordId,
        )
        // B01: customer updates are revision-bound, diffed and never rewrite orders.
        const atomic = await db.customer.findFirstOrThrow({
          where: { tenantId: tenant.id, name: "Atomic customer" },
        })
        // A same-name customer must not be confused with the target by ID.
        await db.customer.create({
          data: {
            tenantId: tenant.id,
            name: "Atomic customer",
            phone: "+2348000000002",
            normalizedPhone: "+2348000000002",
          },
        })
        await db.commercialOrder.update({
          where: { id: orderResult.receipt?.recordId },
          data: { customerId: atomic.id, customerName: "Atomic customer" },
        })
        await expect(
          draftGeneralProposal(ctx, conversation.id, {
            action: "customer_update",
            customerId: atomic.id,
            name: "Atomic customer",
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        const renamePayload = {
          action: "customer_update" as const,
          customerId: atomic.id,
          name: "Atomic Customer Ltd",
          phone: "+2348000000001",
        }
        const renameDraft = await draftGeneralProposal(
          ctx,
          conversation.id,
          renamePayload,
        )
        const renameRow = await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: renameDraft.proposalId },
        })
        expect(
          (await generalProposalWithReview(ctx, renameRow)).review,
        ).toContain("Name: Atomic customer → Atomic Customer Ltd")
        const renameApp = generalProposalForApp(renameRow)
        // Another edit lands between review and Confirm.
        await db.customer.update({
          where: { id: atomic.id },
          data: {
            email: "atomic@example.invalid",
            normalizedEmail: "atomic@example.invalid",
          },
        })
        await expect(
          decideGeneralProposal(ctx, {
            proposalId: renameApp.id,
            revision: renameApp.revision,
            decision: "confirm",
            approvalToken: renameApp.approvalToken,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        const renewed = await editGeneralProposal(ctx, {
          proposalId: renameApp.id,
          revision: renameApp.revision,
          payload: renamePayload,
        })
        const renamed = await decideGeneralProposal(ctx, {
          proposalId: renewed.id,
          revision: renewed.revision,
          decision: "confirm",
          approvalToken: renewed.approvalToken,
        })
        expect(renamed.receipt?.title).toBe("Customer updated")
        expect(
          await db.customer.findUniqueOrThrow({
            where: { id: atomic.id },
            select: { name: true, phone: true, email: true },
          }),
        ).toEqual({
          name: "Atomic Customer Ltd",
          phone: "+2348000000001",
          email: "atomic@example.invalid",
        })
        expect(
          (
            await db.commercialOrder.findUniqueOrThrow({
              where: { id: orderResult.receipt?.recordId },
            })
          ).customerName,
        ).toBe("Atomic customer")
        const duplicateDraft = await draftGeneralProposal(
          ctx,
          conversation.id,
          {
            action: "customer_update",
            customerId: atomic.id,
            phone: "+2348000000002",
          },
        )
        const duplicateApp = generalProposalForApp(
          await db.assistantActionProposal.findUniqueOrThrow({
            where: { id: duplicateDraft.proposalId },
          }),
        )
        await expect(
          decideGeneralProposal(ctx, {
            proposalId: duplicateApp.id,
            revision: duplicateApp.revision,
            decision: "confirm",
            approvalToken: duplicateApp.approvalToken,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        const racing = await Promise.all(
          ["Racer one", "Racer two"].map(async (name) =>
            generalProposalForApp(
              await db.assistantActionProposal.findUniqueOrThrow({
                where: {
                  id: (
                    await draftGeneralProposal(ctx, conversation.id, {
                      action: "customer_update",
                      customerId: atomic.id,
                      name,
                    })
                  ).proposalId,
                },
              }),
            ),
          ),
        )
        const raced = await Promise.allSettled(
          racing.map((proposal) =>
            decideGeneralProposal(ctx, {
              proposalId: proposal.id,
              revision: proposal.revision,
              decision: "confirm",
              approvalToken: proposal.approvalToken,
            }),
          ),
        )
        expect(raced.filter((r) => r.status === "fulfilled")).toHaveLength(1)
        expect(raced.filter((r) => r.status === "rejected")).toHaveLength(1)
        await db.membership.update({
          where: { id: tenantContext.membership.id },
          data: { role: "CASHIER" },
        })
        await expect(
          draftGeneralProposal(ctx, conversation.id, {
            action: "customer_create",
            name: "Rep blocked",
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" })
        await expect(decideGeneralProposal(ctx, command)).rejects.toMatchObject(
          { code: "FORBIDDEN" },
        )
        await db.membership.update({
          where: { id: tenantContext.membership.id },
          data: { status: "REMOVED" },
        })
        await expect(decideGeneralProposal(ctx, command)).rejects.toMatchObject(
          { code: "FORBIDDEN" },
        )
        expect(
          await db.customer.count({ where: { tenantId: tenant.id } }),
        ).toBe(3)
      } finally {
        if (tenantId)
          await db.$transaction(
            async (tx) => {
              const owned = await tx.tenant.findFirst({
                where: {
                  id: tenantId,
                  dataClassification: "QA",
                  slug: `general-${marker}`,
                },
                select: { id: true },
              })
              if (!owned) throw Error("Refusing unowned fixture cleanup")
              // Reservations and order lines restrict deletion of their catalog
              // references. Remove this fixture's orders before cascading its tenant.
              await tx.stockReservation.deleteMany({
                where: { tenantId: owned.id },
              })
              await tx.commercialOrderAmendment.deleteMany({ where: { tenantId: owned.id } })
              await tx.commercialOrder.deleteMany({
                where: { tenantId: owned.id },
              })
              await tx.inventoryCloseout.deleteMany({ where: { tenantId: owned.id } })
              await tx.stockCount.deleteMany({ where: { tenantId: owned.id } })
              await tx.stockTransfer.deleteMany({ where: { tenantId: owned.id } })
              await tx.stockMovement.deleteMany({ where: { operation: { tenantId: owned.id } } })
              await tx.stockOperation.deleteMany({ where: { tenantId: owned.id } })
              await tx.assistantBudget.deleteMany({
                where: {
                  scopeKey: { startsWith: `assistant:${owned.id}:GENERAL:` },
                },
              })
              await tx.tenant.delete({ where: { id: owned.id } })
            },
            { timeout: 30_000 },
          )
        if (userId)
          await db.user.deleteMany({
            where: { id: userId, email: `general-${marker}@example.invalid` },
          })
        console.info(`General proposal ${marker}: owned fixture cleanup complete`)
        await db.$disconnect()
      }
    })
  },
)

async function verifyGeneralTransport(ctx: GeneralContext, token: string) {
  const { db, tenantId, activeStoreId, tenantSlug } = ctx
  if (!tenantId || !activeStoreId || !tenantSlug)
    throw Error("Fixture scope required")
  const scope = {
    tenantId,
    storeId: activeStoreId,
    userId: ctx.session.user.id,
  }
  // This guard runs before HTTP admission: the suite must never spend provider money.
  const model = await resolveModel(db, "QA", "GENERAL")
  if (!model?.rehearsal) throw Error("Provider-free model required")
  const app = new OpenAPIHono()
  registerGeneralAssistantChatRoutes(app)
  const otherStore = await db.store.create({
    data: {
      tenantId,
      name: "QA Other Store",
      slug: "qa-other",
      status: "ACTIVE",
    },
  })
  const conversation = await startGeneralConversation(db, scope)
  const headers = {
    authorization: `Bearer ${token}`,
    "x-tenant-slug": tenantSlug,
    "x-store-id": activeStoreId,
    "content-type": "application/json",
  }
  const body = {
    conversationId: conversation.id,
    requestId: randomUUID(),
    message: {
      id: randomUUID(),
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    },
  }
  const post = (value: unknown) =>
    app.request("/api/assistant/general/chat", {
      method: "POST",
      headers,
      body: JSON.stringify(value),
    })
  const response = await post(body)
  expect(response.status).toBe(200)
  expect(await response.text()).toContain("data-general-run")
  const run = await db.assistantRun.findUniqueOrThrow({
    where: {
      actorUserId_requestId: {
        actorUserId: scope.userId,
        requestId: body.requestId,
      },
    },
  })
  expect(run.status).toBe("COMPLETED")
  expect(run.provider).toBe("ewatrade-rehearsal")
  expect(await db.assistantUsageEvent.count({ where: { runId: run.id } })).toBe(
    1,
  )
  const budgetKey = generalBudgetScopeKey(scope)
  const budget = await db.assistantBudget.findUniqueOrThrow({
    where: { scopeKey: budgetKey },
  })
  expect(budget.requests).toBe(1)
  expect((await post(body)).status).toBe(409)
  expect(
    await db.assistantMessage.count({
      where: { conversationId: conversation.id },
    }),
  ).toBe(2)
  expect(
    (
      await db.assistantBudget.findUniqueOrThrow({
        where: { scopeKey: budgetKey },
      })
    ).requests,
  ).toBe(1)
  expect(
    (
      await post({
        ...body,
        requestId: randomUUID(),
        message: {
          ...body.message,
          parts: [{ type: "data-general-answer", data: {} }],
        },
      })
    ).status,
  ).toBe(400)
  expect(
    (
      await post({
        ...body,
        conversationId: "foreign-conversation",
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(404)
  expect(
    (
      await app.request(`/api/assistant/general/runs/${run.id}`, {
        headers: { ...headers, "x-store-id": otherStore.id },
      })
    ).status,
  ).toBe(404)
  const draftResponse = await post({
    ...body,
    requestId: randomUUID(),
    message: {
      ...body.message,
      id: randomUUID(),
      parts: [{ type: "text", text: "add customer Stream QA" }],
    },
  })
  expect(draftResponse.status).toBe(200)
  const draftStream = await draftResponse.text()
  expect(draftStream).toContain("data-general-proposal")
  expect(draftStream).not.toContain("approvalToken")
  expect(await db.customer.count({ where: { tenantId } })).toBe(0)
  expect(
    await db.assistantActionProposal.count({
      where: { conversationId: conversation.id },
    }),
  ).toBe(1)

  // A restart releases an abandoned run, but late provider usage is still charged
  // once and cannot replace the conversation with a late assistant reply.
  const orphan = await db.$transaction((tx) =>
    beginAssistantRunInTransaction(tx, {
      actorUserId: scope.userId,
      conversationId: conversation.id,
      model: "rehearsal-v1",
      provider: "ewatrade-rehearsal",
      promptVersion: "qa",
      requestId: randomUUID(),
      userMessage: {
        id: randomUUID(),
        role: "user",
        parts: [{ type: "text", text: "orphan" }],
      },
    }),
  )
  await db.assistantRun.update({
    where: { id: orphan.run.id },
    data: { startedAt: new Date(Date.now() - 180_000) },
  })
  await readGeneralActiveRun(
    db,
    { ...scope, userId: "foreign-user" },
    conversation.id,
  )
  expect(
    (await db.assistantRun.findUniqueOrThrow({ where: { id: orphan.run.id } }))
      .status,
  ).toBe("RUNNING")
  expect(await readGeneralActiveRun(db, scope, conversation.id)).toBeNull()
  const tokensBefore = (
    await db.assistantBudget.findUniqueOrThrow({
      where: { scopeKey: budgetKey },
    })
  ).tokens
  const completion = {
    runId: orphan.run.id,
    tenantId,
    actorUserId: scope.userId,
    model: "rehearsal-v1",
    provider: "ewatrade-rehearsal",
    status: "COMPLETED" as const,
    usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
    budgetScopeKey: budgetKey,
    assistantMessage: {
      id: randomUUID(),
      role: "assistant" as const,
      parts: [{ type: "text", text: "late reply" }],
    },
  }
  await completeAssistantRun(db, completion)
  await completeAssistantRun(db, completion)
  expect(
    (await db.assistantRun.findUniqueOrThrow({ where: { id: orphan.run.id } }))
      .errorCode,
  ).toBe("TURN_INTERRUPTED")
  expect(
    await db.assistantUsageEvent.count({ where: { runId: orphan.run.id } }),
  ).toBe(1)
  expect(
    await db.assistantMessage.count({
      where: { id: completion.assistantMessage.id },
    }),
  ).toBe(0)
  expect(
    (
      await db.assistantBudget.findUniqueOrThrow({
        where: { scopeKey: budgetKey },
      })
    ).tokens,
  ).toBe(tokensBefore + 10)
}
