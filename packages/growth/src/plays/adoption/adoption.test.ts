import { describe, expect, test } from "bun:test"
import type { GrowthSnapshot } from "../../contract"
import { makeContext, makeSnapshot } from "../../fixtures"
import { ADOPTION_PLAYS } from "./index"
import { firstSalePlay } from "./p02-first-sale"
import { assistantChannelPlay } from "./p03-assistant-channel"
import { siteSetupPlay } from "./p04-site-setup"
import { customDomainPlay } from "./p05-custom-domain"
import { moneyAccountsPlay } from "./p06-money-accounts"
import { staffPlay } from "./p07-staff"
import { monthlyReportPlay } from "./p13-monthly-report"
import { atRiskPlay } from "./p14-at-risk"
import { winBackPlay } from "./p15-win-back"

// Fixture "now" is 2026-11-12T10:00Z.
const createdDaysAgo = (days: number) =>
  new Date(Date.UTC(2026, 10, 12, 10) - days * 86_400_000)

describe("adoption play registry", () => {
  test("registers P02–P07 and P13–P15, not the signup welcome", () => {
    expect(ADOPTION_PLAYS.map((play) => play.id)).toEqual([
      "P02_first_sale",
      "P03_assistant_channel",
      "P04_site_setup",
      "P05_custom_domain",
      "P06_money_accounts",
      "P07_staff",
      "P13_monthly_report",
      "P14_at_risk",
      "P15_win_back",
    ])
  })

  test("consent: monthly report has its own bucket, the rest are product tips", () => {
    for (const play of ADOPTION_PLAYS)
      expect(play.consent).toBe(
        play.id === "P13_monthly_report" ? "monthlyReport" : "productTips",
      )
  })

  test("in-app plays carry an in-app key; email-only plays do not", () => {
    for (const play of ADOPTION_PLAYS) {
      const decision = play.eligible(
        makeContext(eligibleSnapshot(play.id), eligibleContext(play.id)),
      )
      expect(decision).not.toBeNull()
      expect(Boolean(decision?.inAppKey)).toBe(play.channels.includes("in_app"))
      expect(decision?.ctaPath.startsWith("/")).toBe(true)
    }
  })
})

describe("P02 first sale", () => {
  const base = {
    catalogItems: 3,
    ordersTotal: 0,
    stage: "signed_up" as const,
    businessCreatedAt: createdDaysAgo(2),
  }

  test("fires at 3 items, 0 orders, 2 days after signup", () => {
    expect(firstSalePlay.eligible(makeContext(base))).toEqual({
      periodKey: "once",
      templateKey: "lifecycle-first-sale",
      inAppKey: "first_sale",
      data: { catalogItems: 3 },
      ctaPath: "/?orderSheet=create",
    })
  })

  test("waits for 3 items and 2 days", () => {
    expect(
      firstSalePlay.eligible(makeContext({ ...base, catalogItems: 2 })),
    ).toBeNull()
    expect(
      firstSalePlay.eligible(
        makeContext({ ...base, businessCreatedAt: createdDaysAgo(1) }),
      ),
    ).toBeNull()
  })

  test("stops once a sale exists or the business is dormant", () => {
    expect(
      firstSalePlay.eligible(makeContext({ ...base, ordersTotal: 1 })),
    ).toBeNull()
    expect(
      firstSalePlay.eligible(makeContext({ ...base, stage: "dormant" })),
    ).toBeNull()
  })

  test("succeeds on the first order", () => {
    const sentOn = makeSnapshot(base)
    expect(firstSalePlay.success.achieved(sentOn, sentOn)).toBe(false)
    expect(
      firstSalePlay.success.achieved(
        sentOn,
        makeSnapshot({ ...base, ordersTotal: 1 }),
      ),
    ).toBe(true)
    expect(firstSalePlay.success.windowDays).toBe(7)
  })
})

