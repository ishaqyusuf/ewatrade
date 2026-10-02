import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, lockFinanceBook } from "./access"
import { financeDocumentCommand } from "./commands"
import { resolveNextFinanceFiscalPeriod } from "./fiscal-calendar"
import { ensureFinanceRetainedEarningsAccount } from "./retained-earnings"
import { FinanceError } from "./rules"

export type FinanceFiscalSettingsInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  startMonth: number
  startDay: number
  expectedRevision: number
  reason: string
}

export async function configureFinanceFiscalCalendar(
  db: PrismaClient,
  supplied: FinanceFiscalSettingsInput,
) {
  // Copy before asynchronous locks; callers cannot change the reviewed command.
  const input = { ...supplied, reason: supplied.reason.trim() }
  if (
    !input.reason ||
    input.reason.length > 400 ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision >= 2147483647
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A setup reason and current fiscal settings revision are required.",
    )
  const payload = {
    bookId: input.bookId,
    startMonth: input.startMonth,
    startDay: input.startDay,
    expectedRevision: input.expectedRevision,
    reason: input.reason,
  }
  return db
    .$transaction(
      (tx) =>
        financeDocumentCommand(
          tx,
          input,
          "FISCAL_CALENDAR_SETUP",
          payload,
          async (book) => {
            resolveNextFinanceFiscalPeriod({
              startMonth: input.startMonth,
              startDay: input.startDay,
              bookStartsAt: book.startsAt,
              now: new Date(),
            })
            const previous = await tx.financeFiscalCalendar.findUnique({
              where: { bookId: book.id },
            })
            if ((previous?.revision ?? 0) !== input.expectedRevision)
              throw new FinanceError(
                "CONFLICT",
                "Fiscal settings changed. Review the current settings before saving.",
              )
            if (
              previous &&
              (previous.startMonth !== input.startMonth ||
                previous.startDay !== input.startDay) &&
              (await tx.financeFiscalYear.findFirst({
                where: { bookId: book.id },
                select: { id: true },
              }))
            )
              throw new FinanceError(
                "CONFLICT",
                "Fiscal dates are fixed once fiscal history exists.",
              )
            const retained = await ensureFinanceRetainedEarningsAccount(
              tx,
              book.id,
            )
            if (previous && previous.retainedEarningsAccountId !== retained.id)
              throw new FinanceError(
                "CONFLICT",
                "The original retained-earnings control changed. Resolve it before fiscal setup.",
              )
            if (
              previous &&
              previous.startMonth === input.startMonth &&
              previous.startDay === input.startDay
            )
              return {
                id: previous.id,
                audit: {
                  reason: input.reason,
                  revision: previous.revision,
                  changed: false,
                },
              }
            const calendar = previous
              ? await tx.financeFiscalCalendar.update({
                  where: { id: previous.id },
                  data: {
                    startMonth: input.startMonth,
                    startDay: input.startDay,
                    revision: { increment: 1 },
                    updatedById: input.actorUserId,
                  },
                })
              : await tx.financeFiscalCalendar.create({
                  data: {
                    bookId: book.id,
                    startMonth: input.startMonth,
                    startDay: input.startDay,
                    retainedEarningsAccountId: retained.id,
                    createdById: input.actorUserId,
                    updatedById: input.actorUserId,
                  },
                })
            return {
              id: calendar.id,
              audit: {
                reason: input.reason,
                before: previous
                  ? {
                      startMonth: previous.startMonth,
                      startDay: previous.startDay,
                      revision: previous.revision,
                    }
                  : null,
                after: {
                  startMonth: calendar.startMonth,
                  startDay: calendar.startDay,
                  revision: calendar.revision,
                },
                retainedEarningsAccountId: retained.id,
                actorUserId: input.actorUserId,
                at: new Date().toISOString(),
              },
            }
          },
        ),
      { maxWait: 10_000, timeout: 30_000 },
    )
    .then((result) => ({ id: result.id }))
}

export async function getFinanceFiscalCalendar(
  db: PrismaClient,
  supplied: FinanceActor & { bookId: string },
) {
  const input = { ...supplied }
  return db.$transaction(
    async (tx) => {
      const book = await lockFinanceBook(tx, input)
      const calendar = await tx.financeFiscalCalendar.findUnique({
        where: { bookId: book.id },
        include: { retainedEarningsAccount: true },
      })
      const fiscalHistoryExists = Boolean(
        await tx.financeFiscalYear.findFirst({
          where: { bookId: book.id },
          select: { id: true },
        }),
      )
      const controls = await tx.financeAccount.findMany({
        where: { bookId: book.id, purpose: "RETAINED_EARNINGS" },
        take: 2,
      })
      const controlValid = Boolean(
        calendar &&
          controls.length === 1 &&
          controls[0]?.id === calendar.retainedEarningsAccountId &&
          calendar.retainedEarningsAccount.kind === "EQUITY" &&
          calendar.retainedEarningsAccount.archivedAt === null,
      )
      return {
        bookId: book.id,
        currencyCode: book.currencyCode,
        calendar,
        fiscalHistoryExists,
        controlValid,
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
