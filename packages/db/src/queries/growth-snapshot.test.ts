import { expect, test } from "bun:test"
import { growthSnapshotDay, projectGrowthPlan } from "./growth-snapshot"

type Snapshot = Parameters<typeof projectGrowthPlan>[0]

function snapshot(overrides: {
  planId?: string
  source?: string
  status?: string
}): Snapshot {
  return {
    plan: { id: overrides.planId ?? "free" },
    subscription: {
      source: overrides.source ?? "owner_billing_free",
      status: overrides.status ?? "active",
    },
    usage: {
      products: 9,
      staff: 0,
      ordersThisMonth: 40,
      businesses: 1,
      offlineDevices: 1,
    },
    entitlements: [
      { key: "products", limit: 10, used: 9, isAtLimit: false },
      { key: "staff", limit: 0, used: 0, isAtLimit: true },
      { key: "ordersPerMonth", limit: null, used: 40, isAtLimit: false },
      { key: "reportsHistoryDays", limit: 30, used: 0, isAtLimit: false },
      { key: "businesses", limit: 3, used: 1, isAtLimit: false },
    ],
  } as unknown as Snapshot
}

test("limit pressure covers finite, non-zero plan limits only", () => {
  expect(projectGrowthPlan(snapshot({})).limitPressure).toEqual({
    products: 0.9,
    businesses: 0.333,
  })
})

test("paying needs a paid plan on a real, current subscription", () => {
  expect(projectGrowthPlan(snapshot({})).paying).toBe(false)
  expect(
    projectGrowthPlan(snapshot({ planId: "starter", source: "launch_default" }))
      .paying,
  ).toBe(false)
  expect(
    projectGrowthPlan(
      snapshot({ planId: "growth", source: "owner_subscription" }),
    ).paying,
  ).toBe(true)
  expect(
    projectGrowthPlan(
      snapshot({
        planId: "growth",
        source: "owner_subscription",
        status: "cancelled",
      }),
    ).paying,
  ).toBe(false)
})

test("snapshot day is UTC midnight", () => {
  expect(
    growthSnapshotDay(new Date("2026-11-12T23:30:00+01:00")).toISOString(),
  ).toBe("2026-11-12T00:00:00.000Z")
})
