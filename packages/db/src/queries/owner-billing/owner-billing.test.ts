import { describe, expect, test } from "bun:test"
import {
  type OwnerBillingRepository,
  type OwnerBillingTransaction,
  enrollOwnerBusiness,
  removeOwnerBusiness,
} from "./commands"
import { OWNER_BILLING_OFFERS } from "./offers"
import {
  type OwnerBillingAccount,
  type OwnerBillingSubscription,
  type OwnerBusinessCoverage,
  type OwnerCoverageSnapshot,
  assertOwnerBusinessAllowance,
  assertOwnerPurchaseBinding,
  decideOwnerBusinessEnrollment,
  projectOwnerBusinessAccess,
} from "./policy"

const now = new Date("2026-10-27T12:00:00.000Z")
const account: OwnerBillingAccount = {
  id: "owner-account",
  ownerUserId: "owner",
  ownerIsActive: true,
}
const subscription: OwnerBillingSubscription = {
  accountId: account.id,
  planId: "growth",
  provider: "play_store",
  environment: "sandbox",
  purchaseDigest: "purchase-a",
  status: "ACTIVE",
  currentPeriodEndsAt: new Date("2026-11-27T12:00:00.000Z"),
}
function coverage(tenantId: string, offset = 0): OwnerBusinessCoverage {
  return {
    accountId: account.id,
    tenantId,
    enrolledAt: new Date(now.getTime() - 10_000 + offset),
  }
}
function snapshot(
  overrides: Partial<OwnerCoverageSnapshot> = {},
): OwnerCoverageSnapshot {
  return {
    account,
    subscription,
    coverage: [coverage("business-a"), coverage("business-b", 1)],
    ownedTenantIds: ["business-a", "business-b", "business-c", "business-d"],
    environment: "sandbox",
    now,
    ...overrides,
  }
}

