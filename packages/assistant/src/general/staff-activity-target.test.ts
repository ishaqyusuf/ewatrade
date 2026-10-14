import { expect, test } from "bun:test"
import { generalAnswerSchema } from "./contracts"
import { staffActivityTargetSchema } from "./staff-activity-target"

const shown = {
  stream: "PAYMENT" as const,
  id: "p-1",
  at: "2026-10-12T13:05:00.000Z",
  summary: "Amina did: Payment recorded · cash",
  record: {
    kind: "payment" as const,
    id: "p-1",
    orderId: "o-1",
    label: "ORD-1042",
  },
}
const target = {
  kind: "staff_activity" as const,
  filters: {
    membershipId: "amina-m",
    from: "2026-10-12T00:00:00+01:00",
    to: "2026-10-13T00:00:00+01:00",
  },
  cursor: null,
  limit: 1,
  shown: [shown],
}

test("the target keeps exact filters, the page cursor and the shown events", () => {
  expect(staffActivityTargetSchema.parse(target)).toEqual(target)
  expect(
    generalAnswerSchema.safeParse({
      id: "staff_activity_1",
      title: "Staff activity",
      value: "1 recorded action",
      scope: "Business",
      asOf: "2026-10-12T15:00:00.000Z",
      detail: "…",
      target,
    }).success,
  ).toBe(true)
})

test("malformed or oversized targets are refused", () => {
  for (const invalid of [
    { ...target, shown: [] },
    { ...target, shown: Array.from({ length: 11 }, () => shown) },
    { ...target, limit: 11 },
    { ...target, filters: { ...target.filters, tenantId: "foreign" } },
    {
      ...target,
      shown: [{ ...shown, record: { kind: "invoice", id: "x", label: "X" } }],
    },
    { ...target, filters: { ...target.filters, stockOperationType: "MAGIC" } },
  ])
    expect(staffActivityTargetSchema.safeParse(invalid).success).toBe(false)
})

test("only a read completed by this mount renders", async () => {
  const { freshShownRead } = await import("./staff-activity-target")
  const done = {
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data: { rows: 1 },
  }
  expect(freshShownRead(done)).toEqual({ state: "ready", data: { rows: 1 } })
  // Cached success from earlier access, a refetch, a paused or failed read.
  for (const query of [
    { ...done, isFetchedAfterMount: false },
    { ...done, isFetching: true },
    { ...done, isPaused: true },
    { ...done, isSuccess: false, data: undefined },
  ])
    expect(freshShownRead(query)).toEqual({ state: "checking" })
  expect(freshShownRead({ ...done, isError: true, isSuccess: false })).toEqual({
    state: "refused",
  })
})