describe("P03 assistant channel", () => {
  const base = {
    stage: "activated" as const,
    businessCreatedAt: createdDaysAgo(5),
  }

  test("fires for an activated business with no channel after 5 days", () => {
    const decision = assistantChannelPlay.eligible(makeContext(base))
    expect(decision?.ctaPath).toBe("/account/whatsapp")
    expect(decision?.data).toEqual({ ordersTotal: 9 })
  })

  test("waits 5 days and needs activation", () => {
    expect(
      assistantChannelPlay.eligible(
        makeContext({ ...base, businessCreatedAt: createdDaysAgo(4) }),
      ),
    ).toBeNull()
    for (const stage of ["signed_up", "at_risk", "dormant"] as const)
      expect(
        assistantChannelPlay.eligible(makeContext({ ...base, stage })),
      ).toBeNull()
    expect(
      assistantChannelPlay.eligible(makeContext({ ...base, stage: "habit" })),
    ).not.toBeNull()
  })

  test("either channel counts as linked", () => {
    expect(
      assistantChannelPlay.eligible(
        makeContext({ ...base, whatsappLinked: true }),
      ),
    ).toBeNull()
    expect(
      assistantChannelPlay.eligible(
        makeContext({ ...base, telegramLinked: true }),
      ),
    ).toBeNull()
    const sentOn = makeSnapshot(base)
    expect(
      assistantChannelPlay.success.achieved(
        sentOn,
        makeSnapshot({ telegramLinked: true }),
      ),
    ).toBe(true)
    expect(assistantChannelPlay.success.achieved(sentOn, sentOn)).toBe(false)
  })
})

describe("P04 site setup", () => {
  test("fires at 5 items with no published site", () => {
    expect(
      siteSetupPlay.eligible(makeContext({ catalogItems: 5 })),
    ).toMatchObject({
      data: { catalogItems: 5 },
      ctaPath: "/storefront",
      inAppKey: "site_setup",
    })
    expect(siteSetupPlay.eligible(makeContext({ catalogItems: 4 }))).toBeNull()
  })

  test("not for published or dormant businesses", () => {
    expect(
      siteSetupPlay.eligible(
        makeContext({ catalogItems: 12, storefrontPublished: true }),
      ),
    ).toBeNull()
    expect(
      siteSetupPlay.eligible(
        makeContext({ catalogItems: 12, stage: "dormant" }),
      ),
    ).toBeNull()
  })

  test("succeeds when the site is published", () => {
    const sentOn = makeSnapshot({ catalogItems: 12 })
    expect(
      siteSetupPlay.success.achieved(
        sentOn,
        makeSnapshot({ storefrontPublished: true }),
      ),
    ).toBe(true)
  })
})

describe("P05 custom domain", () => {
  const published = {
    storefrontPublished: true,
    businessCreatedAt: createdDaysAgo(14),
  }
  const weekAgo = makeSnapshot({ storefrontPublished: true })

  test("fires 14+ days in, published a week ago too, no custom domain", () => {
    expect(
      customDomainPlay.eligible(makeContext(published, { weekAgo })),
    ).toMatchObject({
      ctaPath: "/settings/domains",
      templateKey: "lifecycle-custom-domain",
    })
  })

  test("needs 14 days, a site live for a week, and no domain yet", () => {
    expect(
      customDomainPlay.eligible(
        makeContext(
          { ...published, businessCreatedAt: createdDaysAgo(13) },
          { weekAgo },
        ),
      ),
    ).toBeNull()
    expect(customDomainPlay.eligible(makeContext(published))).toBeNull()
    expect(
      customDomainPlay.eligible(
        makeContext(published, {
          weekAgo: makeSnapshot({ storefrontPublished: false }),
        }),
      ),
    ).toBeNull()
    expect(
      customDomainPlay.eligible(
        makeContext({ ...published, customDomain: true }, { weekAgo }),
      ),
    ).toBeNull()
    expect(
      customDomainPlay.eligible(
        makeContext({ ...published, storefrontPublished: false }, { weekAgo }),
      ),
    ).toBeNull()
  })
})

describe("P06 money accounts", () => {
  const base = { planId: "starter" as const, ordersTotal: 10, moneyAccounts: 1 }

  test("fires at 10 orders with one or no money account", () => {
    expect(moneyAccountsPlay.eligible(makeContext(base))).toMatchObject({
      ctaPath: "/finance/accounts?financeSheet=account",
      inAppKey: "money_accounts",
      data: { ordersTotal: 10, moneyAccounts: 1 },
    })
    expect(
      moneyAccountsPlay.eligible(makeContext({ ...base, moneyAccounts: 0 })),
    ).not.toBeNull()
  })

  test("not below 10 orders, with 2+ accounts, or on Free (no finance)", () => {
    expect(
      moneyAccountsPlay.eligible(makeContext({ ...base, ordersTotal: 9 })),
    ).toBeNull()
    expect(
      moneyAccountsPlay.eligible(makeContext({ ...base, moneyAccounts: 2 })),
    ).toBeNull()
    expect(
      moneyAccountsPlay.eligible(makeContext({ ...base, planId: "free" })),
    ).toBeNull()
  })

  test("succeeds at 2 active accounts", () => {
    const sentOn = makeSnapshot(base)
    expect(
      moneyAccountsPlay.success.achieved(
        sentOn,
        makeSnapshot({ moneyAccounts: 2 }),
      ),
    ).toBe(true)
    expect(moneyAccountsPlay.success.achieved(sentOn, sentOn)).toBe(false)
  })
})

