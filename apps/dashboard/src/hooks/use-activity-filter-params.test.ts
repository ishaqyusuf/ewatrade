import { describe, expect, test } from "bun:test"

import {
  activityDateWindow,
  businessDayStart,
  getActivityListPageInput,
  hasActivityFilters,
  loadActivityFilterParams,
} from "./use-activity-filter-params"

const lagos = "Africa/Lagos"
// 14 Oct 2026, 00:30 in Lagos is still 13 Oct in UTC.
const justAfterLagosMidnight = new Date("2026-10-13T23:30:00Z")

describe("Activity URL filters", () => {
  test("defaults to the last 7 Business days with no filters", async () => {
    const filter = await loadActivityFilterParams({})
    expect(filter).toEqual({
      query: null,
      categories: [],
      types: [],
      person: null,
      storeIds: [],
      range: "last7",
      from: null,
      to: null,
    })
    expect(hasActivityFilters(filter)).toBe(false)
  })

  test("normalizes search, deduplicates sets and drops unknown categories", async () => {
    const filter = await loadActivityFilterParams({
      activityQuery: "  ORD-009  ",
      activityCategories: "orders,orders,bogus,payments",
      activityStores: "store-a,store-a",
      activityPerson: "member-1",
    })
    expect(filter.query).toBe("ORD-009")
    expect(filter.storeIds).toEqual(["store-a"])
    expect(hasActivityFilters(filter)).toBe(true)
  })

  test("keeps exact event types and drops unknown keys", async () => {
    const filter = await loadActivityFilterParams({
      activityTypes: "payment.reversed,payment.reversed,made.up",
    })
    expect(filter.types).toEqual(["payment.reversed"])
    expect(hasActivityFilters(filter)).toBe(true)
    expect(
      getActivityListPageInput(filter, lagos, justAfterLagosMidnight).types,
    ).toEqual(["payment.reversed"])
  })

  test("custom range needs two valid days, otherwise falls back", async () => {
    const broken = await loadActivityFilterParams({
      activityRange: "custom",
      activityFrom: "2026-10-01",
    })
    expect(broken.range).toBe("last7")
    const custom = await loadActivityFilterParams({
      activityRange: "custom",
      activityFrom: "2026-10-01",
      activityTo: "2026-10-03",
    })
    expect(custom).toMatchObject({
      range: "custom",
      from: "2026-10-01",
      to: "2026-10-03",
    })
  })
})

describe("Business time zone windows", () => {
  test("Today uses the Business day, not the UTC day", () => {
    expect(
      activityDateWindow(
        { range: "today", from: null, to: null },
        lagos,
        justAfterLagosMidnight,
      ),
    ).toMatchObject({
      from: "2026-10-13T23:00:00.000Z",
      to: "2026-10-14T23:00:00.000Z",
      firstDay: "2026-10-14",
    })
  })

  test("Yesterday and Last 7 days are half-open whole days", () => {
    const yesterday = activityDateWindow(
      { range: "yesterday", from: null, to: null },
      lagos,
      justAfterLagosMidnight,
    )
    expect(yesterday.from).toBe("2026-10-12T23:00:00.000Z")
    expect(yesterday.to).toBe("2026-10-13T23:00:00.000Z")
    const week = activityDateWindow(
      { range: "last7", from: null, to: null },
      lagos,
      justAfterLagosMidnight,
    )
    expect(week.firstDay).toBe("2026-10-08")
    expect(week.to).toBe("2026-10-14T23:00:00.000Z")
  })

  test("custom days are inclusive, reorderable and capped at 92 days", () => {
    const swapped = activityDateWindow(
      { range: "custom", from: "2026-10-03", to: "2026-10-01" },
      lagos,
      justAfterLagosMidnight,
    )
    expect(swapped.from).toBe("2026-09-30T23:00:00.000Z")
    expect(swapped.to).toBe("2026-10-03T23:00:00.000Z")
    const long = activityDateWindow(
      { range: "custom", from: "2026-01-01", to: "2026-10-01" },
      lagos,
      justAfterLagosMidnight,
    )
    expect((Date.parse(long.to) - Date.parse(long.from)) / 86_400_000).toBe(92)
  })

  test("midnight follows daylight-saving offsets", () => {
    // London: BST (+1) on 25 Oct 2026 morning, GMT (+0) from 26 Oct.
    expect(businessDayStart("2026-10-25", "Europe/London").toISOString()).toBe(
      "2026-10-24T23:00:00.000Z",
    )
    expect(businessDayStart("2026-10-26", "Europe/London").toISOString()).toBe(
      "2026-10-26T00:00:00.000Z",
    )
  })
})

describe("listPage input", () => {
  test("maps the unknown person to actorKind, never a membership ID", async () => {
    const filter = await loadActivityFilterParams({ activityPerson: "unknown" })
    const input = getActivityListPageInput(
      filter,
      lagos,
      justAfterLagosMidnight,
    )
    expect(input.actorKind).toBe("unknown")
    expect(input.actorMembershipId).toBeUndefined()
  })

  test("sends only applied filters, newest first, 25 per page", async () => {
    const filter = await loadActivityFilterParams({
      activityCategories: "orders",
      activityPerson: "member-1",
    })
    expect(
      getActivityListPageInput(filter, lagos, justAfterLagosMidnight),
    ).toEqual({
      q: undefined,
      categories: ["orders"],
      types: undefined,
      actorMembershipId: "member-1",
      actorKind: undefined,
      storeIds: undefined,
      from: "2026-10-07T23:00:00.000Z",
      to: "2026-10-14T23:00:00.000Z",
      sort: "newest",
      limit: 25,
    })
  })
})
