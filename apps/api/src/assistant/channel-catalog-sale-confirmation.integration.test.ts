import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { renderNativeOrderReviewPages } from "@ewatrade/assistant/channels/order-review"
import {
  type GeneralAction,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import {
  deriveAssistantWhatsAppActionReviewCode,
  settleAssistantWhatsAppInbox,
} from "@ewatrade/db/assistant-whatsapp"
import {
  createFinanceBook,
  createSimpleCatalogItem,
} from "@ewatrade/db/queries"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { processAssistantWhatsAppOrderReviewPageTurn } from "./channel-order-review-page-turn"
import { prepareAssistantWhatsAppReview } from "./channel-review-staging"
import { orderCreate } from "./general-actions"
import {
  assertCapability,
  assertGeneralAction,
  assertGeneralOrderInitialPayment,
} from "./general-context"
import { prepareGeneralOrder } from "./general-order-preparation"

const prepareCapability = capabilityManifest.find(
  (entry) => entry.id === "sales.order.prepare",
)
if (!prepareCapability) throw Error("Missing preparation capability")
const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-catalog-sale")
const settings = {
  ASSISTANT_WHATSAPP_NATIVE_REVIEW_ACTIONS: "order_create",
  ASSISTANT_REHEARSAL_MODE: "true",
}
const previous = new Map(
  Object.keys(settings).map((key) => [key, process.env[key]]),
)
let trap: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined
let externalCalls = 0
let offeringId = ""
let cashId = ""
beforeAll(async () => {
  if (!enabled) return
  assertFixturePages()
  Object.assign(process.env, settings)
  const refuse = () => {
    externalCalls++
    throw Error("No external fetch in native catalog-sale integration")
  }
  trap = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => refuse(), { preconnect: refuse }),
  )
  await fixture.setup()
  const { db, tenantId, storeId, userId } = fixture
  const book = await createFinanceBook(db, {
    tenantId,
    actorUserId: userId,
    startsAt: new Date("2026-01-01T00:00:00Z"),
  })
  cashId = (
    await db.financeAccount.findUniqueOrThrow({
      where: { bookId_code: { bookId: book.id, code: "1000" } },
    })
  ).id
  const item = await createSimpleCatalogItem(db, {
    tenantId,
    storeId,
    actorUserId: userId,
    clientOperationId: `${fixture.marker}-catalog`,
    kind: "product",
    name: "Synthetic rice",
    canonicalUnitName: "Piece",
    priceMinor: 1000,
    openingStockQuantity: "100",
  })
  offeringId = (
    await db.sellableOffering.findFirstOrThrow({
      where: { tenantId, catalogItemId: item.id },
    })
  ).id
}, 120_000)

