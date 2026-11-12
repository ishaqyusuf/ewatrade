import { describe, expect, test } from "bun:test"
import type { LimitPressureUsage } from "@ewatrade/db/lifecycle-limit-hooks"
import { isHoldout } from "../../policy"
import { isLifecycleCheckoutAvailable } from "./checkout-availability"
import { createLimitPressureHandler } from "./realtime-limit"

type Insert = Record<string, unknown>

/** Just enough of a Prisma transaction client for the handler. */
function fakeTx(options: {
  members?: { role: string; userId: string }[]
  unsubscribed?: string[]
}) {
  const inserts: Insert[] = []
  const tx = {
    tenant: {
      findUnique: async () => ({ countryCode: "NG", currencyCode: "NGN" }),
    },
    membership: {
      findMany: async () =>
        options.members ?? [{ role: "OWNER", userId: "owner_1" }],
    },
    marketingPreference: {
      findMany: async () =>
        (options.unsubscribed ?? []).map((userId) => ({
          userId,
          productTips: true,
          offers: false,
          monthlyReport: true,
          unsubscribedAllAt: new Date("2026-11-01T00:00:00Z"),
        })),
    },
    lifecycleMessage: {
      findMany: async () => [],
      createManyAndReturn: async ({ data }: { data: Insert[] }) => {
        inserts.push(...data)
        return data.map((row, index) => ({
          id: `msg_${index}`,
          status: row.status,
        }))
      },
    },
  }
  return { tx: tx as never, inserts }
}

// Pick a tenant id outside the holdout for P08 so rows are real sends.
const tenantId =
  ["t_a", "t_b", "t_c", "t_d", "t_e", "t_f"].find(
    (id) => !isHoldout(id, "P08_limit"),
  ) ?? "t_a"

const usage = (used: number, cap = 50): LimitPressureUsage => ({
  tenantId,
  planId: "free",
  limit: "ordersPerMonth",
  used,
  cap,
  now: new Date("2026-11-12T10:00:00Z"),
})

describe("real-time P08 handler", () => {
  test("40th of 50 orders writes a visible in-app banner row", async () => {
    const { tx, inserts } = fakeTx({})
    await createLimitPressureHandler({})(tx, usage(40))
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      playId: "P08_limit:ordersPerMonth",
      periodKey: "ordersPerMonth:2026-11:80",
      channel: "in_app",
      status: "sent",
      userId: "owner_1",
    })
  })

  test("39th of 50 writes nothing", async () => {
    const { tx, inserts } = fakeTx({})
    await createLimitPressureHandler({})(tx, usage(39))
    expect(inserts).toHaveLength(0)
  })

  test("90% queues an email; unsubscribed owners are recorded as suppressed", async () => {
    const { tx, inserts } = fakeTx({
      members: [
        { role: "OWNER", userId: "owner_1" },
        { role: "ADMIN", userId: "admin_1" },
      ],
      unsubscribed: ["admin_1"],
    })
    await createLimitPressureHandler({})(tx, usage(45))
    expect(inserts).toEqual([
      expect.objectContaining({
        userId: "owner_1",
        channel: "email",
        status: "pending",
        periodKey: "ordersPerMonth:2026-11:90",
      }),
      expect.objectContaining({
        userId: "admin_1",
        status: "suppressed",
        suppressedReason: "unsubscribed",
      }),
    ])
  })

  test("100% is transactional: it reaches an unsubscribed owner", async () => {
    const { tx, inserts } = fakeTx({ unsubscribed: ["owner_1"] })
    await createLimitPressureHandler({})(tx, usage(50))
    expect(inserts[0]).toMatchObject({
      channel: "email",
      status: "pending",
      periodKey: "ordersPerMonth:2026-11:100",
    })
  })

  test("staged rollout without P08 writes nothing", async () => {
    const { tx, inserts } = fakeTx({})
    await createLimitPressureHandler({
      GROWTH_LIFECYCLE_PLAYS: "P02_first_sale",
    })(tx, usage(50))
    expect(inserts).toHaveLength(0)
  })
})