describe("owner-wide effective business coverage", () => {
  test("each separate business receives the full allowance and no Store identity", () => {
    const a = projectOwnerBusinessAccess(snapshot(), "business-a")
    const b = projectOwnerBusinessAccess(snapshot(), "business-b")
    expect(a.planId).toBe("growth")
    expect(b.planId).toBe("growth")
    expect(a.quotaScope).toBe("business")
    expect(a.limits.products).toBe(1_000)
    expect(b.limits.staff).toBe(10)
    expect(a.limits.ordersPerMonth).toBeNull()
    expect(projectOwnerBusinessAccess(snapshot(), "store-a").reason).toBe(
      "not_owner",
    )
    expect(projectOwnerBusinessAccess(snapshot(), "business-c").reason).toBe(
      "uncovered",
    )
  })

  test.each([
    ["starter", 1],
    ["growth", 3],
    ["pro", 10],
  ] as const)("%s caps coverage at %i separate businesses", (planId, limit) => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      coverage(`tenant-${i}`, i),
    )
    const result = projectOwnerBusinessAccess(
      snapshot({
        subscription: { ...subscription, planId },
        coverage: rows,
        ownedTenantIds: rows.map((row) => row.tenantId),
      }),
      rows[limit]?.tenantId ?? "missing",
    )
    expect(result.coveredTenantIds).toHaveLength(limit)
    expect(result.overLimitTenantIds).toHaveLength(11 - limit)
    expect(result.planId).toBe("free")
    expect(result.reason).toBe("over_business_limit")
    expect(rows).toHaveLength(11)
  })

  test.each(["SUSPENDED", "CANCELLED"] as const)(
    "%s or refunded state loses paid access without deleting coverage",
    (status) => {
      const state = snapshot({ subscription: { ...subscription, status } })
      expect(projectOwnerBusinessAccess(state, "business-a").planId).toBe(
        "free",
      )
      expect(state.coverage).toHaveLength(2)
    },
  )

  test.each([new Date(now.getTime() - 1), now, new Date(Number.NaN)])(
    "expiry at or before now and invalid dates fail closed: %s",
    (endsAt) => {
      const result = projectOwnerBusinessAccess(
        snapshot({
          subscription: { ...subscription, currentPeriodEndsAt: endsAt },
        }),
        "business-a",
      )
      expect(result.planId).toBe("free")
      expect(result.businessLimit).toBe(0)
      expect(result.limits.products).toBe(10)
    },
  )

  test("renewal restores the same saved coverage; metadata grants are not rewritten", () => {
    const state = snapshot({
      subscription: { ...subscription, currentPeriodEndsAt: now },
    })
    expect(projectOwnerBusinessAccess(state, "business-a").planId).toBe("free")
    const renewed = { ...state, subscription }
    expect(projectOwnerBusinessAccess(renewed, "business-a").planId).toBe(
      "growth",
    )
    expect(renewed.coverage).toBe(state.coverage)
  })

  test("lost ownership, removed membership or inactive business frees the paid slot", () => {
    const state = snapshot({ ownedTenantIds: ["business-b", "business-c"] })
    expect(projectOwnerBusinessAccess(state, "business-a").reason).toBe(
      "not_owner",
    )
    expect(
      projectOwnerBusinessAccess(state, "business-b").coveredTenantIds,
    ).toEqual(["business-b"])
    expect(state.coverage).toHaveLength(2)
  })

  test("inactive payer, foreign account and wrong environment do not confer access", () => {
    for (const state of [
      snapshot({ account: { ...account, ownerIsActive: false } }),
      snapshot({ subscription: { ...subscription, accountId: "other" } }),
      snapshot({ environment: "production" }),
      snapshot({ subscription: null }),
    ]) {
      expect(projectOwnerBusinessAccess(state, "business-a").planId).toBe(
        "free",
      )
    }
  })

  test("downgrade is stable across query order, preserves records and blocks new admissions", () => {
    const state = snapshot({
      subscription: { ...subscription, planId: "starter" },
      coverage: [coverage("business-b"), coverage("business-a")],
    })
    expect(projectOwnerBusinessAccess(state, "business-a").planId).toBe(
      "starter",
    )
    expect(projectOwnerBusinessAccess(state, "business-b").reason).toBe(
      "over_business_limit",
    )
    expect(() =>
      decideOwnerBusinessEnrollment(state, {
        actorUserId: "owner",
        tenantId: "business-c",
        existingCoverage: null,
      }),
    ).toThrow("BUSINESS_LIMIT_REACHED")
    expect(state.coverage.map((row) => row.tenantId)).toEqual([
      "business-b",
      "business-a",
    ])
  })

  test("duplicate, foreign or invalid persisted coverage fails visibly", () => {
    for (const rows of [
      [coverage("business-a"), coverage("business-a")],
      [{ ...coverage("business-a"), accountId: "other" }],
      [{ ...coverage("business-a"), enrolledAt: new Date(Number.NaN) }],
    ]) {
      expect(() =>
        projectOwnerBusinessAccess(snapshot({ coverage: rows }), "business-a"),
      ).toThrow("INVALID_STATE")
    }
  })

  test("approved prices and business allowances do not activate the legacy catalog", () => {
    expect(OWNER_BILLING_OFFERS.starter.monthlyPriceMinor).toBe(500_000)
    expect(OWNER_BILLING_OFFERS.growth.monthlyPriceMinor).toBe(1_500_000)
    expect(OWNER_BILLING_OFFERS.pro.monthlyPriceMinor).toBe(3_000_000)
    expect(OWNER_BILLING_OFFERS.pro.products).toBeNull()
    expect(OWNER_BILLING_OFFERS.free.ordersPerMonth).toBe(50)
  })

  test("one business at its allowance cannot consume another business's allowance", () => {
    const state = snapshot()
    expect(() =>
      assertOwnerBusinessAllowance(state, {
        tenantId: "business-a",
        usage: { tenantId: "business-a", count: 1_000 },
        resource: "products",
        quantity: 1,
      }),
    ).toThrow("ALLOWANCE_REACHED")
    expect(
      assertOwnerBusinessAllowance(state, {
        tenantId: "business-b",
        usage: { tenantId: "business-b", count: 999 },
        resource: "products",
        quantity: 1,
      }).planId,
    ).toBe("growth")
    expect(() =>
      assertOwnerBusinessAllowance(state, {
        tenantId: "business-b",
        usage: { tenantId: "business-a", count: 0 },
        resource: "staff",
        quantity: 1,
      }),
    ).toThrow("INVALID_STATE")
  })

  test("over-limit data survives; only new admission fails, unlimited is explicit", () => {
    const state = snapshot({
      subscription: { ...subscription, planId: "starter" },
    })
    expect(() =>
      assertOwnerBusinessAllowance(state, {
        tenantId: "business-a",
        usage: { tenantId: "business-a", count: 200 },
        resource: "products",
        quantity: 1,
      }),
    ).toThrow("ALLOWANCE_REACHED")
    expect(
      assertOwnerBusinessAllowance(
        snapshot({ subscription: { ...subscription, planId: "pro" } }),
        {
          tenantId: "business-a",
          usage: { tenantId: "business-a", count: 20_000 },
          resource: "products",
          quantity: 1,
        },
      ).limits.products,
    ).toBeNull()
    expect(state.coverage).toHaveLength(2)
    expect(() =>
      assertOwnerBusinessAllowance(snapshot(), {
        tenantId: "business-a",
        usage: { tenantId: "business-a", count: -1 },
        resource: "staff",
        quantity: 1,
      }),
    ).toThrow("INVALID_STATE")
  })
})

