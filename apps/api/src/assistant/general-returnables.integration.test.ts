import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  createCommercialOrder,
  getActiveTenantForUser,
  listReturnableBalances,
  recordReturnableMovement,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import { prepareGeneralOrder } from "./general-order-preparation"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(240_000)
;(enabled ? describe : describe.skip)(
  "assistant returnables on Neon development",
  () => {
    test("orders send crates out; returns, write-offs and refusals use the ledger", async () => {
      const { prisma: db } = await import("@ewatrade/db")
      const marker = randomUUID()
      let tenantId: string | undefined
      let userId: string | undefined
      try {
        const user = await db.user.create({
          data: {
            email: `returnables-${marker}@example.test`,
            name: "Returnables QA",
            ageBand: "ADULT",
          },
        })
        userId = user.id
        const tenant = await db.tenant.create({
          data: {
            slug: `returnables-${marker}`,
            name: "Returnables QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "assistant-returnables.test",
            qaMarkedAt: new Date(),
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantId = tenant.id
        const store = await db.store.create({
          data: { tenantId, name: "Farm", slug: "farm", status: "ACTIVE" },
        })
        const session = await db.session.create({
          data: {
            userId: user.id,
            token: `returnables-${marker}`,
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
          tenantId,
          activeStoreId: store.id,
          requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
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
        const conversation = await db.assistantConversation.create({
          data: {
            ownerUserId: user.id,
            purpose: "GENERAL",
            status: "ACTIVE",
            storeId: store.id,
            tenantId,
          },
        })
        const chidi = await db.customer.create({
          data: { name: "Chidi Eze", tenantId },
        })
        const musa = await db.customer.create({
          data: { name: "Musa Ibrahim", tenantId },
        })
        const reviewOf = async (proposalId: string) =>
          generalProposalWithReview(
            ctx,
            await db.assistantActionProposal.findUniqueOrThrow({
              where: { id: proposalId },
            }),
          )
        const confirm = async (proposalId: string) => {
          const app = generalProposalForApp(
            await db.assistantActionProposal.findUniqueOrThrow({
              where: { id: proposalId },
            }),
          )
          return decideGeneralProposal(ctx, {
            approvalToken: app.approvalToken,
            decision: "confirm",
            proposalId: app.id,
            revision: app.revision,
          })
        }
        const held = async (customerId: string) =>
          (
            await listReturnableBalances(db, {
              tenantId: tenantId ?? "",
              customerId,
            })
          )[0]?.out ?? 0

        // No Returnable item yet: the order draft says so and the movement is refused.
        const early = await prepareGeneralOrder(ctx, {
          lines: [{ name: "Eggs Large", quantity: "80", choices: [] }],
          customerName: "Musa Ibrahim",
          returnables: [{ name: "crates", quantity: 58 }],
        })
        expect(early.returnables?.[0]?.status).toBe("not_set_up")
        expect(early.issues.join(" ")).toContain(
          "No Returnable item is set up yet",
        )
        await expect(
          draftGeneralProposal(ctx, conversation.id, {
            action: "returnable_movement_record",
            kind: "RETURNED",
            quantity: 5,
            customerName: "Musa",
          }),
        ).rejects.toThrow("No Returnable item is set up yet")

        const crate = await db.catalogItem.create({
          data: {
            kind: "PRODUCT",
            name: "Egg crate",
            slug: `egg-crate-${marker}`,
            status: "ACTIVE",
            tenantId,
            product: { create: { usage: "RETURNABLE" } },
          },
        })

        // Prepared order: 58 crates bind to Egg crate; a walk-in cannot take them.
        const prepared = await prepareGeneralOrder(ctx, {
          lines: [{ name: "Eggs Large", quantity: "80", choices: [] }],
          customerName: "Musa Ibrahim",
          returnables: [{ name: "crates", quantity: 58 }],
        })
        expect(prepared.returnables?.[0]).toMatchObject({
          status: "resolved",
          catalogItemId: crate.id,
          itemName: "Egg crate",
        })
        expect(prepared.customer?.id).toBe(musa.id)
        const walkIn = await prepareGeneralOrder(ctx, {
          lines: [{ name: "Eggs Medium", quantity: "10", choices: [] }],
          returnables: [{ name: "crates", quantity: 10 }],
        })
        expect(walkIn.issues).toContain(
          "Returnables can't go out on a walk-in sale. Choose a saved customer, or sell without returnables.",
        )

        // Direct order draft (mobile path): crates out with a saved customer.
        await recordReturnableMovement(db, {
          tenantId,
          scope: { tenantId },
          actorUserId: user.id,
          clientMovementId: `seed-musa-${marker}`,
          customerId: musa.id,
          catalogItemId: crate.id,
          storeId: store.id,
          kind: "ISSUED",
          quantity: 12,
        })
        const orderDraft = await draftGeneralProposal(ctx, conversation.id, {
          action: "order_create",
          customerId: musa.id,
          lines: [
            {
              custom: "quick_sale",
              amountMinor: 48_000_000,
              description: "80 crates of big eggs",
            },
          ],
          returnables: [{ name: "crates", quantity: 58 }],
        })
        const orderReview = await reviewOf(orderDraft.proposalId)
        expect(orderReview.review).toContain(
          "To come back: 58 Egg crate · Musa Ibrahim holds 12 → 70",
        )
        expect(orderReview.presentation?.sections?.[0]).toEqual({
          title: "To come back",
          rows: [
            { label: "58 Egg crates", value: "Musa Ibrahim holds 12 → 70" },
          ],
        })
        const created = await confirm(orderDraft.proposalId)
        expect(created.receipt).toMatchObject({ kind: "order" })
        expect(created.receipt?.detail).toContain("58 Egg crates to come back")
        expect(await held(musa.id)).toBe(70)
        const movement = await db.returnableMovement.findFirstOrThrow({
          where: {
            tenantId,
            customerId: musa.id,
            kind: "ISSUED",
            orderId: { not: null },
          },
        })
        expect(movement).toMatchObject({ quantity: 58, source: "assistant" })

        // A walk-in order draft with crates cannot be confirmed.
        const walkInDraft = await draftGeneralProposal(ctx, conversation.id, {
          action: "order_create",
          lines: [
            {
              custom: "quick_sale",
              amountMinor: 5_400_000,
              description: "10 crates",
            },
          ],
          returnables: [{ name: "crates", quantity: 10 }],
        })
        expect(
          (await reviewOf(walkInDraft.proposalId)).review?.join(" "),
        ).toContain("Returnables can't go out on a walk-in sale")
        await expect(confirm(walkInDraft.proposalId)).rejects.toThrow()

        // 78 crates back from Chidi, named loosely.
        await recordReturnableMovement(db, {
          tenantId,
          scope: { tenantId },
          actorUserId: user.id,
          clientMovementId: `seed-chidi-${marker}`,
          customerId: chidi.id,
          catalogItemId: crate.id,
          storeId: store.id,
          kind: "ISSUED",
          quantity: 96,
        })
        const back = await draftGeneralProposal(ctx, conversation.id, {
          action: "returnable_movement_record",
          kind: "RETURNED",
          quantity: 78,
          customerName: "Chidi",
        })
        const backReview = await reviewOf(back.proposalId)
        expect(backReview.review).toEqual([
          "78 Egg crates returned",
          "Customer: Chidi Eze",
          "Chidi Eze holds: 96 → 18",
          "Records it in Returnables. Stock, sales and payments do not change.",
        ])
        expect(await confirm(back.proposalId)).toMatchObject({
          receipt: {
            kind: "customer",
            recordId: chidi.id,
            title: "Return recorded",
          },
        })
        expect(await held(chidi.id)).toBe(18)

        // Back on an order, by the number people say.
        const order = await createCommercialOrder(db, {
          actorUserId: user.id,
          clientOrderId: `returnables-order-${marker}`,
          customerId: chidi.id,
          lines: [
            {
              amountMinor: 30_000_000,
              custom: "quick_sale",
              description: "56 crates",
            },
          ],
          returnables: [{ catalogItemId: crate.id, quantity: 56 }],
          schemaVersion: 1,
          storeId: store.id,
          tenantId,
        })
        const onOrder = await draftGeneralProposal(ctx, conversation.id, {
          action: "returnable_movement_record",
          kind: "RETURNED",
          quantity: 30,
          orderNumber: `#${order.orderNumber.replace(/^ORD-0*/, "")}`,
        })
        const onOrderReview = await reviewOf(onOrder.proposalId)
        expect(onOrderReview.review).toContain(
          `Order: ${order.orderNumber} · 56 went out on this order`,
        )
        expect(onOrderReview.review).toContain("Chidi Eze holds: 74 → 44")
        await confirm(onOrder.proposalId)
        expect(await held(chidi.id)).toBe(44)

        // More back than held is refused with the real balance.
        await expect(
          draftGeneralProposal(ctx, conversation.id, {
            action: "returnable_movement_record",
            kind: "RETURNED",
            quantity: 200,
            customerName: "Musa Ibrahim",
          }),
        ).rejects.toThrow(
          "Musa Ibrahim holds 70 Egg crates, so 200 can't come back. Record 70 instead?",
        )

        // Lost crates are written off.
        const lost = await draftGeneralProposal(ctx, conversation.id, {
          action: "returnable_movement_record",
          kind: "WRITTEN_OFF",
          quantity: 5,
          customerName: "Musa",
        })
        expect((await reviewOf(lost.proposalId)).review).toContain(
          "To charge for lost items, record a sale.",
        )
        expect(await confirm(lost.proposalId)).toMatchObject({
          receipt: { title: "Written off" },
        })
        expect(await held(musa.id)).toBe(65)
      } finally {
        if (tenantId) await db.tenant.deleteMany({ where: { id: tenantId } })
        if (userId) await db.user.deleteMany({ where: { id: userId } })
        await db.$disconnect()
      }
    })
  },
)
