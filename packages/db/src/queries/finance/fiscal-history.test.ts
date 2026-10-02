import { expect, test } from "bun:test"
import {
  type FinanceFiscalHistoryInput,
  resolveFinanceFiscalHistoryPeriod,
} from "./fiscal-history"

function fixture(): FinanceFiscalHistoryInput {
  return {
    bookId: "book",
    bookStartsAt: new Date("2024-03-15T10:30:00Z"),
    snapshotSequence: 10n,
    now: new Date("2026-06-01T00:00:00Z"),
    calendar: {
      id: "calendar",
      bookId: "book",
      revision: 1,
      startMonth: 1,
      startDay: 1,
      retainedEarningsAccountId: "retained",
    },
    years: [],
  }
}

function year(
  start = "2024-03-15T10:30:00Z",
  end = "2024-12-31T23:59:59.999Z",
  id = "first",
) {
  const event = {
    id: `${id}-close`,
    bookId: "book",
    fiscalYearId: id,
    kind: "CLOSE",
    retainedEarningsAccountId: "retained",
    snapshotSequence: 3n,
    resultingSequence: 4n,
    effectiveAt: new Date(end),
    recordedAt: new Date("2026-01-01T00:00:00Z"),
    reversalOfId: null as string | null,
  }
  return {
    id,
    bookId: "book",
    calendarId: "calendar",
    calendarRevision: 1,
    startMonth: 1,
    startDay: 1,
    startsAt: new Date(start),
    endsAt: new Date(end),
    firstPeriodStub: id === "first",
    activeCloseId: event.id as string | null,
    events: [event],
  }
}

test("metadata resolves the exact first stub and next annual period from contiguous active history", () => {
  const f = fixture()
  expect(resolveFinanceFiscalHistoryPeriod(f)).toMatchObject({
    fiscalStart: f.bookStartsAt,
    firstPeriodStub: true,
    fiscalYearId: null,
    reclose: false,
  })
  f.years.push(year())
  const next = resolveFinanceFiscalHistoryPeriod(f)
  expect(next.fiscalStart).toEqual(new Date("2025-01-01T00:00:00Z"))
  expect(next.fiscalEnd).toEqual(new Date("2025-12-31T23:59:59.999Z"))
  expect(next.firstPeriodStub).toBe(false)
  const second = year(
    "2025-01-01T00:00:00Z",
    "2025-12-31T23:59:59.999Z",
    "second",
  )
  for (const event of second.events) {
    event.snapshotSequence = 6n
    event.resultingSequence = 7n
  }
  f.years.unshift(second)
  expect(resolveFinanceFiscalHistoryPeriod(f).fiscalStart).toEqual(
    new Date("2026-01-01T00:00:00Z"),
  )
  expect(f.years[0]?.id).toBe("second")
})

test("reversed latest fiscal year reuses its original range, and a later close becomes active", () => {
  const f = fixture()
  const first = year()
  const close = first.events[0]
  if (!close) throw new Error("missing close")
  first.events.push({
    ...close,
    id: "reverse",
    kind: "REVERSE",
    reversalOfId: close.id,
    snapshotSequence: 4n,
    resultingSequence: 5n,
    recordedAt: new Date("2026-01-02T00:00:00Z"),
  })
  first.activeCloseId = null
  f.years = [first]
  expect(resolveFinanceFiscalHistoryPeriod(f)).toMatchObject({
    fiscalStart: first.startsAt,
    fiscalEnd: first.endsAt,
    fiscalYearId: first.id,
    reclose: true,
  })
  first.events.push({
    ...close,
    id: "reclose",
    snapshotSequence: 7n,
    resultingSequence: 8n,
    recordedAt: new Date("2026-01-03T00:00:00Z"),
  })
  first.activeCloseId = "reclose"
  expect(resolveFinanceFiscalHistoryPeriod(f)).toMatchObject({
    fiscalYearId: null,
    reclose: false,
  })
})

