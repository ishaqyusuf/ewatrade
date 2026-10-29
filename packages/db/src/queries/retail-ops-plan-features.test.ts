import { expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import {
  getRetailOpsTenantPlan,
  getRetailOpsTenantPlanFeatures,
} from "./retail-ops-subscriptions"
import type { DbClient } from "./types"

type Subscription = {
  key: string
  provider?: string
  status?: string
  billingSubscriptionId?: string | null
  currentPeriodEndsAt?: Date | null
}
function fixture(
  metadata: unknown = {},
  subscription?: Subscription,
  missingBilling = false,
) {
  const calls: { path: string; args: unknown }[] = []
  const plan = subscription
    ? {
        id: "plan",
        key: subscription.key,
        name: "Plan",
        description: "",
        limits: {},
        priceLabel: "",
        supportLabel: "",
      }
    : null
  const durable = subscription
    ? {
        id: "subscription",
        tenantId: "tenant",
        planId: "plan",
        plan,
        provider: subscription.provider ?? "NONE",
        status: subscription.status ?? "ACTIVE",
        billingSubscriptionId: subscription.billingSubscriptionId ?? null,
        currentPeriodEndsAt: subscription.currentPeriodEndsAt ?? null,
        limitsSnapshot: {},
        trialEndsAt: null,
        updatedAt: new Date("2026-01-01"),
      }
    : null
  const absent = () =>
    new Prisma.PrismaClientKnownRequestError("table unavailable", {
      code: "P2021",
      clientVersion: "source",
    })
  const state: { metadata: unknown; error?: Error } = { metadata }
  const db = {
    tenant: {
      findUniqueOrThrow: async (args: {
        where: { id: string }
        select: { subscription?: unknown }
      }) => {
        calls.push({ path: "tenant", args })
        if (state.error) throw state.error
        if (missingBilling && args.select.subscription) throw absent()
        return {
          id: args.where.id,
          metadata: state.metadata,
          subscription: durable,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
        }
      },
    },
    subscriptionPlan: {
      findMany: async (args: unknown) => {
        calls.push({ path: "plans", args })
        if (missingBilling) throw absent()
        return plan ? [plan] : []
      },
    },
    tenantSubscription: {
      findUnique: async (args: unknown) => {
        calls.push({ path: "subscription", args })
        if (missingBilling) throw absent()
        return durable
      },
    },
  } as unknown as DbClient
  return { db, calls, state }
}

test("narrow feature projection matches current subscription policy without catalogue/label/limit reads", async () => {
  const metadata = { retailOps: { subscription: { planId: "growth" } } }
  const cases: [unknown, Subscription | undefined][] = [
    [{}, undefined],
    [{ retailOps: { subscription: { planId: "free" } } }, undefined],
    [metadata, undefined],
    [
      {
        retailOps: {
          subscription: {
            planId: "pro",
            source: "owner_signup_launch",
            revokedAt: "2026-01-01",
            grantedAt: "2026-01-01",
          },
        },
      },
      undefined,
    ],
    [metadata, { key: "starter" }],
    [metadata, { key: "not-a-plan" }],
    [metadata, { key: "not-a-plan", provider: "APP_STORE", status: "EXPIRED" }],
    [metadata, { key: "pro", provider: "MANUAL", status: "CANCELED" }],
    [
      metadata,
      {
        key: "pro",
        provider: "STRIPE",
        status: "PAST_DUE",
        currentPeriodEndsAt: new Date("2000-01-01"),
      },
    ],
  ]
  for (const provider of ["APP_STORE", "PLAY_STORE", "MANUAL"]) {
    for (const status of ["ACTIVE", "CANCELED"]) {
      for (const currentPeriodEndsAt of [
        null,
        new Date("2000-01-01"),
        new Date("2100-01-01"),
      ]) {
        cases.push([
          metadata,
          {
            key: "pro",
            provider,
            status,
            currentPeriodEndsAt,
            billingSubscriptionId:
              provider === "MANUAL" ? "play-review:source" : null,
          },
        ])
      }
    }
  }
  for (const [stored, subscription] of cases) {
    const old = fixture(stored, subscription)
    const current = fixture(stored, subscription)
    const expected = (
      await getRetailOpsTenantPlan(old.db, { tenantId: "selected" })
    ).plan.features
    expect(
      await getRetailOpsTenantPlanFeatures(current.db, {
        tenantId: "selected",
      }),
    ).toEqual(expected)
    expect(current.calls).toHaveLength(1)
    expect(current.calls[0]).toMatchObject({
      path: "tenant",
      args: {
        where: { id: "selected" },
        select: {
          subscription: { select: { plan: { select: { key: true } } } },
        },
      },
    })
    expect(JSON.stringify(current.calls)).not.toContain('"limits"')
    expect(JSON.stringify(current.calls)).not.toContain('"name"')
  }
})

test("billing-table unavailability preserves the canonical metadata fallback", async () => {
  const metadata = { retailOps: { subscription: { planId: "free" } } }
  const old = fixture(metadata, undefined, true)
  const current = fixture(metadata, undefined, true)
  expect(
    await getRetailOpsTenantPlanFeatures(current.db, { tenantId: "selected" }),
  ).toEqual(
    (await getRetailOpsTenantPlan(old.db, { tenantId: "selected" })).plan
      .features,
  )
})

test("each call reads current facts and returned features do not mutate the catalogue", async () => {
  const current = fixture()
  const features = await getRetailOpsTenantPlanFeatures(current.db, {
    tenantId: "selected",
  })
  expect(features).toContain("finance")
  features.length = 0
  expect(
    await getRetailOpsTenantPlanFeatures(current.db, { tenantId: "selected" }),
  ).toContain("finance")
  current.state.metadata = { retailOps: { subscription: { planId: "free" } } }
  expect(
    await getRetailOpsTenantPlanFeatures(current.db, { tenantId: "selected" }),
  ).toEqual([])
  expect(current.calls).toHaveLength(3)
})

test("unavailable tenants and unexpected read failures propagate without a catalogue retry", async () => {
  for (const error of [
    new Error("unavailable"),
    new Prisma.PrismaClientKnownRequestError("record unavailable", {
      code: "P2025",
      clientVersion: "source",
    }),
  ]) {
    const current = fixture()
    current.state.error = error
    await expect(
      getRetailOpsTenantPlanFeatures(current.db, { tenantId: "selected" }),
    ).rejects.toBe(error)
    expect(current.calls).toHaveLength(1)
  }
})