function purchaseInput(): Parameters<typeof assertOwnerPurchaseBinding>[0] {
  return {
    account,
    environment: "sandbox",
    verifiedAccountToken: account.id,
    verifiedEnvironment: "sandbox",
    provider: "play_store",
    purchaseDigest: subscription.purchaseDigest,
    existingBinding: {
      scope: "owner",
      accountId: account.id,
      provider: "play_store",
      purchaseDigest: subscription.purchaseDigest,
      environment: "sandbox",
    },
    linkedPurchaseDigest: null,
    linkedBinding: null,
    currentSubscription: subscription,
    now,
  }
}

describe("verified owner purchase binding", () => {
  test("same-account restore and repeated verification are allowed", () => {
    expect(() => assertOwnerPurchaseBinding(purchaseInput())).not.toThrow()
    expect(() => assertOwnerPurchaseBinding(purchaseInput())).not.toThrow()
  })

  test("changing business selection cannot move the receipt to another account", () => {
    expect(() =>
      assertOwnerPurchaseBinding({
        ...purchaseInput(),
        account: {
          ...account,
          id: "other-account",
          ownerUserId: "other-owner",
        },
      }),
    ).toThrow("PURCHASE_BINDING_MISMATCH")
  })

  test("legacy Tenant receipts cannot be reinterpreted as owner subscriptions", () => {
    expect(() =>
      assertOwnerPurchaseBinding({
        ...purchaseInput(),
        existingBinding: { scope: "legacy_tenant", tenantId: "business-a" },
      }),
    ).toThrow("PURCHASE_BINDING_MISMATCH")
  })

  test("existing binding must match the exact owner, provider, purchase and environment", () => {
    const binding = {
      scope: "owner" as const,
      accountId: account.id,
      provider: "play_store" as const,
      purchaseDigest: subscription.purchaseDigest,
      environment: "sandbox" as const,
    }
    for (const existingBinding of [
      { ...binding, accountId: "other" },
      { ...binding, purchaseDigest: "another-receipt" },
      { ...binding, provider: "app_store" as const },
      { ...binding, environment: "production" as const },
    ]) {
      expect(() =>
        assertOwnerPurchaseBinding({ ...purchaseInput(), existingBinding }),
      ).toThrow("PURCHASE_BINDING_MISMATCH")
    }
    expect(() =>
      assertOwnerPurchaseBinding({
        ...purchaseInput(),
        environment: "production",
      }),
    ).toThrow("PURCHASE_BINDING_MISMATCH")
  })

  test("another active purchase or store is refused; expired subscription can be replaced", () => {
    const next = {
      ...purchaseInput(),
      purchaseDigest: "new-purchase",
      existingBinding: null,
    }
    expect(() => assertOwnerPurchaseBinding(next)).toThrow(
      "ACTIVE_SUBSCRIPTION_CONFLICT",
    )
    expect(() =>
      assertOwnerPurchaseBinding({ ...next, provider: "app_store" }),
    ).toThrow("ACTIVE_SUBSCRIPTION_CONFLICT")
    expect(() =>
      assertOwnerPurchaseBinding({
        ...next,
        currentSubscription: { ...subscription, currentPeriodEndsAt: now },
      }),
    ).not.toThrow()
    expect(() =>
      assertOwnerPurchaseBinding({
        ...next,
        currentSubscription: { ...subscription, status: "SUSPENDED" },
      }),
    ).toThrow("ACTIVE_SUBSCRIPTION_CONFLICT")
  })

  test("Play replacement needs a verified linked purchase bound to this owner", () => {
    const next = {
      ...purchaseInput(),
      purchaseDigest: "new-purchase",
      existingBinding: null,
      linkedPurchaseDigest: subscription.purchaseDigest,
    }
    expect(() => assertOwnerPurchaseBinding(next)).toThrow(
      "PURCHASE_BINDING_MISMATCH",
    )
    const linkedBinding = {
      scope: "owner" as const,
      accountId: account.id,
      provider: "play_store" as const,
      purchaseDigest: subscription.purchaseDigest,
      environment: "sandbox" as const,
    }
    expect(() =>
      assertOwnerPurchaseBinding({ ...next, linkedBinding }),
    ).not.toThrow()
    expect(() =>
      assertOwnerPurchaseBinding({
        ...next,
        linkedBinding: { ...linkedBinding, purchaseDigest: "unrelated" },
      }),
    ).toThrow("PURCHASE_BINDING_MISMATCH")
  })

  test("corrupt current subscription cannot be treated as an empty purchase slot", () => {
    expect(() =>
      assertOwnerPurchaseBinding({
        ...purchaseInput(),
        currentSubscription: {
          ...subscription,
          currentPeriodEndsAt: new Date(Number.NaN),
        },
      }),
    ).toThrow("INVALID_STATE")
  })
})

