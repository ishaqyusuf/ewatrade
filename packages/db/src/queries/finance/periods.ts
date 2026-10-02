import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { financeDocumentCommand } from "./commands"
import { FinanceError } from "./rules"

type PeriodCommand = FinanceActor & {
  bookId: string
  clientCommandId: string
  reason: string
  expectedSnapshotSequence: string
} & (
    | { action: "CLOSE"; through: Date }
    | { action: "REOPEN"; periodId: string }
  )

export async function changeFinancePeriod(
  db: PrismaClient,
  input: PeriodCommand,
) {
  const reason = input.reason.trim()
  if (
    !reason ||
    reason.length > 400 ||
    !/^(0|[1-9]\d{0,18})$/.test(input.expectedSnapshotSequence)
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A reason and reviewed journal snapshot are required.",
    )
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return db
    .$transaction(
      (tx) =>
        financeDocumentCommand(
          tx,
          input,
          `PERIOD_${input.action}`,
          payload,
          async (book) => {
            if (BigInt(input.expectedSnapshotSequence) !== book.lastSequence)
              throw new FinanceError(
                "CONFLICT",
                "New finance entries were recorded. Review the latest reports before changing the period.",
              )
            const now = new Date()
            const before = book.closedThrough
            if (input.action === "CLOSE") {
              const through = input.through
              const startsAt = before
                ? new Date(before.getTime() + 1)
                : book.startsAt
              if (
                !Number.isFinite(through.getTime()) ||
                through < startsAt ||
                through >= now ||
                through.toISOString().slice(11) !== "23:59:59.999Z"
              )
                throw new FinanceError(
                  "INVALID_JOURNAL",
                  "Choose a completed UTC day after the current lock date.",
                )
              const sums = await tx.financeJournalLine.aggregate({
                where: {
                  bookId: book.id,
                  entry: { effectiveAt: { lte: through } },
                },
                _sum: { debitMinor: true, creditMinor: true },
              })
              if (
                (sums._sum.debitMinor ?? BigInt(0)) !==
                (sums._sum.creditMinor ?? BigInt(0))
              )
                throw new FinanceError(
                  "CONFLICT",
                  "Resolve the journal imbalance before closing this period.",
                )
              const existing = await tx.financePeriod.findUnique({
                where: { bookId_startsAt: { bookId: book.id, startsAt } },
              })
              if (
                existing &&
                (existing.endsAt.getTime() !== through.getTime() ||
                  !existing.reopenedAt)
              )
                throw new FinanceError(
                  "CONFLICT",
                  "Reclose the existing reopened period using its original end date.",
                )
              const data = {
                endsAt: through,
                closedAt: now,
                closedById: input.actorUserId,
                reopenedAt: null,
                reopenedById: null,
                reason,
              }
              const period = existing
                ? await tx.financePeriod.update({
                    where: { id: existing.id },
                    data,
                  })
                : await tx.financePeriod.create({
                    data: { bookId: book.id, startsAt, ...data },
                  })
              await tx.financeBook.update({
                where: { id: book.id },
                data: { closedThrough: through },
              })
              return {
                id: period.id,
                audit: {
                  action: input.action,
                  reason,
                  at: now.toISOString(),
                  startsAt: startsAt.toISOString(),
                  endsAt: through.toISOString(),
                  before: before?.toISOString() ?? null,
                  after: through.toISOString(),
                  snapshotSequence: book.lastSequence.toString(),
                },
              }
            }
            const period = await tx.financePeriod.findFirst({
              where: {
                id: input.periodId,
                bookId: book.id,
                closedAt: { not: null },
                reopenedAt: null,
              },
            })
            if (
              !period ||
              !before ||
              period.endsAt.getTime() !== before.getTime()
            )
              throw new FinanceError(
                "CONFLICT",
                "Only the latest closed period can be reopened.",
              )
            const previous = await tx.financePeriod.findFirst({
              where: {
                bookId: book.id,
                closedAt: { not: null },
                reopenedAt: null,
                endsAt: { lt: period.startsAt },
              },
              orderBy: { endsAt: "desc" },
            })
            await tx.financePeriod.update({
              where: { id: period.id },
              data: {
                reopenedAt: now,
                reopenedById: input.actorUserId,
                reason,
              },
            })
            await tx.financeBook.update({
              where: { id: book.id },
              data: { closedThrough: previous?.endsAt ?? null },
            })
            return {
              id: period.id,
              audit: {
                action: input.action,
                reason,
                at: now.toISOString(),
                startsAt: period.startsAt.toISOString(),
                endsAt: period.endsAt.toISOString(),
                before: before.toISOString(),
                after: previous?.endsAt.toISOString() ?? null,
                snapshotSequence: book.lastSequence.toString(),
              },
            }
          },
        ),
      { maxWait: 10_000, timeout: 30_000 },
    )
    .then((result) => ({ id: result.id }))
}

export async function getFinancePeriods(
  db: PrismaClient,
  input: FinanceActor & { bookId: string },
) {
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const [periods, events] = await Promise.all([
        tx.financePeriod.findMany({
          where: { bookId: book.id },
          orderBy: { startsAt: "desc" },
          take: 50,
        }),
        tx.financeCommand.findMany({
          where: {
            bookId: book.id,
            kind: { in: ["PERIOD_CLOSE", "PERIOD_REOPEN"] },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 100,
          select: {
            id: true,
            kind: true,
            actorUserId: true,
            createdAt: true,
            result: true,
          },
        }),
      ])
      return {
        closedThrough: book.closedThrough,
        snapshotSequence: book.lastSequence.toString(),
        periods,
        events,
        historyLimit: 100,
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
