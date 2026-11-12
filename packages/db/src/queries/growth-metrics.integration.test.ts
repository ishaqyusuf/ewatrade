import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import {
  businessesWithFeatureIntent,
  recordFeatureIntentTap,
} from "./growth-intent"
import {
  growthActivationCohorts,
  growthBusinessDetail,
  growthFeatureAdoption,
  growthLimitPressure,
  growthPlayScorecard,
  growthProductQualifiedLeads,
  growthRetentionCurve,
  growthRevenue,
  growthStageFunnel,
  growthWeeklyActiveSellingBusinesses,
  growthWhatsAppUsage,
} from "./growth-metrics"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(180_000)
const describeWithDatabase = enabled ? describe : describe.skip

// Fixture rows live in 2099 so the shared development database's real
// snapshots never fall inside the windows these assertions read.
const LATEST = "2099-03-29"
const NOW = new Date("2099-03-29T12:00:00Z")
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const minus = (iso: string, days: number) =>
  new Date(day(iso).getTime() - days * 86_400_000).toISOString().slice(0, 10)

describeWithDatabase("growth metrics on fixture snapshots", () => {
  test("panels, scorecard lift, revenue and the intent counter", async () => {
    assertQaAccessAcceptanceDatabase()
    const { prisma } = await import("../client")
    const run = randomUUID().slice(0, 8)
    const ids = Array.from({ length: 5 }, (_, i) => `growth-w4-${run}-${i}`)
    const qaId = `growth-w4-${run}-qa`
    const ownerId = randomUUID()
    const accountId = randomUUID()
    try {
      await prisma.user.create({
        data: {
          id: ownerId,
          email: `growth-w4-${run}@example.test`,
          emailVerified: true,
          name: "Growth W4 Owner",
        },
      })
      // a,b sign up 1 Mar 2099 (cohort week of 26 Feb); c,d on 15 Mar; e is old.
      const created = [
        "2099-03-01",
        "2099-03-01",
        "2099-03-15",
        "2099-03-15",
        "2099-01-05",
      ]
      for (const [i, id] of ids.entries())
        await prisma.tenant.create({
          data: {
            id,
            slug: id,
            name: `Growth W4 ${i}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            createdAt: new Date(`${created[i]}T09:00:00Z`),
          },
        })
      await prisma.tenant.create({
        data: {
          id: qaId,
          slug: qaId,
          name: "Growth W4 QA",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          qaSourceDomain: "growth-w4.test",
          qaMarkedAt: NOW,
          createdAt: new Date("2099-03-01T09:00:00Z"),
        },
      })

      const snap = (
        tenantId: string,
        iso: string,
        stage: string,
        extra: Record<string, unknown> = {},
      ) => ({
        tenantId,
        day: day(iso),
        stage,
        planId: "free",
        businessCreatedAt: new Date(`${iso}T00:00:00Z`),
        activeDays28: 3,
        ordersLast7: 0,
        ordersThisMonth: 0,
        ordersTotal: 0,
        salesMinorThisMonth: 0n,
        currencyCode: "NGN",
        catalogItems: 5,
        staffCount: 0,
        businessesOwned: 1,
        moneyAccounts: 1,
        storefrontPublished: false,
        customDomain: false,
        whatsappLinked: false,
        telegramLinked: false,
        limitPressure: {},
        ...extra,
      })
      const [a, b, c, d, e] = ids as [string, string, string, string, string]
      await prisma.businessGrowthSnapshot.createMany({
        data: [
          // Activation: a activated by day 3, b never; c activated, d tracked late only.
          snap(a, "2099-03-03", "activated", { ordersLast7: 1 }),
          snap(b, "2099-03-03", "signed_up"),
          snap(c, "2099-03-17", "habit", { ordersLast7: 2 }),
          snap(d, "2099-03-28", "signed_up"),
          // Retention: a and b at week 4 (1 Mar + 28 = 29 Mar), a active.
          snap(a, "2099-03-08", "habit", { ordersLast7: 2 }),
          snap(b, "2099-03-08", "signed_up"),
          // Previous week (22 Mar) for the funnel.
          snap(a, minus(LATEST, 7), "habit", { ordersLast7: 3 }),
          snap(e, minus(LATEST, 7), "habit", { ordersLast7: 1 }),
          // Latest day.
          snap(a, LATEST, "expanding", {
            ordersLast7: 9,
            ordersThisMonth: 40,
            staffCount: 2,
            moneyAccounts: 2,
            storefrontPublished: true,
            whatsappLinked: true,
            waRepliesUsed: 190,
            waRepliesCap: 200,
            limitPressure: { products: 0.85, staff: 1 },
          }),
          snap(b, LATEST, "dormant", {
            waRepliesUsed: 20,
            waRepliesCap: 200,
            limitPressure: { products: 0.4 },
          }),
          snap(e, LATEST, "expanding", {
            ordersLast7: 4,
            telegramLinked: true,
            limitPressure: { products: 0.92 },
          }),
          snap(qaId, LATEST, "expanding", {
            ordersLast7: 50,
            limitPressure: { products: 1 },
          }),
        ],
      })

      const wasb = await growthWeeklyActiveSellingBusinesses(prisma, {
        latestDay: LATEST,
        weeks: 2,
      })
      expect(wasb.points).toEqual([
        {
          weekEnding: minus(LATEST, 7),
          measured: true,
          businesses: 2,
          wasb: 2,
        },
        { weekEnding: LATEST, measured: true, businesses: 3, wasb: 2 },
      ])

      const funnel = await growthStageFunnel(prisma, { latestDay: LATEST })
      const stage = (s: string) => funnel.stages.find((x) => x.stage === s)
      expect(stage("expanding")).toEqual({
        stage: "expanding",
        count: 2,
        previous: 0,
        delta: 2,
      })
      expect(stage("habit")?.delta).toBe(-2)
      expect(funnel.moves).toEqual([
        { from: "habit", to: "expanding", count: 2 },
      ])

      const cohorts = await growthActivationCohorts(prisma, {
        now: NOW,
        weeks: 6,
      })
      const byStart = new Map(cohorts.map((x) => [x.cohortStart, x]))
      // ISO weeks start Monday: 1 Mar 2099 is a Sunday (week of 23 Feb).
      expect(byStart.get("2099-02-23")).toMatchObject({
        signups: 2,
        measured: 2,
        activated: 1,
        rate: 50,
        complete: true,
      })
      expect(byStart.get("2099-03-09")).toMatchObject({
        signups: 2,
        measured: 1,
        activated: 1,
        rate: 100,
      })

      const retention = await growthRetentionCurve(prisma, {
        now: NOW,
        months: 1,
      })
      const march = retention.find((r) => r.cohortMonth === "2099-03")
      expect(march?.weeks.find((w) => w.week === 1)).toEqual({
        week: 1,
        eligible: 2,
        active: 1,
        rate: 50,
      })
      expect(march?.weeks.find((w) => w.week === 4)).toMatchObject({
        eligible: 2,
        active: 1,
        rate: 50,
      })
      expect(march?.weeks.find((w) => w.week === 12)?.rate).toBeNull()

      const limits = await growthLimitPressure(prisma, { latestDay: LATEST })
      expect(limits.limits).toEqual([
        { limit: "products", tracked: 3, atOrAbove80: 2, atOrAbove100: 0 },
        { limit: "staff", tracked: 1, atOrAbove80: 1, atOrAbove100: 1 },
      ])

      const leads = await growthProductQualifiedLeads(prisma, {
        latestDay: LATEST,
      })
      expect(leads.total).toBe(2)
      expect(leads.leads.map((l) => [l.tenantId, l.topLimit])).toEqual([
        [a, "staff"],
        [e, "products"],
      ])

      const adoption = await growthFeatureAdoption(prisma, {
        latestDay: LATEST,
      })
      expect(adoption.businesses).toBe(3)
      const feature = (k: string) =>
        adoption.features.find((f) => f.key === k)?.percent
      expect(feature("site")).toBe(33.3)
      expect(feature("channel")).toBe(66.7)

      const whatsapp = await growthWhatsAppUsage(prisma, { latestDay: LATEST })
      expect(whatsapp.tracked).toBe(2)
      expect(whatsapp.atOrAbove80Percent).toBe(50)
      expect(whatsapp.exhaustedPercent).toBe(0)
      const emptyWhatsapp = await growthWhatsAppUsage(prisma, {
        latestDay: "2099-12-31",
      })
      expect(emptyWhatsapp.tracked).toBe(0)
      expect(emptyWhatsapp.atOrAbove80Percent).toBeNull()

      // Scorecard: P04 with 1 treated converted + 1 holdout not converted.
      const sentAt = new Date("2099-03-20T09:00:00Z")
      await prisma.lifecycleMessage.createMany({
        data: [
          {
            tenantId: a,
            userId: ownerId,
            playId: "P04_site_setup",
            periodKey: "once",
            variant: "a",
            channel: "email",
            status: "sent",
            sentAt,
            deliveredAt: sentAt,
            clickedAt: sentAt,
            convertedAt: sentAt,
            createdAt: sentAt,
          },
          {
            tenantId: b,
            userId: ownerId,
            playId: "P04_site_setup",
            periodKey: "once",
            variant: "control",
            channel: "email",
            status: "holdout",
            createdAt: sentAt,
          },
          {
            tenantId: e,
            userId: ownerId,
            playId: "P08_limit:products",
            periodKey: "products:2099-03",
            variant: "a",
            channel: "email",
            status: "sent",
            sentAt,
            convertedAt: sentAt,
            createdAt: sentAt,
          },
        ],
      })
      const scorecard = await growthPlayScorecard(prisma, {
        now: NOW,
        days: 30,
      })
      expect(scorecard.plays.find((p) => p.play === "P04_site_setup")).toEqual({
        play: "P04_site_setup",
        sent: 1,
        suppressed: 0,
        treated: 1,
        holdout: 1,
        deliveredPercent: 100,
        clickPercent: 100,
        conversionPercent: 100,
        holdoutConversionPercent: 0,
        enoughData: false,
        lift: null,
      })
      expect(scorecard.plays.find((p) => p.play === "P08_limit")?.treated).toBe(
        1,
      )

      // Revenue: empty before, one active Growth subscription after.
      const before = await growthRevenue(prisma, { now: NOW })
      expect(before.activeSubscriptions).toBe(0)
      expect(before.mrrMinor).toBe(0)
      await prisma.ownerBillingAccount.create({
        data: { id: accountId, ownerUserId: ownerId },
      })
      await prisma.ownerBillingSubscription.create({
        data: {
          accountId,
          provider: "OTHER",
          environment: "production",
          purchaseDigest: `growth-w4-${run}`,
          planId: "growth",
          status: "ACTIVE",
          currentPeriodEndsAt: new Date("2099-04-20T00:00:00Z"),
          verifiedAt: NOW,
          createdAt: new Date("2099-03-20T00:00:00Z"),
        },
      })
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { key: "growth" },
        select: { monthlyPriceMinor: true },
      })
      const after = await growthRevenue(prisma, { now: NOW })
      expect(after.live).toBe(true)
      expect(after.activeSubscriptions).toBe(1)
      expect(after.upgrades).toBe(1)
      expect(after.mrrMinor).toBe(plan?.monthlyPriceMinor ?? 0)
      expect(after.playAttributedUpgrades).toBe(1)

      // Intent counter: three taps this month, monthly rollover.
      const march20 = new Date("2099-03-20T10:00:00Z")
      for (let i = 0; i < 3; i++)
        await recordFeatureIntentTap(prisma, {
          tenantId: a,
          feature: "staff",
          now: march20,
        })
      await recordFeatureIntentTap(prisma, {
        tenantId: b,
        feature: "staff",
        now: march20,
      })
      const intent = await businessesWithFeatureIntent(prisma, {
        feature: "staff",
        minTaps: 3,
        month: "2099-03",
      })
      expect(intent.map((r) => [r.tenantId, r.taps])).toEqual([[a, 3]])
      await expect(
        recordFeatureIntentTap(prisma, { tenantId: a, feature: "Bad Label" }),
      ).rejects.toThrow()

      const detail = await growthBusinessDetail(prisma, a)
      expect(detail?.snapshot?.stage).toBe("expanding")
      expect(detail?.snapshot?.limitPressure).toEqual({
        products: 0.85,
        staff: 1,
      })
      expect(detail?.trail.map((t) => t.day)).toEqual(
        ["2099-03-08", "2099-03-15", "2099-03-22", LATEST].filter(
          (d) => d !== "2099-03-15",
        ),
      )
      expect(detail?.messages).toHaveLength(1)
      expect(detail?.intents).toEqual([
        expect.objectContaining({
          feature: "staff",
          month: "2099-03",
          taps: 3,
        }),
      ])
      expect(await growthBusinessDetail(prisma, qaId)).toBeNull()
    } finally {
      await prisma.ownerBillingSubscription.deleteMany({ where: { accountId } })
      await prisma.ownerBillingAccount.deleteMany({ where: { id: accountId } })
      await prisma.tenant.deleteMany({ where: { id: { in: [...ids, qaId] } } })
      await prisma.user.deleteMany({ where: { id: ownerId } })
    }
  })
})
