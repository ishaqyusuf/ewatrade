import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  readGeneralProposals,
  startGeneralConversation,
} from "@ewatrade/db/assistant-general"
import {
  getActiveTenantForUser,
  getConfiguredCatalogOfferingAvailability,
} from "@ewatrade/db/queries"
import type { Prisma, PrismaClient } from "@ewatrade/db/types"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  editGeneralProposal,
  generalProposalForApp,
} from "./general-proposals"
const enabled = process.env.RUN_GENERAL_ASSISTANT_INTEGRATION === "1"
if (enabled) setDefaultTimeout(600_000)
;(enabled ? describe : describe.skip)(
  "General proposals on isolated Development",
  () => {
    test("exact review, atomic receipt rollback, replay, expiry, edits, cancellation and revocation", async () => {
      if (
        process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
        new URL(process.env.EWATRADE_DATABASE_URL ?? "").pathname !==
          "/ewatrade_general_assistant_20261009"
      )
        throw Error("Isolated Development target required")
      const { prisma: db } = await import("@ewatrade/db")
      const marker = randomUUID()
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
        ).toBe(2)
      } finally {
        if (tenantId)
          await db.tenant.deleteMany({
            where: {
              id: tenantId,
              dataClassification: "QA",
              slug: `general-${marker}`,
            },
          })
        if (userId)
          await db.user.deleteMany({
            where: { id: userId, email: `general-${marker}@example.invalid` },
          })
        await db.$disconnect()
      }
    })
  },
)