/** Remove money dependencies only after proving the unique fixture owns every row. */
async function cleanupOwnedOrders() {
  const { db, tenantId, storeId, userId } = fixture
  await db.$transaction(
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } })
      if (!tenant) {
        expect(await tx.financeBook.count({ where: { tenantId } })).toBe(0)
        expect(await tx.commercialOrder.count({ where: { tenantId } })).toBe(0)
        return
      }
      expect(tenant).toMatchObject({
        slug: tenantId,
        dataClassification: "QA",
        qaSourceDomain: "assistant-action-confirmation.test",
      })
      const proposals = await tx.assistantActionProposal.findMany({
        where: { tenantId },
      })
      for (const proposal of proposals)
        expect(proposal).toMatchObject({
          actorUserId: userId,
          storeId,
          conversationId: fixture.conversationId,
          action: "order_create",
        })
      const keys = new Set(proposals.map((proposal) => proposal.idempotencyKey))
      const orders = await tx.commercialOrder.findMany({ where: { tenantId } })
      for (const order of orders) {
        expect(order).toMatchObject({ storeId, createdByUserId: userId })
        expect(keys.has(order.clientOrderId)).toBe(true)
      }
      const orderIds = orders.map((order) => order.id)
      const books = await tx.financeBook.findMany({ where: { tenantId } })
      for (const book of books)
        expect(book).toMatchObject({ createdById: userId, currencyCode: "NGN" })
      const bookIds = books.map((book) => book.id)
      const commands = await tx.financeCommand.findMany({
        where: { bookId: { in: bookIds } },
      })
      for (const command of commands) expect(command.actorUserId).toBe(userId)
      const entries = await tx.financeJournalEntry.findMany({
        where: { bookId: { in: bookIds } },
      })
      for (const entry of entries) expect(entry.actorUserId).toBe(userId)
      const activities = await tx.commercialOrderActivity.findMany({
        where: { tenantId },
      })
      for (const activity of activities) {
        expect(activity.actorUserId).toBe(userId)
        expect(orderIds).toContain(activity.orderId)
      }
      // This walk-in, photo-free journey cannot own customer-ledger or physical media rows.
      expect(await tx.customerLedgerEntry.count({ where: { tenantId } })).toBe(
        0,
      )
      expect(
        await tx.customerLedgerAccount.count({ where: { tenantId } }),
      ).toBe(0)
      expect(
        await tx.commercialOrderAttachment.count({ where: { tenantId } }),
      ).toBe(0)
      const payments = await tx.commercialOrderPayment.findMany({
        where: { tenantId },
      })
      for (const payment of payments) {
        expect(payment).toMatchObject({ storeId, recordedByUserId: userId })
        expect(orderIds).toContain(payment.orderId)
      }
      const events = await tx.businessActivityEvent.findMany({
        where: { tenantId },
      })
      for (const event of events) expect(event.actorUserId).toBe(userId)
      await tx.businessActivityEvent.deleteMany({
        where: { tenantId, id: { in: events.map((event) => event.id) } },
      })
      await tx.commercialOrderPayment.deleteMany({
        where: { tenantId, id: { in: payments.map((payment) => payment.id) } },
      })
      await tx.commercialOrderActivity.deleteMany({
        where: {
          tenantId,
          id: { in: activities.map((activity) => activity.id) },
        },
      })
      await tx.productFulfillment.deleteMany({
        where: { orderLine: { orderId: { in: orderIds } } },
      })
      await tx.stockReservation.deleteMany({
        where: {
          tenantId,
          storeId,
          commercialOrderLine: { orderId: { in: orderIds } },
        },
      })
      await tx.financeInventoryValuationEvent.deleteMany({
        where: { tenantId, bookId: { in: bookIds } },
      })
      await tx.financeInventoryPool.deleteMany({
        where: { tenantId, bookId: { in: bookIds } },
      })
      await tx.onboardingSession.deleteMany({
        where: {
          tenantId,
          userId,
          token: { startsWith: "wa-proof_order-review_" },
        },
      })
      await tx.commercialOrder.deleteMany({
        where: { tenantId, id: { in: orderIds } },
      })
      await tx.financeCommand.deleteMany({
        where: {
          bookId: { in: bookIds },
          id: { in: commands.map((command) => command.id) },
        },
      })
      await tx.financeJournalLine.deleteMany({
        where: {
          bookId: { in: bookIds },
          entryId: { in: entries.map((entry) => entry.id) },
        },
      })
      await tx.financeJournalEntry.deleteMany({
        where: {
          bookId: { in: bookIds },
          id: { in: entries.map((entry) => entry.id) },
        },
      })
      await tx.financeAccount.deleteMany({ where: { bookId: { in: bookIds } } })
      await tx.financeBook.deleteMany({
        where: { tenantId, id: { in: bookIds } },
      })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

afterAll(async () => {
  if (enabled && fixture.db) {
    try {
      await cleanupOwnedOrders()
    } catch (error) {
      // Preserve tenant/user/proposal/proof attribution if money cleanup is unverified.
      await fixture.db.$disconnect()
      throw new Error(
        `Owned sale cleanup failed; retained fixture ${fixture.tenantId}`,
        { cause: error },
      )
    }
  }
  try {
    await fixture.cleanup()
  } finally {
    trap?.mockRestore()
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
    expect(externalCalls).toBe(0)
    if (enabled)
      console.info(
        "Native catalog-sale fixture cleanup passed; externalCalls=0",
      )
  }
}, 90_000)

