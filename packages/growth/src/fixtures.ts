import type { GrowthSnapshot, PlayContext } from "./contract"

/** A plain, activated Free business. Override only what a test cares about. */
export function makeSnapshot(
  overrides: Partial<GrowthSnapshot> = {},
): GrowthSnapshot {
  return {
    tenantId: "tenant_fixture",
    day: "2026-11-12",
    stage: "activated",
    planId: "free",
    businessCreatedAt: new Date("2026-11-01T09:00:00Z"),
    activeDays28: 6,
    ordersLast7: 4,
    ordersThisMonth: 9,
    ordersTotal: 9,
    salesMinorThisMonth: BigInt(4_500_000),
    currencyCode: "NGN",
    catalogItems: 6,
    staffCount: 0,
    businessesOwned: 1,
    moneyAccounts: 1,
    storefrontPublished: false,
    customDomain: false,
    whatsappLinked: false,
    telegramLinked: false,
    waRepliesUsed: null,
    waRepliesCap: null,
    limitPressure: {},
    lastActiveAt: new Date("2026-11-12T08:00:00Z"),
    ...overrides,
  }
}

export function makeContext(
  snapshot: Partial<GrowthSnapshot> = {},
  overrides: Partial<Omit<PlayContext, "snapshot">> = {},
): PlayContext {
  return {
    now: new Date("2026-11-12T10:00:00Z"),
    snapshot: makeSnapshot(snapshot),
    weekAgo: null,
    checkoutAvailable: true,
    ...overrides,
  }
}