describe("real-time P08 payload and inline send", () => {
  test("rows carry the template key and the frozen decision with its consent", async () => {
    const { tx, inserts } = fakeTx({})
    await createLimitPressureHandler({})(tx, usage(50))
    expect(inserts[0]).toMatchObject({
      templateKey: "lifecycle-limit-reached",
      payload: {
        ctaPath: "/settings/billing",
        inAppKey: null,
        consent: "transactional",
        data: expect.objectContaining({ used: 50, cap: 50, stage: 100 }),
      },
    })
  })

  test("new email rows are sent after a delay; in-app and suppressed rows are not", async () => {
    const { tx } = fakeTx({
      members: [
        { role: "OWNER", userId: "owner_1" },
        { role: "ADMIN", userId: "admin_1" },
      ],
      unsubscribed: ["admin_1"],
    })
    const scheduled: { run: () => void; delayMs: number }[] = []
    const sent: string[] = []
    const handler = createLimitPressureHandler(
      {},
      {
        sendEmail: async (id) => {
          sent.push(id)
        },
        schedule: (run, delayMs) => scheduled.push({ run, delayMs }),
      },
    )
    await handler(tx, usage(45))
    // Nothing is sent inside the transaction.
    expect(sent).toEqual([])
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0]?.delayMs).toBe(3_000)
    scheduled[0]?.run()
    await Promise.resolve()
    expect(sent).toEqual(["msg_0"])

    const banner = fakeTx({})
    const bannerScheduled: unknown[] = []
    await createLimitPressureHandler(
      {},
      {
        sendEmail: async () => {},
        schedule: (run) => bannerScheduled.push(run),
      },
    )(banner.tx, usage(40))
    expect(bannerScheduled).toHaveLength(0)
  })

  test("an existing ledger row is not sent again", async () => {
    const { tx } = fakeTx({})
    ;(
      tx as { lifecycleMessage: { createManyAndReturn: unknown } }
    ).lifecycleMessage.createManyAndReturn = async () => []
    const scheduled: unknown[] = []
    await createLimitPressureHandler(
      {},
      { sendEmail: async () => {}, schedule: (run) => scheduled.push(run) },
    )(tx, usage(45))
    expect(scheduled).toHaveLength(0)
  })
})

describe("checkout availability", () => {
  const business = { countryCode: "NG", currencyCode: "NGN" }
  const products = JSON.stringify(
    (["starter", "growth", "pro"] as const).map((planId, index) => ({
      provider: "paystack",
      productId: `PLN_${planId}`,
      planId,
      countries: ["NG"],
      currency: "NGN",
      amountMinor: [500_000, 1_500_000, 3_000_000][index],
      referenceNgnMinor: [500_000, 1_500_000, 3_000_000][index],
    })),
  )
  const live = {
    WEB_BILLING_ENVIRONMENT: "sandbox",
    WEB_BILLING_ENABLED: "true",
    WEB_BILLING_RECONCILIATION_ENABLED: "true",
    OWNER_BILLING_ENABLED: "true",
    STORE_BILLING_ENVIRONMENT: "sandbox",
    PAYSTACK_SUBSCRIPTION_SECRET_KEY: "sk_test_x",
    WEB_BILLING_PRODUCTS: products,
  }

  test("off by default", () => {
    expect(isLifecycleCheckoutAvailable({ business }, {})).toBe(false)
  })

  test("on for a Nigerian business when every switch and product is set", () => {
    expect(isLifecycleCheckoutAvailable({ business }, live)).toBe(true)
  })

  test("off when a switch is missing or the business is outside Nigeria", () => {
    expect(
      isLifecycleCheckoutAvailable(
        { business },
        { ...live, OWNER_BILLING_ENABLED: "false" },
      ),
    ).toBe(false)
    expect(
      isLifecycleCheckoutAvailable(
        { business: { countryCode: "GH", currencyCode: "GHS" } },
        live,
      ),
    ).toBe(false)
  })
})
