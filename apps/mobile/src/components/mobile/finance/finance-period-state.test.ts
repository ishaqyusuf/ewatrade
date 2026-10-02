import { expect, test } from "bun:test"
import { financePeriodSchema } from "../../../../../api/src/schemas/finance"
import {
  assertNativePeriodReport,
  mergeNativePeriodAudit,
  nativePeriodAudit,
  nativePeriodRecovery,
  prepareNativePeriod,
  readNativePeriodFresh,
} from "./finance-period-state"

const input = {
  bookId: "book",
  startsAt: "2026-09-01T00:00:00.000Z",
  state: { closedThrough: null, snapshotSequence: "42", periods: [] },
  action: "CLOSE" as const,
  day: "2026-09-30",
  reason: "Month end",
  now: new Date("2026-10-02T12:00:00Z"),
}
test("native closing uses valid completed UTC days and actual strict API payload", () => {
  const payload = prepareNativePeriod(input)
  expect(
    financePeriodSchema.parse({ ...payload, clientCommandId: "period-1" }),
  ).toEqual({ ...payload, clientCommandId: "period-1" })
  expect(payload.action === "CLOSE" && payload.through.toISOString()).toBe(
    "2026-09-30T23:59:59.999Z",
  )
  for (const day of ["2026-02-30", "2026-08-31", "2026-10-02", "30/09/2026"])
    expect(() => prepareNativePeriod({ ...input, day })).toThrow()
  expect(() =>
    prepareNativePeriod({ ...input, reason: " ", day: "2026-09-30" }),
  ).toThrow("reason")
})
test("close respects existing locks and preserves reopened period boundaries", () => {
  const period = {
    id: "period",
    startsAt: input.startsAt,
    endsAt: "2026-09-30T23:59:59.999Z",
    reopenedAt: "2026-10-01T12:00:00Z",
  }
  expect(() =>
    prepareNativePeriod({
      ...input,
      state: { ...input.state, closedThrough: period.endsAt },
    }),
  ).toThrow("current lock")
  expect(() =>
    prepareNativePeriod({
      ...input,
      day: "2026-10-01",
      state: { ...input.state, periods: [period] },
    }),
  ).toThrow("original end date")
  expect(
    prepareNativePeriod({
      ...input,
      state: { ...input.state, periods: [period] },
    }).action,
  ).toBe("CLOSE")
})
test("reopening resolves only the actual latest unreopened period", () => {
  const period = {
    id: "latest",
    startsAt: input.startsAt,
    endsAt: "2026-09-30T23:59:59.999Z",
    reopenedAt: null,
  }
  const value = prepareNativePeriod({
    ...input,
    action: "REOPEN",
    state: { ...input.state, closedThrough: period.endsAt, periods: [period] },
  })
  expect(value).toEqual({
    bookId: "book",
    action: "REOPEN",
    periodId: "latest",
    reason: "Month end",
    expectedSnapshotSequence: "42",
  })
  expect(
    financePeriodSchema.parse({ ...value, clientCommandId: "reopen-1" }),
  ).toEqual({ ...value, clientCommandId: "reopen-1" })
  expect(() => prepareNativePeriod({ ...input, action: "REOPEN" })).toThrow(
    "no current closed period",
  )
  expect(() =>
    prepareNativePeriod({
      ...input,
      action: "REOPEN",
      state: {
        ...input.state,
        closedThrough: period.endsAt,
        periods: [{ ...period, reopenedAt: "2026-10-01" }],
      },
    }),
  ).toThrow()
})
test("retained retries preserve the original snapshot and exact cutoff, with metadata only", () => {
  const saved = {
    action: "CLOSE" as const,
    expectedSnapshotSequence: "39",
    through: "2026-09-30T23:59:59.999Z",
  }
  const payload = prepareNativePeriod({ ...input, saved })
  expect(payload.expectedSnapshotSequence).toBe("39")
  expect(nativePeriodRecovery(payload)).toEqual(saved)
  expect(() =>
    prepareNativePeriod({ ...input, day: "2026-10-01", saved }),
  ).toThrow("original cutoff")
  expect(() =>
    prepareNativePeriod({
      ...input,
      saved: { ...saved, expectedSnapshotSequence: undefined },
    }),
  ).toThrow("exact original details")
  expect(() =>
    prepareNativePeriod({ ...input, saved: { ...saved, action: "REOPEN" } }),
  ).toThrow()
})
test("balanced posted report must match book, currency, date range and reviewed snapshot", () => {
  const payload = prepareNativePeriod(input)
  if (payload.action !== "CLOSE") throw new Error("Wrong fixture")
  const report = {
    bookId: "book",
    currencyCode: "NGN",
    from: input.startsAt,
    through: payload.through,
    snapshotSequence: "42",
    trialBalance: { balanced: true, differenceMinor: "0" },
  }
  const check = (r: typeof report) =>
    assertNativePeriodReport({
      report: r,
      payload,
      startsAt: input.startsAt,
      currencyCode: "NGN",
    })
  expect(() => check(report)).not.toThrow()
  for (const r of [
    { ...report, bookId: "other" },
    { ...report, currencyCode: "USD" },
    { ...report, snapshotSequence: "43" },
    { ...report, from: "2026-09-02" },
    { ...report, through: new Date("2026-10-01") },
    { ...report, trialBalance: { balanced: false, differenceMinor: "1" } },
  ])
    expect(() => check(r)).toThrow()
})
test("deferred old-generation period response and paused reads cannot be adopted", async () => {
  let generation = 1
  let finish: (value: string) => void = () => {}
  let started: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const pending = readNativePeriodFresh({
    current: () => generation === 1,
    cancel: async () => {},
    state: () => ({ status: "success", fetchStatus: "idle" }),
    fetch: () => {
      started()
      return new Promise<string>((resolve) => {
        finish = resolve
      })
    },
  })
  await ready
  generation = 2
  finish("old private record")
  await expect(pending).rejects.toThrow("connectivity changed")
  let fetched = false
  await expect(
    readNativePeriodFresh({
      current: () => true,
      cancel: async () => {},
      state: () => ({ status: "success", fetchStatus: "paused" }),
      fetch: async () => {
        fetched = true
        return "wrong"
      },
    }),
  ).rejects.toThrow("earlier period read")
  expect(fetched).toBe(false)
})
test("historical audit preserves unavailable fields instead of inferring current snapshot", () => {
  expect(nativePeriodAudit({})).toBeNull()
  expect(
    nativePeriodAudit({
      audit: {
        reason: "Original reason",
        endsAt: "bad date",
        snapshotSequence: 3,
      },
    }),
  ).toEqual({ reason: "Original reason", endsAt: null, snapshot: null })
  expect(
    nativePeriodAudit({
      audit: {
        reason: "Month end",
        endsAt: "2026-09-30T23:59:59.999Z",
        snapshotSequence: "42",
      },
    }),
  ).toEqual({ reason: "Month end", endsAt: "2026-09-30", snapshot: "42" })
})