describe("P07 staff", () => {
  const base = { planId: "growth" as const, staffCount: 0, activeDays28: 10 }

  test("fires at 30 orders this month", () => {
    expect(
      staffPlay.eligible(makeContext({ ...base, ordersThisMonth: 30 })),
    ).toMatchObject({
      ctaPath: "/staff?staffSheet=invite",
      data: { ordersThisMonth: 30, activeDays28: 10 },
    })
    expect(
      staffPlay.eligible(makeContext({ ...base, ordersThisMonth: 29 })),
    ).toBeNull()
  })

  test("fires when the owner works 6+ days a week (24 of 28)", () => {
    expect(
      staffPlay.eligible(makeContext({ ...base, activeDays28: 24 })),
    ).not.toBeNull()
    expect(
      staffPlay.eligible(makeContext({ ...base, activeDays28: 23 })),
    ).toBeNull()
  })

  test("not with staff already, or on Free (0 staff seats)", () => {
    const busy = { ...base, ordersThisMonth: 40 }
    expect(
      staffPlay.eligible(makeContext({ ...busy, staffCount: 1 })),
    ).toBeNull()
    expect(
      staffPlay.eligible(makeContext({ ...busy, planId: "free" })),
    ).toBeNull()
  })

  test("succeeds once a staff member joins", () => {
    const sentOn = makeSnapshot(base)
    expect(
      staffPlay.success.achieved(sentOn, makeSnapshot({ staffCount: 1 })),
    ).toBe(true)
  })
})

describe("P13 monthly report", () => {
  const habit = {
    stage: "habit",
    ordersLastMonth: 48,
    salesMinorLastMonth: BigInt(21_350_000),
  } as Partial<GrowthSnapshot>
  const on = (iso: string) => ({ now: new Date(iso) })

  test("fires on day 1 for last month, keyed by that month", () => {
    expect(
      monthlyReportPlay.eligible(
        makeContext(habit, on("2026-12-01T06:30:00Z")),
      ),
    ).toEqual({
      periodKey: "2026-11",
      templateKey: "lifecycle-monthly-report",
      data: {
        reportMonth: "2026-11",
        ordersLastMonth: 48,
        salesMinorLastMonth: 21_350_000,
        currencyCode: "NGN",
      },
      ctaPath: "/analytics",
    })
  })

  test("January reports December of the year before", () => {
    expect(
      monthlyReportPlay.eligible(makeContext(habit, on("2027-01-01T06:30:00Z")))
        ?.periodKey,
    ).toBe("2026-12")
  })

  test("catches up on days 2–3, then stops", () => {
    expect(
      monthlyReportPlay.eligible(
        makeContext(habit, on("2026-12-03T06:30:00Z")),
      ),
    ).not.toBeNull()
    expect(
      monthlyReportPlay.eligible(
        makeContext(habit, on("2026-12-04T06:30:00Z")),
      ),
    ).toBeNull()
  })

  test("Habit and above only, and only with a month to report", () => {
    const day1 = on("2026-12-01T06:30:00Z")
    for (const stage of ["expanding", "paying"] as const)
      expect(
        monthlyReportPlay.eligible(makeContext({ ...habit, stage }, day1)),
      ).not.toBeNull()
    for (const stage of [
      "signed_up",
      "activated",
      "at_risk",
      "dormant",
    ] as const)
      expect(
        monthlyReportPlay.eligible(makeContext({ ...habit, stage }, day1)),
      ).toBeNull()
    expect(
      monthlyReportPlay.eligible(
        makeContext(
          { ...habit, ordersLastMonth: 0 } as Partial<GrowthSnapshot>,
          day1,
        ),
      ),
    ).toBeNull()
  })

  test("stays silent until the snapshot carries last month's totals", () => {
    expect(
      monthlyReportPlay.eligible(
        makeContext({ stage: "habit" }, on("2026-12-01T06:30:00Z")),
      ),
    ).toBeNull()
  })
})