/** Serialized in-memory port model, not proof of PostgreSQL locks/constraints. */
function memoryRepository() {
  const state = {
    accounts: new Map([[account.id, account]]),
    subscriptions: new Map([[account.id, subscription]]),
    owned: new Map([[account.ownerUserId, new Set(snapshot().ownedTenantIds)]]),
    coverage: new Map(snapshot().coverage.map((row) => [row.tenantId, row])),
    removed: [] as OwnerBusinessCoverage[],
    failAfterWrite: false,
  }
  let queue = Promise.resolve()
  const repository: OwnerBillingRepository = {
    async transaction(_scope, work) {
      const previous = queue
      let release = () => {}
      queue = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous
      const before = new Map(state.coverage)
      const removedBefore = state.removed.slice()
      const tx: OwnerBillingTransaction = {
        getAccount: async (id) => state.accounts.get(id) ?? null,
        getSubscription: async (id) => state.subscriptions.get(id) ?? null,
        listCoverage: async (id) =>
          [...state.coverage.values()].filter((row) => row.accountId === id),
        getCoverage: async (id) => state.coverage.get(id) ?? null,
        getOwnedTenantIds: async (owner, ids) =>
          ids.filter((id) => state.owned.get(owner)?.has(id)),
        enrollCoverage: async (row) => {
          if (state.coverage.has(row.tenantId)) throw new Error("unique Tenant")
          state.coverage.set(row.tenantId, row)
          if (state.failAfterWrite) throw new Error("write failed")
        },
        removeCoverage: async (_id, tenantId) => {
          const row = state.coverage.get(tenantId)
          if (row) state.removed.push(row)
          state.coverage.delete(tenantId)
        },
      }
      try {
        return await work(tx)
      } catch (error) {
        state.coverage = before
        state.removed = removedBefore
        throw error
      } finally {
        release()
      }
    },
  }
  return { state, repository }
}
const command = {
  accountId: account.id,
  actorUserId: account.ownerUserId,
  tenantId: "business-c",
}
const context = { environment: "sandbox" as const, now: () => now }