/** Exact captured canonical facts and real renderer; runs before fixture setup or effects. */
function assertFixturePages() {
  const result = []
  for (const choice of ["unpaid", "partial", "full"] as const) {
    const received = choice === "unpaid" ? 0 : choice === "full" ? 4000 : 400
    const handover = choice !== "unpaid"
    const lines = [
      ...Array.from({ length: 4 }, (_, i) => [
        `${i + 1}. Synthetic rice · Piece`,
        `1 × ${generalMoney(1000, "NGN")} = ${generalMoney(1000, "NGN")}`,
        `Stock: on hand 100 → ${handover ? 99 - i : 100}; reserved 4 → ${handover ? 4 : 5 + i}; available 96 → ${95 - i} Piece`,
      ]).flat(),
      "Customer: Walk-in",
      `Total: ${generalMoney(4000, "NGN")}`,
      `Received: ${generalMoney(received, "NGN")} · ${handover ? "cash" : "unpaid"}`,
      `Received into: ${handover ? "Shop cash" : "none · no payment recorded"}`,
      `Balance: ${generalMoney(4000 - received, "NGN")}`,
      `Handover: ${handover ? "handed over now; product stock is deducted" : "collect later; on-hand stays unchanged and product stock is reserved"}`,
      "Nothing is saved until you confirm.",
    ]
    const pages = renderNativeOrderReviewPages({
      source: {
        proposalId: "proposal",
        revision: 1,
        payloadHash: "a".repeat(64),
      },
      businessName: "Synthetic confirmation business",
      storeName: "Synthetic confirmation Store",
      expiresAt: "2026-11-10T12:20:00.000Z",
      lines,
      itemCount: 4,
    })
    expect(pages).toHaveLength(2)
    if (!pages)
      throw Error(
        "Fixture must produce native pages before any connected effect",
      )
    expect(pages.every((page) => page.length <= 680)).toBe(true)
    expect(pages[0]).not.toContain("Confirm ")
    expect(pages[1]).toContain(lines.slice(12).join("\n"))
    result.push({
      choice,
      pages: pages.length,
      units: pages.map((page) => page.length),
    })
  }
  console.info("Native catalog-sale page preflight:", JSON.stringify(result))
}

