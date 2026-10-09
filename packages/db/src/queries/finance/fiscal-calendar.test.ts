import { describe, expect, test } from "bun:test"
import { resolveNextFinanceFiscalPeriod } from "./fiscal-calendar"
import { FinanceError } from "./rules"

const now = new Date("2026-10-02T12:00:00.000Z")

function resolve(input: {
  startMonth: number
  startDay: number
  bookStartsAt: string
  previousFiscalCloseEnd?: string | null
  now?: Date
}) {
  return resolveNextFinanceFiscalPeriod({
    startMonth: input.startMonth,
    startDay: input.startDay,
    bookStartsAt: new Date(input.bookStartsAt),
    ...(input.previousFiscalCloseEnd === undefined
      ? {}
      : {
          previousFiscalCloseEnd:
            input.previousFiscalCloseEnd === null
              ? null
              : new Date(input.previousFiscalCloseEnd),
        }),
    now: input.now ?? now,
  })
}

function expectFinanceError(action: () => unknown, code: FinanceError["code"]) {
  try {
    action()
    throw new Error("Expected a FinanceError")
  } catch (error) {
    expect(error).toBeInstanceOf(FinanceError)
    expect(error).toMatchObject({ code })
  }
}

describe("resolveNextFinanceFiscalPeriod", () => {
  test("uses an exact annual Book boundary as a full first period", () => {
    const period = resolve({
      startMonth: 4,
      startDay: 1,
      bookStartsAt: "2025-04-01T00:00:00.000Z",
    })

    expect(period).toEqual({
      fiscalStart: new Date("2025-04-01T00:00:00.000Z"),
      fiscalEnd: new Date("2026-03-31T23:59:59.999Z"),
      firstPeriodStub: false,
      cutoffCompleted: true,
    })
  })

  test("preserves the exact Book start and cuts a short first period at the next boundary", () => {
    const period = resolve({
      startMonth: 4,
      startDay: 1,
      bookStartsAt: "2025-11-15T09:08:07.006Z",
    })

    expect(period.fiscalStart).toEqual(new Date("2025-11-15T09:08:07.006Z"))
    expect(period.fiscalEnd).toEqual(new Date("2026-03-31T23:59:59.999Z"))
    expect(period.firstPeriodStub).toBe(true)
  })

  test("creates a stub whether the Book starts before or after the annual boundary", () => {
    const before = resolve({
      startMonth: 7,
      startDay: 1,
      bookStartsAt: "2025-01-01T00:00:00.000Z",
    })
    const after = resolve({
      startMonth: 7,
      startDay: 1,
      bookStartsAt: "2025-08-11T00:00:00.000Z",
    })

    expect(before.fiscalEnd).toEqual(new Date("2025-06-30T23:59:59.999Z"))
    expect(after.fiscalEnd).toEqual(new Date("2026-06-30T23:59:59.999Z"))
    expect(before.firstPeriodStub).toBe(true)
    expect(after.firstPeriodStub).toBe(true)
  })

  test("continues at the next millisecond after a valid previous fiscal close", () => {
    const period = resolve({
      startMonth: 4,
      startDay: 1,
      bookStartsAt: "2024-07-12T15:30:00.000Z",
      previousFiscalCloseEnd: "2025-03-31T23:59:59.999Z",
    })

    expect(period).toEqual({
      fiscalStart: new Date("2025-04-01T00:00:00.000Z"),
      fiscalEnd: new Date("2026-03-31T23:59:59.999Z"),
      firstPeriodStub: false,
      cutoffCompleted: true,
    })
  })

  test("handles calendar-year rollover from an October fiscal start", () => {
    const period = resolve({
      startMonth: 10,
      startDay: 1,
      bookStartsAt: "2024-08-15T10:00:00.000Z",
      previousFiscalCloseEnd: "2025-09-30T23:59:59.999Z",
    })

    expect(period.fiscalStart).toEqual(new Date("2025-10-01T00:00:00.000Z"))
    expect(period.fiscalEnd).toEqual(new Date("2026-09-30T23:59:59.999Z"))
    expect(period.firstPeriodStub).toBe(false)
  })

  test("keeps February 29 inside a leap-year period when the configured start is March 1", () => {
    const period = resolve({
      startMonth: 3,
      startDay: 1,
      bookStartsAt: "2023-03-01T00:00:00.000Z",
      now: new Date("2024-03-01T00:00:00.000Z"),
    })

    expect(period.fiscalEnd).toEqual(new Date("2024-02-29T23:59:59.999Z"))
    expect(period.cutoffCompleted).toBe(true)
  })

  test("requires the next cutoff to be strictly before the explicit current time", () => {
    const incomplete = resolve({
      startMonth: 1,
      startDay: 1,
      bookStartsAt: "2025-01-01T00:00:00.000Z",
      now: new Date("2025-12-31T23:59:59.999Z"),
    })
    const completed = resolve({
      startMonth: 1,
      startDay: 1,
      bookStartsAt: "2025-01-01T00:00:00.000Z",
      now: new Date("2026-01-01T00:00:00.000Z"),
    })

    expect(incomplete.cutoffCompleted).toBe(false)
    expect(completed.cutoffCompleted).toBe(true)
  })

  test("rejects invalid recurring month/day values, including February 29", () => {
    const invalidMonthDays: ReadonlyArray<readonly [number, number]> = [
      [0, 1],
      [13, 1],
      [4, 0],
      [4, 31],
      [2, 29],
      [2, 30],
    ]
    for (const [startMonth, startDay] of invalidMonthDays) {
      expectFinanceError(
        () =>
          resolve({
            startMonth,
            startDay,
            bookStartsAt: "2025-01-01T00:00:00.000Z",
          }),
        "INVALID_JOURNAL",
      )
    }
  })

  test("rejects invalid, future, or impossible Book start dates", () => {
    for (const bookStartsAt of ["not-a-date", "2026-10-02T12:00:00.001Z"]) {
      expectFinanceError(
        () => resolve({ startMonth: 1, startDay: 1, bookStartsAt }),
        "INVALID_JOURNAL",
      )
    }
  })

  test("rejects a previous close before the Book start", () => {
    expectFinanceError(
      () =>
        resolve({
          startMonth: 4,
          startDay: 1,
          bookStartsAt: "2025-01-01T00:00:00.000Z",
          previousFiscalCloseEnd: "2024-03-31T23:59:59.999Z",
        }),
      "CONFLICT",
    )
  })

  test("rejects non-UTC-end-of-day, noncanonical, and future prior closes", () => {
    for (const previousFiscalCloseEnd of [
      "2025-03-31T23:59:59.998Z",
      "2025-03-30T23:59:59.999Z",
      "2026-10-02T23:59:59.999Z",
    ]) {
      expectFinanceError(
        () =>
          resolve({
            startMonth: 4,
            startDay: 1,
            bookStartsAt: "2024-01-01T00:00:00.000Z",
            previousFiscalCloseEnd,
          }),
        "CONFLICT",
      )
    }
  })

  test("rejects a UTC close whose next-millisecond boundary misses the configured year", () => {
    expectFinanceError(
      () =>
        resolve({
          startMonth: 4,
          startDay: 1,
          bookStartsAt: "2024-01-01T00:00:00.000Z",
          previousFiscalCloseEnd: "2025-02-28T23:59:59.999Z",
        }),
      "CONFLICT",
    )
  })
})

test("fiscal calendar preserves nullable first-close state and rejects invalid current time or fractional boundaries", () => {
  const bookStartsAt = new Date("2025-08-01T12:30:00.000Z")
  const period = resolveNextFinanceFiscalPeriod({
    startMonth: 1,
    startDay: 1,
    bookStartsAt,
    previousFiscalCloseEnd: null,
    now,
  })
  bookStartsAt.setUTCFullYear(2030)
  expect(period.fiscalStart).toEqual(new Date("2025-08-01T12:30:00.000Z"))
  expect(period.fiscalEnd).toEqual(new Date("2025-12-31T23:59:59.999Z"))
  for (const changed of [
    { startMonth: 1, startDay: 1, now: new Date("invalid") },
    { startMonth: 1.5, startDay: 1, now },
    { startMonth: 1, startDay: 1.5, now },
  ])
    expectFinanceError(
      () =>
        resolveNextFinanceFiscalPeriod({
          ...changed,
          bookStartsAt: new Date("2025-08-01T12:30:00.000Z"),
        }),
      "INVALID_JOURNAL",
    )
})