describe("P14 at risk", () => {
  const quiet = {
    stage: "at_risk" as const,
    lastActiveAt: new Date("2026-11-02T08:00:00Z"),
  }

  test("fires at 10 quiet days, keyed by the quiet spell", () => {
    expect(atRiskPlay.eligible(makeContext(quiet))).toMatchObject({
      periodKey: "since:2026-11-02",
      data: { inactiveDays: 10 },
      ctaPath: "/",
    })
    expect(
      atRiskPlay.eligible(
        makeContext({
          ...quiet,
          lastActiveAt: new Date("2026-11-02T10:00:01Z"),
        }),
      ),
    ).toBeNull()
  })

  test("only for the at-risk stage", () => {
    expect(
      atRiskPlay.eligible(makeContext({ ...quiet, stage: "habit" })),
    ).toBeNull()
    expect(
      atRiskPlay.eligible(makeContext({ ...quiet, stage: "dormant" })),
    ).toBeNull()
    expect(
      atRiskPlay.eligible(makeContext({ ...quiet, lastActiveAt: null })),
    ).toBeNull()
  })

  test("succeeds on any new activity", () => {
    const sentOn = makeSnapshot(quiet)
    expect(atRiskPlay.success.achieved(sentOn, sentOn)).toBe(false)
    expect(
      atRiskPlay.success.achieved(
        sentOn,
        makeSnapshot({ lastActiveAt: new Date("2026-11-14T08:00:00Z") }),
      ),
    ).toBe(true)
    expect(atRiskPlay.success.windowDays).toBe(7)
  })
})

describe("P15 win-back", () => {
  const dormant = {
    stage: "dormant" as const,
    lastActiveAt: new Date("2026-10-13T10:00:00Z"),
  }

  test("fires once at 30 dormant days", () => {
    expect(winBackPlay.eligible(makeContext(dormant))).toMatchObject({
      periodKey: "once",
      data: { inactiveDays: 30 },
    })
    expect(
      winBackPlay.eligible(
        makeContext({
          ...dormant,
          lastActiveAt: new Date("2026-10-14T10:00:00Z"),
        }),
      ),
    ).toBeNull()
  })

  test("counts from signup when the business never did anything", () => {
    expect(
      winBackPlay.eligible(
        makeContext({
          ...dormant,
          lastActiveAt: null,
          businessCreatedAt: createdDaysAgo(45),
        }),
      ),
    ).toMatchObject({ data: { inactiveDays: 45 } })
  })

  test("only for the dormant stage", () => {
    expect(
      winBackPlay.eligible(makeContext({ ...dormant, stage: "at_risk" })),
    ).toBeNull()
  })

  test("succeeds when a business that never acted comes back", () => {
    const sentOn = makeSnapshot({ ...dormant, lastActiveAt: null })
    expect(
      winBackPlay.success.achieved(
        sentOn,
        makeSnapshot({ lastActiveAt: new Date() }),
      ),
    ).toBe(true)
  })
})

function eligibleSnapshot(id: string): Partial<GrowthSnapshot> {
  switch (id) {
    case "P02_first_sale":
      return {
        catalogItems: 3,
        ordersTotal: 0,
        businessCreatedAt: createdDaysAgo(3),
      }
    case "P03_assistant_channel":
      return { businessCreatedAt: createdDaysAgo(6) }
    case "P04_site_setup":
      return { catalogItems: 8 }
    case "P05_custom_domain":
      return {
        storefrontPublished: true,
        businessCreatedAt: createdDaysAgo(20),
      }
    case "P06_money_accounts":
      return { planId: "starter", ordersTotal: 12 }
    case "P07_staff":
      return { planId: "starter", ordersThisMonth: 31 }
    case "P13_monthly_report":
      return {
        stage: "habit",
        ordersLastMonth: 3,
        salesMinorLastMonth: BigInt(100),
      } as Partial<GrowthSnapshot>
    case "P14_at_risk":
      return { stage: "at_risk", lastActiveAt: createdDaysAgo(12) }
    case "P15_win_back":
      return { stage: "dormant", lastActiveAt: createdDaysAgo(40) }
    default:
      return {}
  }
}

function eligibleContext(id: string) {
  if (id === "P05_custom_domain")
    return { weekAgo: makeSnapshot({ storefrontPublished: true }) }
  if (id === "P13_monthly_report")
    return { now: new Date("2026-12-01T06:30:00Z") }
  return {}
}
