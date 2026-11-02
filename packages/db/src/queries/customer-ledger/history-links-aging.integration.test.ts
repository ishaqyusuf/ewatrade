import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { previewCustomerAccountMessage } from "../customer-messages/account-preview"
import { createFinanceBook } from "../finance/accounts"
import { postCommerceFinanceJournalInTransaction } from "../finance/posting"
import { getCustomerLedgerAging } from "./aging"
import { createCustomerWithOpening } from "./customer-opening"
import {
  linkCustomerHistoricalOrders,
  listCustomerOrderLinkSuggestions,
} from "./order-links"

describeWithServiceCommerceDatabase(
  "customer history links, starting balance and aging",
  () => {
    test("links only exact contact matches, creates customers with an opening atomically and ages both sources", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      const owner = await db.user.create({
        data: {
          name: "History link QA",
          email: `history-link-${runId}@example.invalid`,
        },
      })
      const manager = await db.user.create({
        data: {
          name: "History link manager",
          email: `history-link-manager-${runId}@example.invalid`,
        },
      })
      let tenantId: string | undefined
      let bookId: string | undefined
      try {
        const tenant = await db.tenant.create({
          data: {
            name: "History link QA",
            slug: `history-link-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            timezone: "Africa/Lagos",
            users: {
              create: [
                { userId: owner.id, role: "OWNER", status: "ACTIVE" },
                { userId: manager.id, role: "MANAGER", status: "ACTIVE" },
              ],
            },
          },
        })
        tenantId = tenant.id
        const actor = { tenantId, actorUserId: owner.id }
        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: new Date("2026-01-01"),
        })
        bookId = book.id
        const store = await db.store.create({
          data: {
            tenantId,
            name: "History store",
            slug: "history-store",
            status: "ACTIVE",
            countryCode: "NG",
          },
        })

        // Starting balance at creation: atomic, replayable, no half-saved customer.
        const create = {
          ...actor,
          bookId,
          clientCommandId: `create-${runId}`,
          customer: {
            name: "Amina Bello",
            phone: "0803 000 0001",
            email: "amina@example.com",
          },
          opening: {
            direction: "DEBT" as const,
            amountMinor: "500000",
            reason: "Owed from the old notebook",
          },
        }
        const created = await createCustomerWithOpening(db, create)
        expect(created.replayed).toBe(false)
        expect(await createCustomerWithOpening(db, create)).toMatchObject({
          customerId: created.customerId,
          accountId: created.accountId,
          entryId: created.entryId,
          replayed: true,
        })
        await expect(
          createCustomerWithOpening(db, {
            ...create,
            opening: { ...create.opening, amountMinor: "500001" },
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        await expect(
          createCustomerWithOpening(db, {
            ...create,
            clientCommandId: `create-dup-${runId}`,
          }),
        ).rejects.toMatchObject({ code: "DUPLICATE_CUSTOMER" })
        await expect(
          createCustomerWithOpening(db, {
            ...create,
            clientCommandId: `create-bad-${runId}`,
            customer: { name: "Rolled back customer" },
            opening: { ...create.opening, amountMinor: "0" },
          }),
        ).rejects.toBeDefined()
        expect(
          await db.customer.count({
            where: { tenantId, name: "Rolled back customer" },
          }),
        ).toBe(0)
        const openingEntries = await db.customerLedgerEntry.findMany({
          where: { accountId: created.accountId },
        })
        expect(
          openingEntries.map((row) => [row.kind, row.amountMinor.toString()]),
        ).toEqual([["OPENING_DEBT", "500000"]])

        const other = await db.customer.create({
          data: {
            tenantId,
            name: "Bola Ade",
            phone: "08030000002",
            normalizedPhone: "08030000002",
            email: "bola@example.com",
            normalizedEmail: "bola@example.com",
          },
        })
        let orderNumber = 0
        const order = (data: {
          customerName?: string
          customerPhone?: string | null
          customerEmail?: string | null
          status?: "DRAFT" | "CONFIRMED"
          totalMinor?: number
          amountPaidMinor?: number
          paymentStatus?: "PENDING" | "PARTIALLY_PAID"
          customerId?: string
        }) => {
          orderNumber += 1
          const totalMinor = data.totalMinor ?? 800000
          return db.commercialOrder.create({
            data: {
              tenantId: tenant.id,
              storeId: store.id,
              clientOrderId: `${runId}-${orderNumber}`,
              payloadHash: "history-link-fixture",
              orderNumber: `QA-H${orderNumber}`,
              currencyCode: "NGN",
              subtotalMinor: totalMinor,
              totalMinor,
              amountPaidMinor: data.amountPaidMinor ?? 0,
              paymentStatus: data.paymentStatus ?? "PENDING",
              status: data.status ?? "CONFIRMED",
              customerName: data.customerName ?? "Amina Bello",
              customerPhone: data.customerPhone ?? null,
              customerEmail: data.customerEmail ?? null,
              customerId: data.customerId,
              createdByUserId: owner.id,
            },
          })
        }
        const exact = await order({
          customerPhone: "0803-000-0001",
          amountPaidMinor: 300000,
          paymentStatus: "PARTIALLY_PAID",
        })
        await order({
          customerPhone: "0803 000 0001",
          customerEmail: "someone@example.com",
        })
        await order({
          customerPhone: "08030000001",
          customerEmail: "bola@example.com",
        })
        const nameOnly = await order({})
        await order({ customerPhone: "08030000001", status: "DRAFT" })
        const byEmail = await order({ customerEmail: "AMINA@example.com " })
        // An Order already linked elsewhere is never offered again.
        await order({ customerPhone: "08030000001", customerId: other.id })

        await expect(
          listCustomerOrderLinkSuggestions(db, {
            tenantId,
            actorUserId: manager.id,
            customerId: created.customerId,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" })
        const suggestions = await listCustomerOrderLinkSuggestions(db, {
          ...actor,
          customerId: created.customerId,
        })
        expect(suggestions.items.map((row) => row.orderId).sort()).toEqual(
          [exact.id, byEmail.id].sort(),
        )
        expect(suggestions.suggestedCount).toBe(2)
        expect(suggestions.conflictCount).toBe(2)
        expect(
          suggestions.items.find((row) => row.orderId === byEmail.id)
            ?.matchedBy,
        ).toBe("EMAIL")
        expect(
          suggestions.items.some((row) => row.orderId === nameOnly.id),
        ).toBe(false)

        const link = {
          ...actor,
          customerId: created.customerId,
          orderIds: [exact.id, byEmail.id],
          clientCommandId: `link-${runId}`,
        }
        await expect(
          linkCustomerHistoricalOrders(db, {
            ...link,
            actorUserId: manager.id,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" })
        await expect(
          linkCustomerHistoricalOrders(db, {
            ...link,
            clientCommandId: `link-name-${runId}`,
            orderIds: [nameOnly.id],
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        const linked = await linkCustomerHistoricalOrders(db, link)
        expect(linked).toMatchObject({ replayed: false })
        expect(await linkCustomerHistoricalOrders(db, link)).toMatchObject({
          linkedOrderIds: [exact.id, byEmail.id].sort(),
          replayed: true,
        })
        await expect(
          linkCustomerHistoricalOrders(db, { ...link, orderIds: [exact.id] }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        const linkedOrders = await db.commercialOrder.findMany({
          where: { id: { in: [exact.id, byEmail.id, nameOnly.id] } },
          select: { id: true, customerId: true },
        })
        expect(
          Object.fromEntries(
            linkedOrders.map((row) => [row.id, row.customerId]),
          ),
        ).toEqual({
          [exact.id]: created.customerId,
          [byEmail.id]: created.customerId,
          [nameOnly.id]: null,
        })
        expect(
          await db.commercialOrderCustomerLink.count({ where: { tenantId } }),
        ).toBe(2)
        // Linking posts nothing: same entries and no new journals.
        expect(
          await db.customerLedgerEntry.count({
            where: { accountId: created.accountId },
          }),
        ).toBe(1)
        const journalsBefore = await db.financeJournalEntry.count({
          where: { bookId },
        })
        expect(
          (
            await listCustomerOrderLinkSuggestions(db, {
              ...actor,
              customerId: created.customerId,
            })
          ).suggestedCount,
        ).toBe(0)

        // A billed Order is aged through its statement charge only.
        const billed = await order({
          customerPhone: "08030000001",
          customerId: created.customerId,
          totalMinor: 200000,
        })
        await db.$transaction(
          (tx) =>
            postCommerceFinanceJournalInTransaction(tx, {
              tenantId: tenant.id,
              orderId: billed.id,
              event: "BILLED",
            }),
          { maxWait: 10000, timeout: 30000 },
        )
        expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(
          journalsBefore + 1,
        )
        await expect(
          getCustomerLedgerAging(db, {
            tenantId,
            actorUserId: manager.id,
            accountId: created.accountId,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" })
        const aging = await getCustomerLedgerAging(db, {
          ...actor,
          accountId: created.accountId,
        })
        expect(aging.reconciled).toBe(true)
        expect(aging.statementOwedMinor).toBe("700000")
        // Exact Order 8,000 − 3,000 paid, plus the email Order 8,000.
        expect(aging.ordersOwedMinor).toBe("1300000")
        expect(aging.totalOwedMinor).toBe("2000000")
        expect(
          aging.unpaidOrders.items.map((row) => row.orderId).sort(),
        ).toEqual([exact.id, byEmail.id].sort())
        const bucket = (key: string) =>
          aging.buckets.find((row) => row.key === key)
        expect(bucket("DAYS_0_30")).toMatchObject({
          statementMinor: "200000",
          ordersMinor: "1300000",
          totalMinor: "1500000",
        })
        // The opening debt is dated at the book start (1 January 2026).
        expect(bucket("DAYS_OVER_90")?.statementMinor).toBe("500000")
        expect(aging.oldestOwedAt).toBe("2026-01-01T00:00:00.000Z")

        // Account messages: whole-account amounts, Owner/Admin, never sent.
        await expect(
          previewCustomerAccountMessage(db, {
            tenantId,
            actorUserId: manager.id,
            storeId: store.id,
            accountId: created.accountId,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" })
        const preview = await previewCustomerAccountMessage(db, {
          ...actor,
          storeId: store.id,
          accountId: created.accountId,
        })
        expect(preview.eventKey).toBe("customer.balance_reminder")
        expect(preview.state).toBe("not_composed")
        expect(preview.waUrl).toBeNull()
        expect(preview.amounts.totalOwedMinor).toBe("2000000")
        expect(preview.variables.amount_owed).toContain("20,000")
        expect(preview.recipient.phoneE164).toBe("+2348030000001")
        expect(preview.events.map((event) => event.key)).toEqual([
          "customer.balance_reminder",
          "customer.account_summary",
        ])
      } finally {
        if (tenantId)
          await db.$transaction(
            async (tx) => {
              await tx.commercialOrderCustomerLink.deleteMany({
                where: { tenantId },
              })
              await tx.customerLedgerCommand.deleteMany({ where: { tenantId } })
              await tx.customerLedgerAllocationRelease.deleteMany({
                where: { allocation: { credit: { tenantId } } },
              })
              await tx.customerLedgerAllocation.deleteMany({
                where: { credit: { tenantId } },
              })
              await tx.customerLedgerReceipt.deleteMany({
                where: { entry: { tenantId } },
              })
              await tx.customerLedgerEntry.deleteMany({ where: { tenantId } })
              await tx.customerLedgerAccount.deleteMany({ where: { tenantId } })
              await tx.commercialOrder.deleteMany({ where: { tenantId } })
              await tx.customer.deleteMany({ where: { tenantId } })
              if (bookId) {
                await tx.financeCommand.deleteMany({ where: { bookId } })
                await tx.financeJournalLine.deleteMany({ where: { bookId } })
                await tx.financeJournalEntry.deleteMany({ where: { bookId } })
                await tx.financeAccount.deleteMany({ where: { bookId } })
                await tx.financeBook.delete({ where: { id: bookId } })
              }
              await tx.store.deleteMany({ where: { tenantId } })
              await tx.tenant.delete({ where: { id: tenantId } })
            },
            { maxWait: 10000, timeout: 30000 },
          )
        await db.user.deleteMany({
          where: { id: { in: [owner.id, manager.id] } },
        })
      }
    }, 240000)
  },
)
