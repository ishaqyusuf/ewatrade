import { expect, test } from "bun:test"
import { assertAttachmentEntitlement } from "./attachment-entitlement"
import { RetailOpsSubscriptionError } from "./retail-ops-subscriptions"

function tenantReader(initial: {
  metadata: unknown
  subscription: {
    plan: { key: string }
    provider?: string
    status?: string
    currentPeriodEndsAt?: Date | null
  } | null
}) {
  let tenant = initial
  const calls: unknown[] = []
  const db = {
    tenant: {
      async findUniqueOrThrow(input: unknown) {
        calls.push(input)
        return tenant
      },
    },
  }
  // Only the selected read is provided; a new persistence dependency must fail.
  return {
    db: db as unknown as Parameters<typeof assertAttachmentEntitlement>[0],
    calls,
    change: (next: typeof initial) => {
      tenant = next
    },
  }
}

test("explicit Free refuses attachment entitlement with server upgrade text", async () => {
  const fixture = tenantReader({
    metadata: { retailOps: { subscription: { planId: "free" } } },
    subscription: null,
  })
  try {
    await assertAttachmentEntitlement(fixture.db, { tenantId: "tenant-a" })
    throw new Error("Expected plan refusal")
  } catch (error) {
    expect(error).toBeInstanceOf(RetailOpsSubscriptionError)
    if (!(error instanceof RetailOpsSubscriptionError)) throw error
    expect(error.code).toBe("PLAN_FEATURE_UNAVAILABLE")
    expect(error.feature).toBe("attachments")
    expect(error.message).toBe(
      "Upgrade from Free to attach photos, videos and documents.",
    )
  }
  expect(fixture.calls).toEqual([
    {
      where: { id: "tenant-a" },
      select: {
        metadata: true,
        subscription: {
          select: {
            plan: { select: { key: true } },
            provider: true,
            status: true,
            billingSubscriptionId: true,
            currentPeriodEndsAt: true,
          },
        },
      },
    },
  ])
})

test("durable subscription wins over metadata; every call rereads downgrade", async () => {
  const fixture = tenantReader({
    metadata: { retailOps: { subscription: { planId: "free" } } },
    subscription: { plan: { key: "starter" } },
  })
  expect(
    (await assertAttachmentEntitlement(fixture.db, { tenantId: "tenant-a" }))
      .id,
  ).toBe("starter")
  fixture.change({
    metadata: { retailOps: { subscription: { planId: "pro" } } },
    subscription: { plan: { key: "free" } },
  })
  await expect(
    assertAttachmentEntitlement(fixture.db, { tenantId: "tenant-a" }),
  ).rejects.toBeInstanceOf(RetailOpsSubscriptionError)
  expect(fixture.calls).toHaveLength(2)
})

test("launch-default Starter and all paid tiers retain attachments", async () => {
  for (const key of [null, "starter", "growth", "pro"]) {
    const fixture = tenantReader({
      metadata: null,
      subscription: key ? { plan: { key } } : null,
    })
    expect(
      (await assertAttachmentEntitlement(fixture.db, { tenantId: "tenant-a" }))
        .features,
    ).toContain("attachments")
  }
})

test("a failed fresh plan read propagates instead of using launch fallback", async () => {
  const failure = new Error("Tenant read failed")
  const db = {
    tenant: {
      async findUniqueOrThrow() {
        throw failure
      },
    },
  } as unknown as Parameters<typeof assertAttachmentEntitlement>[0]
  await expect(
    assertAttachmentEntitlement(db, { tenantId: "tenant-a" }),
  ).rejects.toBe(failure)
})

test("an expired Play subscription cannot admit an attachment using its saved paid key", async () => {
  const fixture = tenantReader({
    metadata: { retailOps: { subscription: { planId: "pro" } } },
    subscription: {
      plan: { key: "growth" },
      provider: "PLAY_STORE",
      status: "ACTIVE",
      currentPeriodEndsAt: new Date("2020-01-01T00:00:00Z"),
    },
  })
  await expect(
    assertAttachmentEntitlement(fixture.db, { tenantId: "tenant-a" }),
  ).rejects.toMatchObject({
    code: "PLAN_FEATURE_UNAVAILABLE",
    feature: "attachments",
  })
  expect(fixture.calls).toHaveLength(1)
})
