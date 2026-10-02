import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import {
  configureFinanceFiscalCalendar,
  getFinanceFiscalCalendar,
} from "./fiscal-settings"
import { recordFinanceMoneyMovement } from "./money"
import { getFinanceAccountBalances } from "./reads"

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing fixture row: ${label}`)
  return value
}

describeWithServiceCommerceDatabase(
  "finance fiscal settings persistence",
  () => {
    test("provisions the retained control and persists bounded fiscal-close history", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      const userIds: string[] = []
      const tenantIds: string[] = []
      const bookIds: string[] = []
      const fixtureEmails: string[] = []
      const fixtureSlugs: string[] = []

      async function makeFixture(label: string, startsAt: Date) {
        fixtureEmails.push(`fiscal-${label}-${runId}@example.invalid`)
        const user = await db.user.create({
          data: {
            email: `fiscal-${label}-${runId}@example.invalid`,
            name: "Fiscal settings QA",
          },
        })
        userIds.push(user.id)
        fixtureSlugs.push(`fiscal-${label}-${runId}`)
        const tenant = await db.tenant.create({
          data: {
            slug: `fiscal-${label}-${runId}`,
            name: "Fiscal settings QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantIds.push(tenant.id)
        const actor = { tenantId: tenant.id, actorUserId: user.id }
        const book = await createFinanceBook(db, { ...actor, startsAt })
        bookIds.push(book.id)
        return { actor, bookId: book.id }
      }

      async function counts(bookId: string) {
        const [
          accounts,
          calendars,
          years,
          events,
          links,
          commands,
          entries,
          lines,
        ] = await Promise.all([
          db.financeAccount.count({ where: { bookId } }),
          db.financeFiscalCalendar.count({ where: { bookId } }),
          db.financeFiscalYear.count({ where: { bookId } }),
          db.financeFiscalCloseEvent.count({ where: { bookId } }),
          db.financeFiscalCloseJournal.count({ where: { bookId } }),
          db.financeCommand.count({ where: { bookId } }),
          db.financeJournalEntry.count({ where: { bookId } }),
          db.financeJournalLine.count({ where: { bookId } }),
        ])
        return {
          accounts,
          calendars,
          years,
          events,
          links,
          commands,
          entries,
          lines,
        }
      }

      async function state(bookId: string) {
        const [rowCounts, calendar, accounts, commands, book] =
          await Promise.all([
            counts(bookId),
            db.financeFiscalCalendar.findUnique({ where: { bookId } }),
            db.financeAccount.findMany({
              where: { bookId },
              orderBy: { id: "asc" },
            }),
            db.financeCommand.findMany({
              where: { bookId },
              orderBy: { id: "asc" },
            }),
            db.financeBook.findUniqueOrThrow({
              where: { id: bookId },
              select: { lastSequence: true },
            }),
          ])
        return {
          rowCounts,
          calendar,
          accounts,
          commands,
          lastSequence: book.lastSequence.toString(),
        }
      }

      async function expectNoWrite(
        bookId: string,
        action: () => Promise<unknown>,
      ) {
        const before = await state(bookId)
        await action()
        expect(await state(bookId)).toEqual(before)
      }

      try {
        const main = await makeFixture(
          "main",
          new Date("2024-01-01T00:00:00.000Z"),
        )
        const legacy = await makeFixture(
          "legacy",
          new Date("2024-01-01T00:00:00.000Z"),
        )
        const rollback = await makeFixture(
          "rollback",
          new Date("2024-01-01T00:00:00.000Z"),
        )
        const collision = await makeFixture(
          "collision",
          new Date("2024-01-01T00:00:00.000Z"),
        )
        const foreign = await makeFixture(
          "foreign",
          new Date("2024-01-01T00:00:00.000Z"),
        )

        fixtureEmails.push(`fiscal-manager-${runId}@example.invalid`)
        const manager = await db.user.create({
          data: {
            email: `fiscal-manager-${runId}@example.invalid`,
            name: "QA Manager",
          },
        })
        userIds.push(manager.id)
        await db.membership.create({
          data: {
            tenantId: main.actor.tenantId,
            userId: manager.id,
            role: "MANAGER",
            status: "ACTIVE",
          },
        })
        fixtureEmails.push(`fiscal-inactive-${runId}@example.invalid`)
        const inactive = await db.user.create({
          data: {
            email: `fiscal-inactive-${runId}@example.invalid`,
            name: "QA Inactive Owner",
          },
        })
        userIds.push(inactive.id)
        await db.membership.create({
          data: {
            tenantId: main.actor.tenantId,
            userId: inactive.id,
            role: "OWNER",
            status: "SUSPENDED",
          },
        })

        const mainAccounts = await db.financeAccount.findMany({
          where: { bookId: main.bookId },
        })
        const mainControl = required(
          mainAccounts.find(
            (account) => account.purpose === "RETAINED_EARNINGS",
          ),
          "new-book retained earnings control",
        )
        const cash = required(
          mainAccounts.find((account) => account.purpose === "CASH"),
          "new-book cash account",
        )
        expect(mainControl).toMatchObject({
          code: "3200",
          kind: "EQUITY",
          archivedAt: null,
        })
        expect(
          mainAccounts.filter(
            (account) => account.purpose === "RETAINED_EARNINGS",
          ),
        ).toHaveLength(1)
        expect(cash).toBeDefined()
        const newBookBeforeRead = await counts(main.bookId)
        const unset = await getFinanceFiscalCalendar(db, {
          ...main.actor,
          bookId: main.bookId,
        })
        expect(unset).toMatchObject({
          calendar: null,
          fiscalHistoryExists: false,
          controlValid: false,
        })
        expect(await counts(main.bookId)).toEqual(newBookBeforeRead)

        const setup = {
          ...main.actor,
          bookId: main.bookId,
          clientCommandId: `fiscal-setup-${runId}`,
          startMonth: 4,
          startDay: 1,
          expectedRevision: 0,
          reason: "  Set the reviewed April fiscal year  ",
        }
        const configured = await configureFinanceFiscalCalendar(db, setup)
        expect(configured.id).toBeTruthy()
        expect(await configureFinanceFiscalCalendar(db, setup)).toEqual(
          configured,
        )
        const calendar = await db.financeFiscalCalendar.findUniqueOrThrow({
          where: { bookId: main.bookId },
        })
        expect(calendar).toMatchObject({
          id: configured.id,
          startMonth: 4,
          startDay: 1,
          revision: 1,
          retainedEarningsAccountId: mainControl.id,
          createdById: main.actor.actorUserId,
          updatedById: main.actor.actorUserId,
        })
        expect(
          await getFinanceFiscalCalendar(db, {
            ...main.actor,
            bookId: main.bookId,
          }),
        ).toMatchObject({
          fiscalHistoryExists: false,
          controlValid: true,
          calendar: {
            id: configured.id,
            startMonth: 4,
            startDay: 1,
            revision: 1,
          },
        })
        const command = await db.financeCommand.findUniqueOrThrow({
          where: {
            bookId_clientCommandId: {
              bookId: main.bookId,
              clientCommandId: setup.clientCommandId,
            },
          },
        })
        expect(command).toMatchObject({
          kind: "FISCAL_CALENDAR_SETUP",
          actorUserId: main.actor.actorUserId,
        })
        expect(command.result).toMatchObject({
          audit: {
            reason: "Set the reviewed April fiscal year",
            after: { revision: 1, startMonth: 4, startDay: 1 },
          },
        })

        // Inject a primary-key conflict at the final FinanceCommand insert, after
        // the real repository has provisioned the control and calendar in its
        // real interactive transaction. All other transaction delegates remain real.
        const rollbackControl = required(
          (
            await db.financeAccount.findMany({
              where: { bookId: rollback.bookId, purpose: "RETAINED_EARNINGS" },
            })
          )[0],
          "rollback-book retained earnings control",
        )
        await db.financeAccount.delete({ where: { id: rollbackControl.id } })
        const rollbackBefore = await state(rollback.bookId)
        let finalInsertAttempts = 0
        const transactionFaultDb = new Proxy(db, {
          get(target, property, receiver) {
            if (property !== "$transaction")
              return Reflect.get(target, property, receiver)
            return (
              operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
              options?: {
                maxWait?: number
                timeout?: number
                isolationLevel?: Prisma.TransactionIsolationLevel
              },
            ) =>
              target.$transaction(async (tx) => {
                const financeCommand = new Proxy(tx.financeCommand, {
                  get(delegate, method, delegateReceiver) {
                    if (method === "create")
                      return (
                        args: Parameters<typeof tx.financeCommand.create>[0],
                      ) => {
                        finalInsertAttempts++
                        return tx.financeCommand.create({
                          ...args,
                          data: { ...args.data, id: command.id },
                        })
                      }
                    const value = Reflect.get(
                      delegate,
                      method,
                      delegateReceiver,
                    )
                    return typeof value === "function"
                      ? value.bind(delegate)
                      : value
                  },
                })
                const wrappedTx = new Proxy(tx, {
                  get(transaction, key, transactionReceiver) {
                    return key === "financeCommand"
                      ? financeCommand
                      : Reflect.get(transaction, key, transactionReceiver)
                  },
                })
                return operation(wrappedTx as Prisma.TransactionClient)
              }, options)
          },
        }) as typeof db
        await expect(
          configureFinanceFiscalCalendar(transactionFaultDb, {
            ...rollback.actor,
            bookId: rollback.bookId,
            clientCommandId: `late-sql-failure-${runId}`,
            startMonth: 4,
            startDay: 1,
            expectedRevision: 0,
            reason: "Force final command insert to fail and roll back",
          }),
        ).rejects.toMatchObject({ code: "P2002" })
        expect(finalInsertAttempts).toBe(1)
        expect(await state(rollback.bookId)).toEqual(rollbackBefore)
        expect(
          await db.financeAccount.count({
            where: {
              bookId: rollback.bookId,
              purpose: "RETAINED_EARNINGS",
            },
          }),
        ).toBe(0)

        await expectNoWrite(main.bookId, async () => {
          await expect(
            configureFinanceFiscalCalendar(db, {
              ...setup,
              clientCommandId: `stale-revision-${runId}`,
              expectedRevision: 0,
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" })
        })
        await expectNoWrite(main.bookId, async () => {
          await expect(
            configureFinanceFiscalCalendar(db, {
              ...setup,
              reason: "Changed payload",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" })
        })

        // The legacy Book already has balances. Removing only its empty default control
        // reproduces a pre-migration Book without touching its posted original rows.
        const legacyAccounts = await db.financeAccount.findMany({
          where: { bookId: legacy.bookId },
        })
        const legacyControl = required(
          legacyAccounts.find(
            (account) => account.purpose === "RETAINED_EARNINGS",
          ),
          "legacy retained earnings control",
        )
        const legacyCash = required(
          legacyAccounts.find((account) => account.purpose === "CASH"),
          "legacy cash account",
        )
        expect(legacyControl).toBeDefined()
        expect(legacyCash).toBeDefined()
        await recordFinanceMoneyMovement(db, {
          ...legacy.actor,
          bookId: legacy.bookId,
          accountId: legacyCash.id,
          clientCommandId: `legacy-seed-${runId}`,
          kind: "OWNER_CONTRIBUTION",
          amountMinor: "2107",
          description: "Synthetic legacy opening balance",
          effectiveAt: new Date("2024-02-01T00:00:00.000Z"),
        })
        const legacyBalanceBefore = await getFinanceAccountBalances(db, {
          ...legacy.actor,
          bookId: legacy.bookId,
        })
        await db.financeAccount.delete({ where: { id: legacyControl.id } })
        const legacyCountsBeforeRead = await counts(legacy.bookId)
        const legacyUnset = await getFinanceFiscalCalendar(db, {
          ...legacy.actor,
          bookId: legacy.bookId,
        })
        expect(legacyUnset.calendar).toBeNull()
        expect(
          await db.financeAccount.count({
            where: { bookId: legacy.bookId, purpose: "RETAINED_EARNINGS" },
          }),
        ).toBe(0)
        expect(await counts(legacy.bookId)).toEqual(legacyCountsBeforeRead)
        const legacySetup = await configureFinanceFiscalCalendar(db, {
          ...legacy.actor,
          bookId: legacy.bookId,
          clientCommandId: `legacy-setup-${runId}`,
          startMonth: 7,
          startDay: 1,
          expectedRevision: 0,
          reason: "Provision legacy retained earnings control",
        })
        const legacyBalanceAfter = await getFinanceAccountBalances(db, {
          ...legacy.actor,
          bookId: legacy.bookId,
        })
        expect(legacyBalanceAfter.snapshotSequence).toBe(
          legacyBalanceBefore.snapshotSequence,
        )
        expect(
          legacyBalanceAfter.accounts.filter(
            (account) => account.purpose !== "RETAINED_EARNINGS",
          ),
        ).toEqual(
          legacyBalanceBefore.accounts.filter(
            (account) => account.purpose !== "RETAINED_EARNINGS",
          ),
        )
        expect(
          await db.financeAccount.count({
            where: {
              bookId: legacy.bookId,
              purpose: "RETAINED_EARNINGS",
              kind: "EQUITY",
              archivedAt: null,
            },
          }),
        ).toBe(1)
        expect(
          (
            await db.financeFiscalCalendar.findUniqueOrThrow({
              where: { bookId: legacy.bookId },
            })
          ).id,
        ).toBe(legacySetup.id)
        const legacyStateBeforeRevision = await getFinanceAccountBalances(db, {
          ...legacy.actor,
          bookId: legacy.bookId,
        })
        const legacyRevision = await configureFinanceFiscalCalendar(db, {
          ...legacy.actor,
          bookId: legacy.bookId,
          clientCommandId: `legacy-revision-${runId}`,
          startMonth: 8,
          startDay: 1,
          expectedRevision: 1,
          reason: "Advance reviewed calendar before any fiscal history",
        })
        expect(legacyRevision.id).toBe(legacySetup.id)
        expect(
          await db.financeFiscalCalendar.findUniqueOrThrow({
            where: { bookId: legacy.bookId },
          }),
        ).toMatchObject({
          id: legacySetup.id,
          startMonth: 8,
          startDay: 1,
          revision: 2,
        })
        const legacyStateAfterRevision = await getFinanceAccountBalances(db, {
          ...legacy.actor,
          bookId: legacy.bookId,
        })
        expect(legacyStateAfterRevision.snapshotSequence).toBe(
          legacyStateBeforeRevision.snapshotSequence,
        )
        expect(
          legacyStateAfterRevision.accounts.filter(
            (account) => account.purpose !== "RETAINED_EARNINGS",
          ),
        ).toEqual(
          legacyStateBeforeRevision.accounts.filter(
            (account) => account.purpose !== "RETAINED_EARNINGS",
          ),
        )

        // A code collision is never rewritten or adopted as the retained control.
        const collisionAccounts = await db.financeAccount.findMany({
          where: { bookId: collision.bookId },
        })
        const collisionControl = required(
          collisionAccounts.find(
            (account) => account.purpose === "RETAINED_EARNINGS",
          ),
          "collision-book retained earnings control",
        )
        await db.financeAccount.delete({ where: { id: collisionControl.id } })
        const collisionRow = await db.financeAccount.create({
          data: {
            bookId: collision.bookId,
            code: "3200",
            name: "Existing custom equity",
            kind: "EQUITY",
            purpose: "OTHER",
          },
        })
        await expectNoWrite(collision.bookId, async () => {
          await expect(
            configureFinanceFiscalCalendar(db, {
              ...collision.actor,
              bookId: collision.bookId,
              clientCommandId: `collision-setup-${runId}`,
              startMonth: 1,
              startDay: 1,
              expectedRevision: 0,
              reason: "Must refuse occupied control code",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" })
        })
        expect(
          await db.financeAccount.findUniqueOrThrow({
            where: { id: collisionRow.id },
          }),
        ).toMatchObject({
          code: "3200",
          name: "Existing custom equity",
          kind: "EQUITY",
          purpose: "OTHER",
        })

        const control = await db.financeAccount.findUniqueOrThrow({
          where: { id: mainControl.id },
        })
        await db.financeAccount.update({
          where: { id: control.id },
          data: { archivedAt: new Date() },
        })
        await expectNoWrite(main.bookId, async () => {
          await expect(
            configureFinanceFiscalCalendar(db, {
              ...main.actor,
              bookId: main.bookId,
              clientCommandId: `archived-${runId}`,
              startMonth: 4,
              startDay: 1,
              expectedRevision: 1,
              reason: "Check archived control",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" })
        })
        await db.financeAccount.update({
          where: { id: control.id },
          data: { archivedAt: null },
        })
        await db.financeAccount.update({
          where: { id: control.id },
          data: { kind: "INCOME" },
        })
        await expectNoWrite(main.bookId, async () => {
          await expect(
            configureFinanceFiscalCalendar(db, {
              ...main.actor,
              bookId: main.bookId,
              clientCommandId: `wrong-kind-${runId}`,
              startMonth: 4,
              startDay: 1,
              expectedRevision: 1,
              reason: "Check wrong kind",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" })
        })
        await db.financeAccount.update({
          where: { id: control.id },
          data: { kind: "EQUITY" },
        })
        const duplicateControl = await db.financeAccount.create({
          data: {
            bookId: main.bookId,
            code: `qa-re-${runId}`,
            name: "Duplicate control",
            kind: "EQUITY",
            purpose: "RETAINED_EARNINGS",
          },
        })
        await expectNoWrite(main.bookId, async () => {
          await expect(
            configureFinanceFiscalCalendar(db, {
              ...main.actor,
              bookId: main.bookId,
              clientCommandId: `duplicate-control-${runId}`,
              startMonth: 4,
              startDay: 1,
              expectedRevision: 1,
              reason: "Check duplicate control",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" })
        })
        await db.financeAccount.delete({ where: { id: duplicateControl.id } })

        await expectNoWrite(main.bookId, async () => {
          await expect(
            configureFinanceFiscalCalendar(db, {
              tenantId: main.actor.tenantId,
              actorUserId: manager.id,
              bookId: main.bookId,
              clientCommandId: `manager-${runId}`,
              startMonth: 4,
              startDay: 1,
              expectedRevision: 1,
              reason: "Manager must not configure",
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" })
        })
        await expectNoWrite(main.bookId, async () => {
          await expect(
            configureFinanceFiscalCalendar(db, {
              tenantId: main.actor.tenantId,
              actorUserId: inactive.id,
              bookId: main.bookId,
              clientCommandId: `inactive-${runId}`,
              startMonth: 4,
              startDay: 1,
              expectedRevision: 1,
              reason: "Inactive owner must not configure",
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" })
        })
        await expectNoWrite(main.bookId, async () => {
          await expect(
            configureFinanceFiscalCalendar(db, {
              ...foreign.actor,
              bookId: main.bookId,
              clientCommandId: `cross-tenant-${runId}`,
              startMonth: 4,
              startDay: 1,
              expectedRevision: 1,
              reason: "Foreign tenant must not configure",
            }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" })
        })

        await configureFinanceFiscalCalendar(db, {
          ...foreign.actor,
          bookId: foreign.bookId,
          clientCommandId: `foreign-setup-${runId}`,
          startMonth: 4,
          startDay: 1,
          expectedRevision: 0,
          reason: "Foreign fixture calendar",
        })
        const foreignCalendar =
          await db.financeFiscalCalendar.findUniqueOrThrow({
            where: { bookId: foreign.bookId },
          })
        const foreignYear = await db.financeFiscalYear.create({
          data: {
            bookId: foreign.bookId,
            calendarId: foreignCalendar.id,
            calendarRevision: foreignCalendar.revision,
            startMonth: 4,
            startDay: 1,
            startsAt: new Date("2024-01-01T00:00:00.000Z"),
            endsAt: new Date("2024-03-31T23:59:59.999Z"),
            firstPeriodStub: true,
          },
        })
        const year = await db.financeFiscalYear.create({
          data: {
            bookId: main.bookId,
            calendarId: calendar.id,
            calendarRevision: calendar.revision,
            startMonth: 4,
            startDay: 1,
            startsAt: new Date("2024-01-01T00:00:00.000Z"),
            endsAt: new Date("2024-03-31T23:59:59.999Z"),
            firstPeriodStub: true,
          },
        })
        await expectNoWrite(main.bookId, async () => {
          await expect(
            configureFinanceFiscalCalendar(db, {
              ...main.actor,
              bookId: main.bookId,
              clientCommandId: `change-after-history-${runId}`,
              startMonth: 5,
              startDay: 1,
              expectedRevision: 1,
              reason: "Fiscal dates are fixed after history",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" })
        })
        await expect(
          Promise.resolve(
            db.financeFiscalYear.create({
              data: {
                bookId: main.bookId,
                calendarId: foreignCalendar.id,
                calendarRevision: 1,
                startMonth: 4,
                startDay: 1,
                startsAt: new Date("2025-04-01T00:00:00.000Z"),
                endsAt: new Date("2026-03-31T23:59:59.999Z"),
                firstPeriodStub: false,
              },
            }),
          ),
        ).rejects.toMatchObject({ code: "P2003" })
        await expect(
          Promise.resolve(
            db.financeFiscalCloseEvent.create({
              data: {
                bookId: main.bookId,
                fiscalYearId: foreignYear.id,
                kind: "CLOSE",
                clientCommandId: `cross-book-event-${runId}`,
                retainedEarningsAccountId: mainControl.id,
                snapshotSequence: 0n,
                resultingSequence: 0n,
                earningsMinor: "0",
                accountBalances: [],
                sourceEvidence: {},
                reason: "Cross-book/year event must fail",
                actorUserId: main.actor.actorUserId,
                effectiveAt: new Date("2024-03-31T23:59:59.999Z"),
              },
            }),
          ),
        ).rejects.toMatchObject({ code: "P2003" })

        // Isolated synthetic rows prove close/reversal persistence relations only.
        const now = new Date("2026-04-01T12:00:00.000Z")
        async function syntheticEntry(
          sourceId: string,
          sequence: bigint,
          reversalOfId?: string,
        ) {
          return db.financeJournalEntry.create({
            data: {
              bookId: main.bookId,
              sequence,
              sourceKind: "QA_FISCAL_PERSISTENCE",
              sourceId,
              payloadHash: randomUUID(),
              description: "Synthetic fiscal persistence acceptance row",
              actorUserId: main.actor.actorUserId,
              effectiveAt: now,
              ...(reversalOfId ? { reversalOfId } : {}),
            },
          })
        }
        const closeEntries = [
          await syntheticEntry(`close-${runId}-1`, 900001n),
          await syntheticEntry(`close-${runId}-2`, 900002n),
        ]
        const closeEvent = await db.financeFiscalCloseEvent.create({
          data: {
            bookId: main.bookId,
            fiscalYearId: year.id,
            kind: "CLOSE",
            clientCommandId: `qa-close-${runId}`,
            retainedEarningsAccountId: mainControl.id,
            snapshotSequence: 899999n,
            resultingSequence: 900002n,
            earningsMinor: "-17",
            accountBalances: [{ accountId: cash.id, balanceMinor: "17" }],
            sourceEvidence: {
              fixture: "isolated-schema-round-trip",
              sourceKinds: ["QA_FISCAL_PERSISTENCE"],
            },
            reason: "Synthetic close event persistence only",
            actorUserId: main.actor.actorUserId,
            effectiveAt: now,
          },
        })
        await db.financeFiscalYear.update({
          where: { id: year.id },
          data: { activeCloseId: closeEvent.id },
        })
        for (const [position, entry] of closeEntries.entries()) {
          await db.financeFiscalCloseJournal.create({
            data: {
              bookId: main.bookId,
              eventId: closeEvent.id,
              journalEntryId: entry.id,
              position,
            },
          })
        }
        const reverseEntries = [
          await syntheticEntry(
            `reverse-${runId}-1`,
            900003n,
            required(closeEntries[0], "first close journal").id,
          ),
          await syntheticEntry(
            `reverse-${runId}-2`,
            900004n,
            required(closeEntries[1], "second close journal").id,
          ),
        ]
        const reverseEvent = await db.financeFiscalCloseEvent.create({
          data: {
            bookId: main.bookId,
            fiscalYearId: year.id,
            kind: "REVERSE",
            clientCommandId: `qa-reverse-${runId}`,
            retainedEarningsAccountId: mainControl.id,
            snapshotSequence: 900002n,
            resultingSequence: 900004n,
            earningsMinor: "17",
            accountBalances: [{ accountId: cash.id, balanceMinor: "-17" }],
            sourceEvidence: {
              fixture: "isolated-schema-round-trip",
              reversesEventId: closeEvent.id,
            },
            reason: "Synthetic reversal event persistence only",
            actorUserId: main.actor.actorUserId,
            effectiveAt: now,
            reversalOfId: closeEvent.id,
          },
        })
        for (const [position, entry] of reverseEntries.entries()) {
          await db.financeFiscalCloseJournal.create({
            data: {
              bookId: main.bookId,
              eventId: reverseEvent.id,
              journalEntryId: entry.id,
              position,
            },
          })
        }
        const roundTrip = await db.financeFiscalCloseEvent.findMany({
          where: { bookId: main.bookId, fiscalYearId: year.id },
          orderBy: { recordedAt: "asc" },
          include: {
            journals: {
              orderBy: { position: "asc" },
              include: { journalEntry: true },
            },
            reversal: true,
            reversalOf: true,
          },
        })
        expect(roundTrip).toHaveLength(2)
        const storedClose = required(
          roundTrip.find((event) => event.kind === "CLOSE"),
          "round-trip close event",
        )
        const storedReversal = required(
          roundTrip.find((event) => event.kind === "REVERSE"),
          "round-trip reversal event",
        )
        expect(storedClose).toMatchObject({
          id: closeEvent.id,
          kind: "CLOSE",
          earningsMinor: "-17",
          accountBalances: [{ accountId: cash.id, balanceMinor: "17" }],
          sourceEvidence: { fixture: "isolated-schema-round-trip" },
          reversal: { id: reverseEvent.id, kind: "REVERSE" },
          journals: [
            {
              position: 0,
              journalEntry: {
                id: required(closeEntries[0], "first close journal").id,
              },
            },
            {
              position: 1,
              journalEntry: {
                id: required(closeEntries[1], "second close journal").id,
              },
            },
          ],
        })
        expect(storedReversal).toMatchObject({
          id: reverseEvent.id,
          kind: "REVERSE",
          reversalOfId: closeEvent.id,
          reversalOf: { id: closeEvent.id, kind: "CLOSE" },
          journals: [
            {
              position: 0,
              journalEntry: {
                id: required(reverseEntries[0], "first reversal journal").id,
              },
            },
            {
              position: 1,
              journalEntry: {
                id: required(reverseEntries[1], "second reversal journal").id,
              },
            },
          ],
        })
        await expect(
          Promise.resolve(
            db.financeFiscalCloseEvent.create({
              data: {
                bookId: main.bookId,
                fiscalYearId: year.id,
                kind: "CLOSE",
                clientCommandId: closeEvent.clientCommandId,
                retainedEarningsAccountId: mainControl.id,
                snapshotSequence: 900002n,
                resultingSequence: 900005n,
                earningsMinor: "0",
                accountBalances: [],
                sourceEvidence: {},
                reason: "Duplicate command key",
                actorUserId: main.actor.actorUserId,
                effectiveAt: now,
              },
            }),
          ),
        ).rejects.toMatchObject({ code: "P2002" })
        await expect(
          Promise.resolve(
            db.financeFiscalCloseEvent.create({
              data: {
                bookId: main.bookId,
                fiscalYearId: year.id,
                kind: "REVERSE",
                clientCommandId: `qa-second-reversal-${runId}`,
                retainedEarningsAccountId: mainControl.id,
                snapshotSequence: 900004n,
                resultingSequence: 900006n,
                earningsMinor: "0",
                accountBalances: [],
                sourceEvidence: {},
                reason: "Second reversal must fail",
                actorUserId: main.actor.actorUserId,
                effectiveAt: now,
                reversalOfId: closeEvent.id,
              },
            }),
          ),
        ).rejects.toMatchObject({ code: "P2002" })
        await expect(
          Promise.resolve(
            db.financeFiscalCloseJournal.create({
              data: {
                bookId: main.bookId,
                eventId: closeEvent.id,
                journalEntryId: required(
                  reverseEntries[1],
                  "second reversal journal",
                ).id,
                position: 0,
              },
            }),
          ),
        ).rejects.toMatchObject({ code: "P2002" })
        const unlinkedEntry = await syntheticEntry(
          `position-collision-${runId}`,
          900005n,
        )
        await expect(
          Promise.resolve(
            db.financeFiscalCloseJournal.create({
              data: {
                bookId: main.bookId,
                eventId: closeEvent.id,
                journalEntryId: unlinkedEntry.id,
                position: 0,
              },
            }),
          ),
        ).rejects.toMatchObject({ code: "P2002" })
        await expect(
          Promise.resolve(
            db.financeFiscalCloseJournal.create({
              data: {
                bookId: main.bookId,
                eventId: reverseEvent.id,
                journalEntryId: required(closeEntries[0], "first close journal")
                  .id,
                position: 2,
              },
            }),
          ),
        ).rejects.toMatchObject({ code: "P2002" })
        const foreignEntry = await db.financeJournalEntry.create({
          data: {
            bookId: foreign.bookId,
            sequence: 800001n,
            sourceKind: "QA_FISCAL_PERSISTENCE",
            sourceId: `foreign-${runId}`,
            payloadHash: randomUUID(),
            description: "Synthetic foreign-book row",
            actorUserId: foreign.actor.actorUserId,
            effectiveAt: now,
          },
        })
        await expect(
          Promise.resolve(
            db.financeFiscalCloseJournal.create({
              data: {
                bookId: main.bookId,
                eventId: closeEvent.id,
                journalEntryId: foreignEntry.id,
                position: 2,
              },
            }),
          ),
        ).rejects.toMatchObject({ code: "P2003" })
        await expect(
          Promise.resolve(
            db.financeFiscalCloseEvent.delete({ where: { id: closeEvent.id } }),
          ),
        ).rejects.toMatchObject({ code: "P2003" })
        await expect(
          Promise.resolve(
            db.financeJournalEntry.delete({
              where: {
                id: required(closeEntries[0], "first close journal").id,
              },
            }),
          ),
        ).rejects.toMatchObject({ code: "P2003" })
      } finally {
        // Resolve exact run-owned identities if a create committed but its response
        // was lost. Never widen cleanup to a prefix or merchant scope.
        const [ownedUsers, ownedTenants] = await Promise.all([
          db.user.findMany({
            where: { email: { in: fixtureEmails } },
            select: { id: true },
          }),
          db.tenant.findMany({
            where: { slug: { in: fixtureSlugs }, dataClassification: "QA" },
            select: { id: true },
          }),
        ])
        for (const row of ownedUsers)
          if (!userIds.includes(row.id)) userIds.push(row.id)
        for (const row of ownedTenants)
          if (!tenantIds.includes(row.id)) tenantIds.push(row.id)
        const ownedBooks = await db.financeBook.findMany({
          where: { tenantId: { in: tenantIds } },
          select: { id: true },
        })
        for (const row of ownedBooks)
          if (!bookIds.includes(row.id)) bookIds.push(row.id)
        for (const bookId of bookIds) {
          await db.$transaction(
            async (tx) => {
              await tx.financeFiscalCloseJournal.deleteMany({
                where: { bookId },
              })
              await tx.financeFiscalYear.updateMany({
                where: { bookId },
                data: { activeCloseId: null },
              })
              await tx.financeFiscalCloseEvent.deleteMany({
                where: { bookId, kind: "REVERSE" },
              })
              await tx.financeFiscalCloseEvent.deleteMany({
                where: { bookId, kind: "CLOSE" },
              })
              await tx.financeFiscalYear.deleteMany({ where: { bookId } })
              await tx.financeFiscalCalendar.deleteMany({ where: { bookId } })
              await tx.financeCommand.deleteMany({ where: { bookId } })
              await tx.financeJournalLine.deleteMany({ where: { bookId } })
              await tx.financeJournalEntry.deleteMany({
                where: { bookId, reversalOfId: { not: null } },
              })
              await tx.financeJournalEntry.deleteMany({ where: { bookId } })
              await tx.financeAccount.deleteMany({ where: { bookId } })
              await tx.financeBook.deleteMany({ where: { id: bookId } })
            },
            { maxWait: 10_000, timeout: 30_000 },
          )
        }
        for (const tenantId of tenantIds)
          await db.tenant.deleteMany({ where: { id: tenantId } })
        for (const userId of userIds)
          await db.user.deleteMany({ where: { id: userId } })
        for (const userId of userIds)
          expect(await db.membership.count({ where: { userId } })).toBe(0)
        for (const tenantId of tenantIds)
          expect(await db.tenant.count({ where: { id: tenantId } })).toBe(0)
        for (const userId of userIds)
          expect(await db.user.count({ where: { id: userId } })).toBe(0)
        for (const bookId of bookIds) {
          expect(await db.financeBook.count({ where: { id: bookId } })).toBe(0)
          expect(await db.financeAccount.count({ where: { bookId } })).toBe(0)
          expect(
            await db.financeFiscalCalendar.count({ where: { bookId } }),
          ).toBe(0)
          expect(await db.financeFiscalYear.count({ where: { bookId } })).toBe(
            0,
          )
          expect(
            await db.financeFiscalCloseEvent.count({ where: { bookId } }),
          ).toBe(0)
          expect(
            await db.financeFiscalCloseJournal.count({ where: { bookId } }),
          ).toBe(0)
          expect(await db.financeCommand.count({ where: { bookId } })).toBe(0)
          expect(
            await db.financeJournalEntry.count({ where: { bookId } }),
          ).toBe(0)
          expect(await db.financeJournalLine.count({ where: { bookId } })).toBe(
            0,
          )
        }
        console.log(
          `Fiscal settings fixture cleanup passed: ${bookIds.length * 9 + tenantIds.length + userIds.length * 2} run-owned absence checks.`,
        )
      }
    }, 240_000)
  },
)
