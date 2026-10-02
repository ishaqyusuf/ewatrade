import { FinanceError } from "./rules"

export type FinanceFiscalCalendarInput = {
  startMonth: number
  startDay: number
  bookStartsAt: Date
  previousFiscalCloseEnd?: Date | null
  now: Date
}

export type FinanceFiscalPeriod = {
  fiscalStart: Date
  fiscalEnd: Date
  firstPeriodStub: boolean
  cutoffCompleted: boolean
}

const UTC_END_OF_DAY = [23, 59, 59, 999] as const

function invalidCalendar(
  message = "Enter a valid recurring fiscal-year start date.",
) {
  return new FinanceError("INVALID_JOURNAL", message)
}

function conflict(message: string) {
  return new FinanceError("CONFLICT", message)
}

function isValidDate(value: Date) {
  return Number.isFinite(value.getTime())
}

function validateCalendar(startMonth: number, startDay: number) {
  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (
    !Number.isInteger(startMonth) ||
    startMonth < 1 ||
    startMonth > 12 ||
    !Number.isInteger(startDay) ||
    startDay < 1 ||
    startDay > (monthLengths[startMonth - 1] ?? 0)
  )
    throw invalidCalendar()
}

function utcMidnight(year: number, month: number, day: number) {
  const value = new Date(0)
  value.setUTCFullYear(year, month - 1, day)
  value.setUTCHours(0, 0, 0, 0)
  if (!isValidDate(value))
    throw invalidCalendar("Fiscal-year boundary is out of range.")
  return value
}

function isStartBoundary(value: Date, startMonth: number, startDay: number) {
  return (
    value.getUTCMonth() + 1 === startMonth &&
    value.getUTCDate() === startDay &&
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  )
}

function nextStartBoundary(after: Date, startMonth: number, startDay: number) {
  const year = after.getUTCFullYear()
  const thisYear = utcMidnight(year, startMonth, startDay)
  const nextYear = () => utcMidnight(year + 1, startMonth, startDay)
  const boundary = thisYear.getTime() > after.getTime() ? thisYear : nextYear()
  return boundary
}

function isUtcEndOfDay(value: Date) {
  return (
    value.getUTCHours() === UTC_END_OF_DAY[0] &&
    value.getUTCMinutes() === UTC_END_OF_DAY[1] &&
    value.getUTCSeconds() === UTC_END_OF_DAY[2] &&
    value.getUTCMilliseconds() === UTC_END_OF_DAY[3]
  )
}

/** Resolve the next configured fiscal period without inferring a calendar. */
export function resolveNextFinanceFiscalPeriod(
  input: FinanceFiscalCalendarInput,
): FinanceFiscalPeriod {
  validateCalendar(input.startMonth, input.startDay)
  if (!isValidDate(input.now))
    throw invalidCalendar("The current time is invalid.")
  if (!isValidDate(input.bookStartsAt))
    throw invalidCalendar("The finance book start date is invalid.")
  if (input.bookStartsAt.getTime() > input.now.getTime())
    throw invalidCalendar("The finance book cannot start in the future.")

  const previousEnd = input.previousFiscalCloseEnd
  let fiscalStart = new Date(input.bookStartsAt.getTime())
  let firstPeriodStub = !isStartBoundary(
    input.bookStartsAt,
    input.startMonth,
    input.startDay,
  )

  if (previousEnd !== undefined && previousEnd !== null) {
    if (!isValidDate(previousEnd))
      throw conflict("The previous fiscal close date is invalid.")
    if (previousEnd.getTime() < input.bookStartsAt.getTime())
      throw conflict(
        "The previous fiscal close precedes the finance book start.",
      )
    if (previousEnd.getTime() >= input.now.getTime())
      throw conflict("The previous fiscal close must be completed in the past.")
    if (!isUtcEndOfDay(previousEnd))
      throw conflict(
        "The previous fiscal close must use a completed UTC end-of-day cutoff.",
      )

    fiscalStart = new Date(previousEnd.getTime() + 1)
    if (!isStartBoundary(fiscalStart, input.startMonth, input.startDay))
      throw conflict(
        "The previous fiscal close does not match the configured annual boundary.",
      )
    firstPeriodStub = false
  }

  const nextBoundary = nextStartBoundary(
    fiscalStart,
    input.startMonth,
    input.startDay,
  )
  const fiscalEnd = new Date(nextBoundary.getTime() - 1)
  if (!isValidDate(fiscalEnd))
    throw invalidCalendar("Fiscal-year boundary is out of range.")

  return {
    fiscalStart,
    fiscalEnd,
    firstPeriodStub,
    cutoffCompleted: fiscalEnd.getTime() < input.now.getTime(),
  }
}
