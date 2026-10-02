import { resolveNextFinanceFiscalPeriod } from "./fiscal-calendar"
import { FINANCE_FISCAL_MAX_YEARS } from "./fiscal-limits"
import { FinanceError } from "./rules"

type HistoryEvent = {
  id: string
  bookId: string
  fiscalYearId: string
  kind: string
  retainedEarningsAccountId: string
  snapshotSequence: bigint
  resultingSequence: bigint
  effectiveAt: Date
  recordedAt: Date
  reversalOfId: string | null
}

type HistoryYear = {
  id: string
  bookId: string
  calendarId: string
  calendarRevision: number
  startMonth: number
  startDay: number
  startsAt: Date
  endsAt: Date
  firstPeriodStub: boolean
  activeCloseId: string | null
  events: HistoryEvent[]
}

export type FinanceFiscalHistoryInput = {
  bookId: string
  bookStartsAt: Date
  snapshotSequence: bigint
  calendar: {
    id: string
    bookId: string
    revision: number
    startMonth: number
    startDay: number
    retainedEarningsAccountId: string
  }
  years: HistoryYear[]
  now: Date
}

function inconsistent(): never {
  throw new FinanceError(
    "CONFLICT",
    "Fiscal history is inconsistent. Resolve the original close and reversal chain.",
  )
}

/** Metadata chain only: caller must separately verify every original journal. */
export function resolveFinanceFiscalHistoryPeriod(
  input: FinanceFiscalHistoryInput,
) {
  const { calendar } = input
  if (
    calendar.bookId !== input.bookId ||
    !Number.isInteger(calendar.revision) ||
    calendar.revision < 1 ||
    input.snapshotSequence < 0n ||
    input.snapshotSequence > 9223372036854775807n ||
    input.years.reduce((count, year) => count + year.events.length, 0) >
      FINANCE_FISCAL_MAX_YEARS * 4 ||
    input.years.length > FINANCE_FISCAL_MAX_YEARS
  )
    return inconsistent()
  const years = [...input.years].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  )
  const yearIds = new Set<string>()
  const eventIds = new Set<string>()
  let previousEnd: Date | null = null
  let previousResult = 0n
  for (const [index, year] of years.entries()) {
    const expected = resolveNextFinanceFiscalPeriod({
      startMonth: calendar.startMonth,
      startDay: calendar.startDay,
      bookStartsAt: input.bookStartsAt,
      previousFiscalCloseEnd: previousEnd,
      now: input.now,
    })
    if (
      year.bookId !== input.bookId ||
      year.calendarId !== calendar.id ||
      year.calendarRevision !== calendar.revision ||
      year.startMonth !== calendar.startMonth ||
      year.startDay !== calendar.startDay ||
      year.startsAt.getTime() !== expected.fiscalStart.getTime() ||
      year.endsAt.getTime() !== expected.fiscalEnd.getTime() ||
      year.firstPeriodStub !== expected.firstPeriodStub ||
      !expected.cutoffCompleted ||
      yearIds.has(year.id) ||
      year.events.length === 0 ||
      year.events.length > FINANCE_FISCAL_MAX_YEARS * 4
    )
      return inconsistent()
    yearIds.add(year.id)
    const events = new Map(year.events.map((event) => [event.id, event]))
    if (events.size !== year.events.length) return inconsistent()
    const reversed = new Set<string>()
    for (const event of year.events) {
      if (
        eventIds.has(event.id) ||
        event.bookId !== input.bookId ||
        event.fiscalYearId !== year.id ||
        event.retainedEarningsAccountId !==
          calendar.retainedEarningsAccountId ||
        event.snapshotSequence < previousResult ||
        event.resultingSequence < event.snapshotSequence ||
        event.resultingSequence > input.snapshotSequence ||
        event.effectiveAt.getTime() !== year.endsAt.getTime() ||
        !Number.isFinite(event.recordedAt.getTime()) ||
        event.recordedAt <= year.endsAt ||
        event.recordedAt > input.now
      )
        return inconsistent()
      eventIds.add(event.id)
      if (event.kind === "CLOSE") {
        if (event.reversalOfId !== null) return inconsistent()
      } else if (event.kind === "REVERSE") {
        const original = event.reversalOfId
          ? events.get(event.reversalOfId)
          : undefined
        if (
          !original ||
          original.kind !== "CLOSE" ||
          original.resultingSequence > event.snapshotSequence ||
          original.recordedAt > event.recordedAt ||
          reversed.has(original.id)
        )
          return inconsistent()
        reversed.add(original.id)
      } else return inconsistent()
    }
    const unReversed = year.events.filter(
      (event) => event.kind === "CLOSE" && !reversed.has(event.id),
    )
    const ordered = [...year.events].sort((a, b) => {
      const time = a.recordedAt.getTime() - b.recordedAt.getTime()
      if (time) return time
      if (a.resultingSequence !== b.resultingSequence)
        return a.resultingSequence < b.resultingSequence ? -1 : 1
      if (a.reversalOfId === b.id) return 1
      if (b.reversalOfId === a.id) return -1
      // Unrelated cycles at the same timestamp/watermark cannot establish order.
      return inconsistent()
    })
    let currentClose: string | null = null
    let lastResult = previousResult
    for (const event of ordered) {
      if (event.snapshotSequence < lastResult) return inconsistent()
      if (event.kind === "CLOSE") {
        if (currentClose !== null) return inconsistent()
        currentClose = event.id
      } else {
        if (currentClose !== event.reversalOfId) return inconsistent()
        currentClose = null
      }
      lastResult = event.resultingSequence
    }
    if (currentClose !== year.activeCloseId) return inconsistent()
    const active = year.activeCloseId ? events.get(year.activeCloseId) : null
    if (
      (active &&
        (active.kind !== "CLOSE" ||
          unReversed.length !== 1 ||
          unReversed[0]?.id !== active.id ||
          year.events.some(
            (event) =>
              event.resultingSequence > active.resultingSequence ||
              event.recordedAt > active.recordedAt,
          ))) ||
      (!active && (year.activeCloseId !== null || unReversed.length !== 0))
    )
      return inconsistent()
    if (!active) {
      if (index !== years.length - 1) return inconsistent()
      // A reversed latest year must be reclosed using its original dates.
      return { ...expected, fiscalYearId: year.id, reclose: true as const }
    }
    previousEnd = new Date(year.endsAt)
    previousResult = active.resultingSequence
  }
  return {
    ...resolveNextFinanceFiscalPeriod({
      startMonth: calendar.startMonth,
      startDay: calendar.startDay,
      bookStartsAt: input.bookStartsAt,
      previousFiscalCloseEnd: previousEnd,
      now: input.now,
    }),
    fiscalYearId: null,
    reclose: false as const,
  }
}