describe("owner coverage commands against a transactional port model", () => {
  test("retry uses the existing enrollment without consuming another place", async () => {
    const { repository, state } = memoryRepository()
    const first = await enrollOwnerBusiness(repository, command, context)
    const retry = await enrollOwnerBusiness(repository, command, context)
    expect(first.action).toBe("enroll")
    expect(first.access.planId).toBe("growth")
    expect(retry.action).toBe("unchanged")
    expect(state.coverage.size).toBe(3)
    expect(state.coverage.get(command.tenantId)?.enrolledAt).toBe(now)
  })

  test("simultaneous enrollment at the cap admits one business", async () => {
    const { repository, state } = memoryRepository()
    const results = await Promise.allSettled([
      enrollOwnerBusiness(repository, command, context),
      enrollOwnerBusiness(
        repository,
        { ...command, tenantId: "business-d" },
        context,
      ),
    ])
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1)
    expect(state.coverage.size).toBe(3)
    const rejected = results.find((result) => result.status === "rejected")
    expect(rejected?.status === "rejected" && rejected.reason.code).toBe(
      "BUSINESS_LIMIT_REACHED",
    )
  })

  test("concurrent accounts cannot enroll the same business", async () => {
    const { repository, state } = memoryRepository()
    state.accounts.set("other-account", {
      ...account,
      id: "other-account",
      ownerUserId: "other-owner",
    })
    state.subscriptions.set("other-account", {
      ...subscription,
      accountId: "other-account",
    })
    state.owned.set("other-owner", new Set(["business-c"]))
    const results = await Promise.allSettled([
      enrollOwnerBusiness(repository, command, context),
      enrollOwnerBusiness(
        repository,
        { ...command, accountId: "other-account", actorUserId: "other-owner" },
        context,
      ),
    ])
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1)
    expect(state.coverage.get("business-c")?.accountId).toBe(account.id)
  })

  test("admin, foreign owner, missing account and lost membership cannot enroll", async () => {
    const { repository, state } = memoryRepository()
    await expect(
      enrollOwnerBusiness(
        repository,
        { ...command, actorUserId: "admin" },
        context,
      ),
    ).rejects.toThrow("OWNER_REQUIRED")
    await expect(
      enrollOwnerBusiness(
        repository,
        { ...command, accountId: "missing" },
        context,
      ),
    ).rejects.toThrow("OWNER_REQUIRED")
    state.owned.get("owner")?.delete("business-c")
    await expect(
      enrollOwnerBusiness(repository, command, context),
    ).rejects.toThrow("BUSINESS_OWNER_REQUIRED")
    expect(state.coverage.size).toBe(2)
  })

  test("expiry is checked inside the transaction and prevents new enrollment", async () => {
    const { repository, state } = memoryRepository()
    await expect(
      enrollOwnerBusiness(repository, command, {
        ...context,
        now: () => subscription.currentPeriodEndsAt,
      }),
    ).rejects.toThrow("SUBSCRIPTION_REQUIRED")
    expect(state.coverage.size).toBe(2)
  })

  test("a failed write rolls back the enrollment and retry remains possible", async () => {
    const { repository, state } = memoryRepository()
    state.failAfterWrite = true
    await expect(
      enrollOwnerBusiness(repository, command, context),
    ).rejects.toThrow("write failed")
    expect(state.coverage.size).toBe(2)
    state.failAfterWrite = false
    expect(
      (await enrollOwnerBusiness(repository, command, context)).action,
    ).toBe("enroll")
  })

  test("owner may release stale coverage; history and purchase remain, retry is inert", async () => {
    const { repository, state } = memoryRepository()
    state.owned.get("owner")?.delete("business-a")
    const remove = { ...command, tenantId: "business-a" }
    expect((await removeOwnerBusiness(repository, remove)).action).toBe(
      "removed",
    )
    expect((await removeOwnerBusiness(repository, remove)).action).toBe(
      "unchanged",
    )
    expect(state.removed.map((row) => row.tenantId)).toEqual(["business-a"])
    expect(state.subscriptions.get(account.id)).toBe(subscription)
    expect(state.coverage.size).toBe(1)
    await expect(
      removeOwnerBusiness(repository, {
        ...command,
        tenantId: "business-b",
        actorUserId: "admin",
      }),
    ).rejects.toThrow("OWNER_REQUIRED")
  })
})
