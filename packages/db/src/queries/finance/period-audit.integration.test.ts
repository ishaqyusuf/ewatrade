import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { listFinancePeriodAudit } from "./period-audit"

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  ) {
    throw new Error("Period audit acceptance requires exact development.")
  }
}

describeWithServiceCommerceDatabase("complete period audit paging", () => {
  test("reads 137 tied synthetic audits with exact scope and full cleanup", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    const began = Date.now()
    let userId: string | undefined
    let tenantId: string | undefined
    let bookId: string | undefined
    const ids = Array.from(
      { length: 137 },
      (_, i) => `${runId}-audit-${i.toString().padStart(3, "0")}`,
    )
    const unrelatedId = `${runId}-unrelated`
    console.info(`period-audit QA run ${runId}`)
    try {
      const user = await db.user.create({
        data: {
          email: `period-audit-${runId}@example.invalid`,
          name: "Period audit QA",
        },
      })
      userId = user.id
      const tenant = await db.tenant.create({
        data: {
          slug: `period-audit-${runId}`,
          name: "Period audit QA",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          users: { create: { userId, role: "OWNER", status: "ACTIVE" } },
        },
      })
      tenantId = tenant.id
      const actor = { tenantId, actorUserId: userId }
      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      bookId = book.id
      const createdAt = new Date("2026-10-01T12:00:00.000Z")
      await db.financeCommand.createMany({
        data: ids.map((id, i) => ({
          id,
          bookId: book.id,
          clientCommandId: id,
          kind: i % 2 ? "PERIOD_REOPEN" : "PERIOD_CLOSE",
          payloadHash: `synthetic-qa-${runId}`,
          actorUserId: user.id,
          createdAt,
          result: {
            id: `synthetic-period-${runId}`,
            audit: { reason: `Synthetic pagination ${i}`, qaOnly: true },
          },
        })),
      })
      await db.financeCommand.create({
        data: {
          id: unrelatedId,
          bookId,
          clientCommandId: unrelatedId,
          kind: "SYNTHETIC_NON_PERIOD",
          payloadHash: `synthetic-qa-${runId}`,
          actorUserId: user.id,
          result: { id: unrelatedId },
        },
      })
      const before = await db.financeCommand.findMany({
        where: { bookId },
        orderBy: { id: "asc" },
      })
      const seen: string[] = []
      let cursor: string | undefined
      let pages = 0
      do {
        const page = await listFinancePeriodAudit(db, {
          ...actor,
          bookId,
          cursor,
          limit: 30,
        })
        seen.push(...page.events.map((event) => event.id))
        expect(page.events.every((event) => event.actorUserId === userId)).toBe(
          true,
        )
        cursor = page.nextCursor ?? undefined
        pages += 1
      } while (cursor)
      expect(pages).toBe(5)
      expect(seen).toEqual(ids.toReversed())
      expect(new Set(seen).size).toBe(137)
      await expect(
        listFinancePeriodAudit(db, { ...actor, bookId, cursor: unrelatedId }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        listFinancePeriodAudit(db, {
          ...actor,
          tenantId: `${runId}-foreign`,
          bookId,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        listFinancePeriodAudit(db, { ...actor, bookId: `${runId}-foreign` }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      const after = await db.financeCommand.findMany({
        where: { bookId },
        orderBy: { id: "asc" },
      })
      expect(after).toEqual(before)
      console.info(
        JSON.stringify({
          runId,
          phase: "accepted",
          pages,
          audits: seen.length,
          originalCommandsUnchanged: true,
        }),
      )
    } finally {
      if (bookId) {
        await db.$transaction(
          async (tx) => {
            await tx.financeCommand.deleteMany({ where: { bookId } })
            await tx.financeAccount.deleteMany({ where: { bookId } })
            await tx.financeBook.delete({ where: { id: bookId } })
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
      }
      if (tenantId) await db.tenant.delete({ where: { id: tenantId } })
      if (userId) await db.user.delete({ where: { id: userId } })
      const cleanup = {
        commands: await db.financeCommand.count({
          where: { id: { in: [...ids, unrelatedId] } },
        }),
        ...(bookId
          ? {
              books: await db.financeBook.count({ where: { id: bookId } }),
              accounts: await db.financeAccount.count({ where: { bookId } }),
              periods: await db.financePeriod.count({ where: { bookId } }),
              journals: await db.financeJournalEntry.count({
                where: { bookId },
              }),
            }
          : {}),
        ...(tenantId
          ? {
              tenants: await db.tenant.count({ where: { id: tenantId } }),
              memberships: await db.membership.count({ where: { tenantId } }),
            }
          : {}),
        ...(userId
          ? { users: await db.user.count({ where: { id: userId } }) }
          : {}),
      }
      for (const count of Object.values(cleanup)) expect(count).toBe(0)
      console.info(
        JSON.stringify({
          runId,
          phase: "cleanup",
          cleanup,
          durationMs: Date.now() - began,
        }),
      )
    }
  }, 180_000)
})