test("missing, repeated, foreign, changed-calendar or noncanonical retained history refuses", () => {
  for (const fault of [
    "gap",
    "duplicate",
    "foreign",
    "revision",
    "stub",
    "date",
    "empty",
    "active",
    "watermark",
    "early",
    "future",
  ] as const) {
    const f = fixture()
    const first = year()
    const close = first.events[0]
    if (!close) throw new Error("missing close")
    f.years = [first]
    if (fault === "gap") first.startsAt = new Date("2025-01-01T00:00:00Z")
    if (fault === "duplicate") f.years.push(first)
    if (fault === "foreign") close.bookId = "foreign"
    if (fault === "revision") first.calendarRevision = 2
    if (fault === "stub") first.firstPeriodStub = false
    if (fault === "date")
      close.effectiveAt = new Date("2024-06-30T23:59:59.999Z")
    if (fault === "empty") first.events = []
    if (fault === "active") first.activeCloseId = "absent"
    if (fault === "watermark") close.resultingSequence = 11n
    if (fault === "early") close.recordedAt = new Date("2024-10-01T00:00:00Z")
    if (fault === "future") close.recordedAt = new Date("2027-01-01T00:00:00Z")
    expect(() => resolveFinanceFiscalHistoryPeriod(f)).toThrow()
  }
})

test("orphan or duplicate reversals, multiple unreversed closes and reopening an earlier year refuse", () => {
  for (const fault of ["orphan", "duplicate", "multiple", "earlier"] as const) {
    const f = fixture()
    const first = year()
    const close = first.events[0]
    if (!close) throw new Error("missing close")
    f.years = [first]
    const reverse = {
      ...close,
      id: "reverse",
      kind: "REVERSE",
      reversalOfId: close.id,
      snapshotSequence: 4n,
      resultingSequence: 5n,
      recordedAt: new Date("2026-01-02T00:00:00Z"),
    }
    first.events.push(reverse)
    first.activeCloseId = null
    if (fault === "orphan") reverse.reversalOfId = "absent"
    if (fault === "duplicate")
      first.events.push({ ...reverse, id: "another-reverse" })
    if (fault === "multiple") {
      first.events = [close, { ...close, id: "another-close" }]
      first.activeCloseId = close.id
    }
    if (fault === "earlier")
      f.years.push(
        year("2025-01-01T00:00:00Z", "2025-12-31T23:59:59.999Z", "second"),
      )
    expect(() => resolveFinanceFiscalHistoryPeriod(f)).toThrow()
  }
})

test("zero-journal close/reverse histories can share a sequence but still require exact reversal identity", () => {
  const f = fixture()
  const first = year()
  const close = first.events[0]
  if (!close) throw new Error("missing close")
  close.resultingSequence = close.snapshotSequence
  first.events.push({
    ...close,
    id: "zero-reverse",
    kind: "REVERSE",
    reversalOfId: close.id,
    recordedAt: new Date("2026-01-02T00:00:00Z"),
  })
  first.activeCloseId = null
  f.years = [first]
  expect(resolveFinanceFiscalHistoryPeriod(f).reclose).toBe(true)
})

test("a second close before reversing the active close is rejected even when every close has a reversal", () => {
  const f = fixture()
  const first = year()
  const close = first.events[0]
  if (!close) throw new Error("missing close")
  first.events.push(
    {
      ...close,
      id: "overlapping",
      snapshotSequence: 4n,
      resultingSequence: 5n,
      recordedAt: new Date("2026-01-02T00:00:00Z"),
    },
    {
      ...close,
      id: "reverse",
      kind: "REVERSE",
      reversalOfId: close.id,
      snapshotSequence: 5n,
      resultingSequence: 6n,
      recordedAt: new Date("2026-01-03T00:00:00Z"),
    },
    {
      ...close,
      id: "reverse-overlap",
      kind: "REVERSE",
      reversalOfId: "overlapping",
      snapshotSequence: 6n,
      resultingSequence: 7n,
      recordedAt: new Date("2026-01-04T00:00:00Z"),
    },
  )
  first.activeCloseId = null
  f.years = [first]
  expect(() => resolveFinanceFiscalHistoryPeriod(f)).toThrow()
})

test("overflow never truncates fiscal history into a valid preview", () => {
  const f = fixture()
  f.years = Array.from({ length: 101 }, () => year())
  expect(() => resolveFinanceFiscalHistoryPeriod(f)).toThrow()
  f.years = [year()]
  const first = f.years[0]
  const close = first?.events[0]
  if (!first || !close) throw new Error("missing close")
  first.events = Array.from({ length: 401 }, () => close)
  expect(() => resolveFinanceFiscalHistoryPeriod(f)).toThrow()
})