test("audit pagination adopts only advancing bounded unique period actions", () => {
  const first = { id: "a", kind: "PERIOD_CLOSE" }
  const next = { id: "b", kind: "PERIOD_REOPEN" }
  const cursors = new Set<string>()
  const initial = mergeNativePeriodAudit({
    previous: [],
    page: { events: [first], nextCursor: "a" },
    cursors,
  })
  expect(initial).toEqual([first])
  expect(
    mergeNativePeriodAudit({
      previous: initial,
      page: { events: [next], nextCursor: null },
      cursors,
    }),
  ).toEqual([first, next])
  expect(initial).toEqual([first])
  expect(() =>
    mergeNativePeriodAudit({
      previous: initial,
      page: { events: [first], nextCursor: null },
      cursors,
    }),
  ).toThrow("duplicate")
  expect(() =>
    mergeNativePeriodAudit({
      previous: [],
      page: { events: [first], nextCursor: "a" },
      cursors,
    }),
  ).toThrow("did not advance")
  expect(() =>
    mergeNativePeriodAudit({
      previous: [],
      page: { events: [], nextCursor: "missing" },
      cursors: new Set(),
    }),
  ).toThrow("did not advance")
  expect(() =>
    mergeNativePeriodAudit({
      previous: [],
      page: { events: [{ ...first, kind: "PAYMENT" }], nextCursor: null },
      cursors: new Set(),
    }),
  ).toThrow("Invalid")
  expect(() =>
    mergeNativePeriodAudit({
      previous: [],
      page: {
        events: Array.from({ length: 31 }, (_, i) => ({
          id: String(i),
          kind: "PERIOD_CLOSE",
        })),
        nextCursor: null,
      },
      cursors: new Set(),
    }),
  ).toThrow("did not advance")
})