type Order = Extract<GeneralAction, { action: "order_create" }>
function payload(
  paymentChoice: "unpaid" | "partial" | "full",
  fulfillNow: boolean,
): Order {
  return {
    action: "order_create",
    customerChoice: "walk_in",
    paymentChoice,
    fulfillNow,
    lines: Array.from({ length: 4 }, () => ({
      offeringId,
      quantity: "1",
      expectedFixedPriceMinor: 1000,
    })),
    ...(paymentChoice === "unpaid"
      ? {}
      : {
          initialPayment: {
            amountMinor: paymentChoice === "full" ? 4000 : 400,
            method: "cash",
            moneyAccountId: cashId,
          },
        }),
  }
}
async function proof(outboxId: string) {
  const r = await fixture.db.assistantWhatsAppActionReview.findUniqueOrThrow({
    where: { reviewOutboxId: outboxId },
  })
  const material = {
    bindingId: r.bindingId,
    proposalId: r.proposalId,
    proposalRevision: r.proposalRevision,
    payloadHash: r.payloadHash,
    targetRevision: r.targetRevision,
    reviewDigest: r.reviewDigest,
    authorityDigest: r.authorityDigest,
    identityGeneration: r.identityGeneration,
    grantGeneration: r.grantGeneration,
    selectionGeneration: r.selectionGeneration,
    reviewOutboxId: r.reviewOutboxId,
    nonce: r.nonce,
    keyVersion: r.keyVersion,
    expiresAt: r.expiresAt,
  }
  return {
    confirmCode: deriveAssistantWhatsAppActionReviewCode(
      material,
      "confirm",
      fixture.signingKey,
    ),
    cancelCode: deriveAssistantWhatsAppActionReviewCode(
      material,
      "cancel",
      fixture.signingKey,
    ),
  }
}
async function finishPages(
  first: Awaited<ReturnType<typeof fixture.stagedProposal>>,
) {
  let current = {
    outboxId: first.outbox.id,
    providerMessageId: first.providerMessageId,
    body: first.body,
    confirmCode: first.confirmCode,
    cancelCode: first.cancelCode,
  }
  for (let n = 0; !current.body.includes("Confirm "); n++) {
    if (n >= 8) throw Error("Unexpected review size")
    const inbox = await fixture.incoming(
      `Next sale page ${current.outboxId}`,
      current.providerMessageId,
    )
    expect(inbox.kind).toBe("TURN")
    const claimed = await fixture.claim(inbox.id)
    expect(
      await processAssistantWhatsAppOrderReviewPageTurn(
        await fixture.context(inbox.requestId, claimed.lease),
        claimed.lease,
        inbox,
      ),
    ).toBe(true)
    const review = await prepareAssistantWhatsAppReview(
      fixture.db,
      claimed.lease,
    )
    if (!review) throw Error("Expected canonical next page")
    expect(
      await settleAssistantWhatsAppInbox(fixture.db, claimed.lease, {
        permittedUserIds: [fixture.userId],
        review,
      }),
    ).toEqual({ state: "COMPLETED" })
    const outbox = await fixture.db.assistantWhatsAppOutbox.findFirstOrThrow({
      where: { inboxId: inbox.id, renderKind: "action_review" },
    })
    const delivery = await fixture.fakeAcceptedDelivery(outbox.id)
    current = { outboxId: outbox.id, ...delivery, ...(await proof(outbox.id)) }
  }
  return current
}
async function snapshot() {
  const { db, tenantId } = fixture
  return {
    orders: await db.commercialOrder.findMany({
      where: { tenantId },
      orderBy: { id: "asc" },
    }),
    payments: await db.commercialOrderPayment.findMany({
      where: { tenantId },
      orderBy: { id: "asc" },
    }),
    reservations: await db.stockReservation.findMany({
      where: { tenantId },
      orderBy: { id: "asc" },
    }),
    balances: await db.stockBalanceSource.findMany({
      where: { tenantId },
      orderBy: { id: "asc" },
    }),
    movements: await db.stockMovement.count({
      where: { operation: { tenantId } },
    }),
    journals: await db.financeJournalEntry.count({
      where: { book: { tenantId } },
    }),
  }
}

