import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "../finance/accounts"
import { getFinanceAccountBalances } from "../finance/reads"
import { ensureCustomerLedgerAccount } from "./accounts"
import { recordCustomerLedgerOpening } from "./opening"
import { recordCustomerLedgerReceiptAndApply } from "./receipt-and-apply"
import { recordCustomerLedgerReceipt } from "./receipts"

// Throws from a helper so a mismatched fixture never gets deleted.
function refuseCleanup(mismatch: boolean) {
  if (mismatch) throw new Error("Refusing non-fixture cleanup")
}

// F1.6.05 posting matrix rows 27 and 28: customer opening cutoff and closed
// period, customer receipt closed period, and receipt-and-apply.
describeWithServiceCommerceDatabase("customer ledger posting matrix", () => {
  test("opening refuses linked pre-cutoff orders and closed periods; receipts and receipt-and-apply post once and respect the lock", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const slug = `customer-matrix-${suffix}`
    const user = await db.user.create({
      data: {
        email: `${slug}@example.invalid`,
        name: "Customer matrix acceptance",
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug,
          name: "Customer matrix acceptance",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          users: {
            create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      })
      tenantId = tenant.id
      const actor = { tenantId, actorUserId: user.id }
      const startsAt = new Date("2026-01-01T00:00:00Z")
      const book = await createFinanceBook(db, { ...actor, startsAt })
      bookId = book.id
      const scope = { ...actor, bookId }
      const store = await db.store.create({
        data: {
          tenantId,
          name: "Matrix store",
          slug: "main",
          status: "ACTIVE",
        },
      })
      const ledgerFor = async (name: string) => {
        const customer = await db.customer.create({
          data: { tenantId: tenantId as string, name },
        })
        const account = await ensureCustomerLedgerAccount(db, {
          ...actor,
          customerId: customer.id,
          currencyCode: "NGN",
        })
        return { customer, account }
      }
      const order = (
        customerId: string,
        label: string,
        createdAt: Date,
        status?: "CANCELLED",
      ) =>
        db.commercialOrder.create({
          data: {
            tenantId: tenantId as string,
            storeId: store.id,
            customerId,
            clientOrderId: `${suffix}:${label}`,
            payloadHash: "customer-matrix-fixture",
            orderNumber: `QA-${label}`,
            currencyCode: "NGN",
            subtotalMinor: 2500,
            totalMinor: 2500,
            createdByUserId: user.id,
            createdAt,
            ...(status ? { status } : {}),
          },
        })
      const facts = async (accountId: string) => ({
        entries: await db.customerLedgerEntry.count({ where: { accountId } }),
        receipts: await db.customerLedgerReceipt.count({
          where: { accountId },
        }),
        allocations: await db.customerLedgerAllocation.count({
          where: { accountId },
        }),
        commands: await db.customerLedgerCommand.count({
          where: { accountId },
        }),
        journals: await db.financeJournalEntry.count({ where: { bookId } }),
        revision: (
          await db.customerLedgerAccount.findUniqueOrThrow({
            where: { id: accountId },
          })
        ).revision.toString(),
      })
      const lock = (closedThrough: Date | null) =>
        db.financeBook.update({
          where: { id: bookId },
          data: { closedThrough },
        })
      const balances = async () => {
        const rows = (await getFinanceAccountBalances(db, scope)).accounts
        return (purpose: string) =>
          rows.find((row) => row.purpose === purpose)?.balanceMinor
      }
      const accounts = await db.financeAccount.findMany({ where: { bookId } })
      const cash = accounts.find((row) => row.purpose === "CASH")
      if (!cash) throw new Error("Missing cash account")

      // Row 27 cutoff: an active order on or before the start date blocks it.
      const early = await ledgerFor("Early buyer")
      const earlyOrder = await order(
        early.customer.id,
        "early",
        new Date("2025-12-20T10:00:00Z"),
      )
      const boundary = await ledgerFor("Boundary buyer")
      await order(boundary.customer.id, "boundary", startsAt)
      const opening = (accountId: string, clientCommandId: string) => ({
        ...scope,
        accountId,
        clientCommandId,
        direction: "DEBT" as const,
        amountMinor: "3000",
        reason: "Verified debt at cutoff",
      })
      for (const [ledger, id] of [
        [early, "early-opening"],
        [boundary, "boundary-opening"],
      ] as const) {
        const before = await facts(ledger.account.id)
        await expect(
          recordCustomerLedgerOpening(db, opening(ledger.account.id, id)),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: expect.stringContaining("Linked orders exist"),
        })
        expect(await facts(ledger.account.id)).toEqual(before)
      }
      // A cancelled pre-cutoff order and a post-cutoff order do not block it.
      await db.commercialOrder.update({
        where: { id: earlyOrder.id },
        data: { status: "CANCELLED" },
      })
      await order(early.customer.id, "early-later", new Date())
      const earlyOpening = await recordCustomerLedgerOpening(
        db,
        opening(early.account.id, "early-opening"),
      )
      expect(
        await db.customerLedgerEntry.findUniqueOrThrow({
          where: { id: earlyOpening.id },
        }),
      ).toMatchObject({ kind: "OPENING_DEBT", effectiveAt: startsAt })

      // Row 27 closed period: the opening is fixed at the start date.
      const main = await ledgerFor("Main buyer")
      await lock(startsAt)
      let before = await facts(main.account.id)
      await expect(
        recordCustomerLedgerOpening(
          db,
          opening(main.account.id, "main-closed"),
        ),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      expect(await facts(main.account.id)).toEqual(before)

      // Row 28 closed period: receipts post at server time.
      await lock(new Date(Date.now() + 120_000))
      const receipt = {
        ...scope,
        accountId: main.account.id,
        moneyAccountId: cash.id,
        clientCommandId: "main-receipt-closed",
        amountMinor: "1000",
        method: "CASH" as const,
        description: "Cash on account",
      }
      await expect(
        recordCustomerLedgerReceipt(db, receipt),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      await expect(
        recordCustomerLedgerReceiptAndApply(db, {
          ...receipt,
          clientCommandId: "main-pay-closed",
        }),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      expect(await facts(main.account.id)).toEqual(before)
      await lock(null)

      // Receipt-and-apply: pays the oldest debt, keeps the rest as paid ahead.
      await recordCustomerLedgerOpening(
        db,
        opening(main.account.id, "main-opening"),
      )
      const audit = async (clientCommandId: string) =>
        (
          await db.customerLedgerCommand.findUniqueOrThrow({
            where: {
              tenantId_clientCommandId: {
                tenantId: tenantId as string,
                clientCommandId,
              },
            },
          })
        ).result
      const part = {
        ...receipt,
        clientCommandId: "main-pay-part",
        description: "Part payment",
      }
      const partResult = await recordCustomerLedgerReceiptAndApply(db, part)
      expect(await recordCustomerLedgerReceiptAndApply(db, part)).toEqual(
        partResult,
      )
      await expect(
        recordCustomerLedgerReceiptAndApply(db, {
          ...part,
          amountMinor: "999",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(await audit(part.clientCommandId)).toMatchObject({
        id: partResult.id,
        audit: {
          receiptId: partResult.id,
          appliedMinor: "1000",
          paidAheadMinor: "0",
        },
      })
      const rest = {
        ...receipt,
        clientCommandId: "main-pay-rest",
        amountMinor: "5000",
        description: "Rest and more",
      }
      const restResult = await recordCustomerLedgerReceiptAndApply(db, rest)
      expect(await audit(rest.clientCommandId)).toMatchObject({
        audit: { appliedMinor: "2000", paidAheadMinor: "3000" },
      })
      const ahead = {
        ...receipt,
        clientCommandId: "main-pay-ahead",
        amountMinor: "700",
        description: "Nothing left owing",
      }
      const aheadResult = await recordCustomerLedgerReceiptAndApply(db, ahead)
      expect(await audit(ahead.clientCommandId)).toMatchObject({
        audit: { appliedMinor: "0", paidAheadMinor: "700", allocations: [] },
      })
      const receipts = await db.customerLedgerReceipt.findMany({
        where: { accountId: main.account.id },
      })
      expect(receipts.map((row) => row.id).sort()).toEqual(
        [partResult.id, restResult.id, aheadResult.id].sort(),
      )
      const allocations = await db.customerLedgerAllocation.findMany({
        where: { accountId: main.account.id },
        orderBy: { sequence: "asc" },
      })
      expect(allocations.map((row) => row.amountMinor.toString())).toEqual([
        "1000",
        "2000",
      ])
      expect(
        await db.financeJournalEntry.count({
          where: { bookId, sourceKind: "CUSTOMER_RECEIPT" },
        }),
      ).toBe(3)
      expect(
        await db.financeJournalEntry.count({
          where: { bookId, sourceKind: "CUSTOMER_CREDIT_ALLOCATION" },
        }),
      ).toBe(2)
      const balance = await balances()
      // Early buyer opening 3000 is still owed; main buyer is fully settled.
      expect(balance("RECEIVABLE")).toBe("3000")
      expect(balance("CUSTOMER_ADVANCE")).toBe("3700")
      expect(balance("CASH")).toBe("6700")
      expect(balance("OPENING_EQUITY")).toBe("6000")
      expect(balance("SALES")).toBe("0")

      // A receipt-and-apply into a closed period after real history still
      // writes nothing.
      await lock(new Date(Date.now() + 120_000))
      before = await facts(main.account.id)
      await expect(
        recordCustomerLedgerReceiptAndApply(db, {
          ...receipt,
          clientCommandId: "main-pay-closed-later",
        }),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      expect(await facts(main.account.id)).toEqual(before)
      // Saved commands still replay under the lock.
      expect(await recordCustomerLedgerReceiptAndApply(db, part)).toEqual(
        partResult,
      )
      await lock(null)

      const totals = await db.financeJournalLine.groupBy({
        by: ["entryId"],
        where: { bookId },
        _sum: { debitMinor: true, creditMinor: true },
      })
      for (const row of totals)
        expect(row._sum.debitMinor).toBe(row._sum.creditMinor)
    } finally {
      if (bookId) {
        const owned = await db.financeBook.findUniqueOrThrow({
          where: { id: bookId },
          select: { tenantId: true },
        })
        refuseCleanup(owned.tenantId !== tenantId)
      }
      if (tenantId) {
        const tenant = await db.tenant.findUniqueOrThrow({
          where: { id: tenantId },
        })
        refuseCleanup(
          tenant.slug !== slug || tenant.dataClassification !== "QA",
        )
        await db.$transaction(
          async (tx) => {
            const ledgerAccounts = await tx.customerLedgerAccount.findMany({
              where: { tenantId },
              select: { id: true },
            })
            const accountIds = ledgerAccounts.map((row) => row.id)
            await tx.customerLedgerAllocationRelease.deleteMany({
              where: { allocation: { accountId: { in: accountIds } } },
            })
            await tx.customerLedgerAllocation.deleteMany({
              where: { accountId: { in: accountIds } },
            })
            await tx.customerLedgerReceipt.deleteMany({
              where: { accountId: { in: accountIds } },
            })
            await tx.customerLedgerCommand.deleteMany({
              where: { accountId: { in: accountIds } },
            })
            await tx.customerLedgerEntry.deleteMany({
              where: { accountId: { in: accountIds } },
            })
            await tx.customerLedgerAccount.deleteMany({
              where: { id: { in: accountIds } },
            })
            if (bookId) {
              const scope = { bookId }
              await tx.financeCommand.deleteMany({ where: scope })
              await tx.financeJournalLine.deleteMany({ where: scope })
              await tx.financeJournalEntry.deleteMany({
                where: { ...scope, reversalOfId: { not: null } },
              })
              await tx.financeJournalEntry.deleteMany({ where: scope })
              await tx.financeAccount.deleteMany({ where: scope })
              await tx.financeBook.delete({ where: { id: bookId } })
            }
            await tx.commercialOrder.deleteMany({ where: { tenantId } })
            await tx.store.deleteMany({ where: { tenantId } })
            await tx.customer.deleteMany({ where: { tenantId } })
            await tx.tenant.delete({ where: { id: tenantId } })
          },
          { maxWait: 10_000, timeout: 60_000 },
        )
      }
      await db.user.delete({ where: { id: user.id } })
      expect(await db.tenant.count({ where: { slug } })).toBe(0)
    }
  }, 240_000)
})