suite("guarded native catalog sale through exact delivered review", () => {
  test("unpaid reservation, partial/full handover and actual scoped cashier keep canonical effects and duplicate receipt", async () => {
    for (const choice of ["unpaid", "partial", "full"] as const) {
      if (choice === "full") {
        await fixture.db.membership.update({
          where: { id: fixture.membershipId },
          data: {
            role: "CASHIER",
            staffAccessMode: "SCOPED",
            staffAccessRevision: { increment: 1 },
            staffStoreAssignments: {
              create: {
                storeId: fixture.storeId,
                role: "CASHIER",
                updatedByUserId: fixture.userId,
              },
            },
          },
        })
        const ctx = await fixture.context(`${fixture.marker}-cashier`)
        expect(ctx.tenantContext.membership.role).toBe("CASHIER")
        expect(() => assertGeneralOrderInitialPayment(ctx)).not.toThrow()
        expect(() => assertGeneralAction(ctx, "payment_record")).toThrow()
        expect(() => assertGeneralAction(ctx, "customer_create")).toThrow()
        expect(() => assertCapability(ctx, prepareCapability)).not.toThrow()
        const prepared = await prepareGeneralOrder(ctx, {
          lines: [{ name: "Synthetic rice", quantity: "1", choices: [] }],
          customerChoice: "walk_in",
          paymentChoice: "full",
          delivered: true,
        })
        expect(prepared.lines[0]).toMatchObject({
          offeringId,
          status: "resolved",
          unitPriceMinor: 1000,
        })
        expect(prepared.issues).toEqual([])
      }
      if (choice === "partial") {
        if (!orderCreate.prepare) throw Error("Order preparation missing")
        const edited = await orderCreate.prepare(
          await fixture.context(`${fixture.marker}-quantity-edit`),
          {
            ...payload("partial", true),
            preparation: {
              lines: [{ name: "Synthetic rice", quantity: "5", choices: [] }],
            },
          },
        )
        expect(edited).toMatchObject({
          customerChoice: "walk_in",
          paymentChoice: "partial",
          fulfillNow: true,
          initialPayment: {
            amountMinor: 400,
            method: "cash",
            moneyAccountId: cashId,
          },
        })
        expect(edited.prepared?.totalMinor).toBe(5000)
      }
      const before = await snapshot()
      const first = await fixture.stagedProposal({
        text: `Record exact synthetic ${choice} sale`,
        payload: payload(choice, choice !== "unpaid"),
        reply: "Review this sale.",
        expectedReviewText: "Synthetic rice",
      })
      expect(first.body).toContain("Review sale · page 1 of 2")
      expect(first.body).not.toContain("Confirm ")
      if (choice === "unpaid") {
        await fixture.action(
          `Confirm ${first.confirmCode}`,
          first.providerMessageId,
        )
        expect(await snapshot()).toEqual(before)
      }
      const final = await finishPages(first)
      const result = await fixture.action(
        `Confirm ${final.confirmCode}`,
        final.providerMessageId,
      )
      const proposal =
        await fixture.db.assistantActionProposal.findUniqueOrThrow({
          where: { id: first.source.proposalId },
        })
      expect(proposal.status).toBe("COMPLETED")
      const order = await fixture.db.commercialOrder.findUniqueOrThrow({
        where: {
          tenantId_clientOrderId: {
            tenantId: fixture.tenantId,
            clientOrderId: proposal.idempotencyKey,
          },
        },
      })
      expect(order).toMatchObject({
        totalMinor: 4000,
        amountPaidMinor:
          choice === "unpaid" ? 0 : choice === "full" ? 4000 : 400,
        createdByUserId: fixture.userId,
      })
      const after = await snapshot()
      expect(after.orders.length).toBe(before.orders.length + 1)
      expect(after.payments.length).toBe(
        before.payments.length + (choice === "unpaid" ? 0 : 1),
      )
      const stock = after.balances[0]
      const old = before.balances[0]
      if (!stock || !old) throw Error("Expected initialized stock")
      expect(stock.onHandQuantity.toString()).toBe(
        choice === "unpaid"
          ? old.onHandQuantity.toString()
          : String(Number(old.onHandQuantity) - 4),
      )
      expect(stock.reservedQuantity.toString()).toBe(
        choice === "unpaid"
          ? String(Number(old.reservedQuantity) + 4)
          : old.reservedQuantity.toString(),
      )
      expect(result.outbox.content).toContain(order.id)
      if (choice === "full") {
        const replay = await fixture.action(
          `Confirm ${final.confirmCode}`,
          final.providerMessageId,
        )
        expect(replay.outbox.content).toBe(result.outbox.content)
        expect(await snapshot()).toEqual(after)
      }
    }
    await fixture.assertNoStoredDecisionCodes()
  }, 600_000)
  test("Cancel on an intermediate page and changed stock before final Confirm save nothing", async () => {
    for (const mode of ["cancel", "stale"] as const) {
      const before = await snapshot()
      const first = await fixture.stagedProposal({
        text: `Prepare synthetic ${mode} sale`,
        payload: payload("unpaid", false),
        reply: "Review this sale.",
        expectedReviewText: "Synthetic rice",
      })
      if (mode === "cancel")
        await fixture.action(
          `Cancel ${first.cancelCode}`,
          first.providerMessageId,
        )
      else {
        const final = await finishPages(first)
        // Fixture-owned stock revision changes after all pages were reviewed.
        await fixture.db.stockBalanceSource.update({
          where: { id: before.balances[0]?.id },
          data: { revision: { increment: 1 } },
        })
        await fixture.action(
          `Confirm ${final.confirmCode}`,
          final.providerMessageId,
        )
      }
      const after = await snapshot()
      expect(after.orders).toEqual(before.orders)
      expect(after.payments).toEqual(before.payments)
      expect(after.movements).toBe(before.movements)
      expect(after.journals).toBe(before.journals)
    }
  }, 180_000)
})
