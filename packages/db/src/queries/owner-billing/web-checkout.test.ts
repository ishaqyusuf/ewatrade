import { expect, test } from "bun:test"
import { PrismaPg } from "@prisma/adapter-pg"
import { Prisma, PrismaClient } from "../../../generated/prisma/client"
import {
  type WebCheckoutProduct,
  applyOwnerWebCharge,
  bindOwnerWebSubscription,
  finishOwnerWebCheckout,
  prepareOwnerWebCheckout,
  recordWebRefund,
  revokeOwnerWebCharge,
} from "./web-checkout"

const accountId = "5e882a1e-d161-44cc-844c-4c0e94410001"
const product: WebCheckoutProduct = {
  provider: "paystack",
  planId: "starter",
  productId: "PLN_starter",
  currency: "NGN",
  amountMinor: 500000,
  referenceNgnMinor: 500000,
  countries: ["NG"],
}
type Row = Record<string, unknown>
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid fixture row")
  return Object.fromEntries(Object.entries(value))
}
function field(value: unknown, key: string) {
  return row(value)[key]
}

function matches(value: Row, filter: unknown): boolean {
  return Object.entries(row(filter)).every(([key, condition]) => {
    if (key === "AND")
      return (
        Array.isArray(condition) &&
        condition.every((item) => matches(value, item))
      )
    if (key === "OR")
      return (
        Array.isArray(condition) &&
        condition.some((item) => matches(value, item))
      )
    if (key === "metadata" || key === "payload") {
      const query = row(condition)
      const path = query.path
      if (!Array.isArray(path)) throw new Error("Missing fixture JSON path")
      const actual = path.reduce<unknown>(
        (part, name) =>
          typeof name === "string" && part ? row(part)[name] : undefined,
        value[key],
      )
      return query.equals === Prisma.JsonNull
        ? actual === null
        : actual === query.equals
    }
    return value[key] === condition
  })
}

/** Isolated delegate fixture; no connection, SQL execution or provider call occurs. */
function fixture() {
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: "postgresql://fixture:fixture@invalid.test/unused",
    }),
  })
  const state = {
    owner: true,
    businessOwner: true,
    sessions: [] as Row[],
    events: [] as Row[],
    purchase: null as Row | null,
    subscription: null as Row | null,
    locks: 0,
  }
  let tail: Promise<unknown> = Promise.resolve()
  Object.defineProperties(db, {
    $executeRaw: {
      value: async () => {
        state.locks++
        return 1
      },
    },
    $queryRaw: {
      value: async (...args: unknown[]) => {
        const sql = Array.isArray(args[0]) ? args[0].join("") : ""
        return state.owner &&
          args.at(-1) === "owner" &&
          (!sql.includes("Membership") || state.businessOwner)
          ? [{ id: accountId }]
          : []
      },
    },
    $transaction: {
      value: <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => {
        const run = tail.then(async () => {
          const before = structuredClone(state)
          try {
            return await work(db)
          } catch (error) {
            Object.assign(state, before)
            throw error
          }
        })
        tail = run.catch(() => {})
        return run
      },
    },
    subscriptionPlan: { value: { upsert: async () => ({ id: "plan" }) } },
    tenantSubscription: { value: { findFirst: async () => null } },
    billingCheckoutSession: {
      value: {
        updateMany: async (args: unknown) => {
          const saved = state.sessions.find(
            (s) => s.id === field(field(args, "where"), "id"),
          )
          if (!saved) return { count: 0 }
          Object.assign(saved, row(field(args, "data")))
          return { count: 1 }
        },
        findFirst: async () =>
          state.sessions.find(
            (s) => s.status === "CREATED" || s.status === "PENDING",
          ) ?? null,
        findUniqueOrThrow: async (args: unknown) => {
          const found = state.sessions.find(
            (s) => s.id === field(field(args, "where"), "id"),
          )
          if (!found) throw new Error("Missing fixture checkout")
          return structuredClone(found)
        },
        create: async (args: unknown) => {
          const saved = {
            ...row(field(args, "data")),
            createdAt: new Date(),
            checkoutUrl: null,
            completedAt: null,
          }
          state.sessions.push(saved)
          return structuredClone(saved)
        },
        update: async (args: unknown) => {
          const saved = state.sessions.find(
            (s) => s.id === field(field(args, "where"), "id"),
          )
          if (!saved) throw new Error("Missing fixture checkout")
          Object.assign(saved, row(field(args, "data")))
          return structuredClone(saved)
        },
      },
    },
    ownerBillingSubscription: {
      value: {
        findUnique: async () => structuredClone(state.subscription),
        upsert: async (args: unknown) => {
          state.subscription = {
            ...state.subscription,
            ...row(field(args, state.subscription ? "update" : "create")),
          }
          return state.subscription
        },
        updateMany: async () => {
          if (state.subscription) state.subscription.status = "CANCELLED"
          return { count: 1 }
        },
      },
    },
    ownerBillingPurchase: {
      value: {
        findUnique: async () => structuredClone(state.purchase),
        upsert: async (args: unknown) => {
          state.purchase = {
            ...state.purchase,
            ...row(field(args, state.purchase ? "update" : "create")),
          }
          return state.purchase
        },
      },
    },
    billingProviderEvent: {
      value: {
        findFirst: async (args: unknown) =>
          state.events.filter((e) => matches(e, field(args, "where"))).at(-1) ??
          null,
        findMany: async (args: unknown) =>
          state.events
            .filter((e) => matches(e, field(args, "where")))
            .slice(0, 2),
        findUnique: async (args: unknown) =>
          state.events.find(
            (e) =>
              e.eventId ===
              field(field(field(args, "where"), "provider_eventId"), "eventId"),
          ) ?? null,
        create: async (args: unknown) => {
          const saved = {
            id: `event-${state.events.length}`,
            ...row(field(args, "data")),
          }
          state.events.push(saved)
          return saved
        },
        upsert: async (args: unknown) => {
          const eventId = field(
            field(field(args, "where"), "provider_eventId"),
            "eventId",
          )
          const found = state.events.find((e) => e.eventId === eventId)
          if (found) {
            Object.assign(found, row(field(args, "update")))
            return found
          }
          const saved = {
            id: `event-${state.events.length}`,
            ...row(field(args, "create")),
          }
          state.events.push(saved)
          return saved
        },
        update: async (args: unknown) => {
          const saved = state.events.find(
            (e) => e.id === field(field(args, "where"), "id"),
          )
          if (!saved) throw new Error("Missing fixture event")
          Object.assign(saved, row(field(args, "data")))
          return saved
        },
      },
    },
  })
  return { db, state }
}
const input = {
  accountId,
  actorUserId: "owner",
  tenantId: "business",
  environment: "sandbox" as const,
  product,
  country: "NG",
  returnUrl: "https://dash.ewatrade.com/settings/billing",
}

test("preparation is owner-only and concurrent attempts reserve one checkout across businesses", async () => {
  const { db, state } = fixture()
  await expect(
    prepareOwnerWebCheckout(db, { ...input, actorUserId: "manager" }),
  ).rejects.toThrow("owner")
  expect(state.sessions).toHaveLength(0)
  const results = await Promise.allSettled([
    prepareOwnerWebCheckout(db, input),
    prepareOwnerWebCheckout(db, { ...input, tenantId: "other-business" }),
  ])
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
  expect(state.sessions).toHaveLength(1)
  expect(state.locks).toBeGreaterThan(0)
  const checkoutId = String(state.sessions[0]?.id)
  await finishOwnerWebCheckout(db, {
    id: checkoutId,
    accountId,
    state: "ready",
    checkoutUrl: "https://checkout.paystack.com/fixture",
  })
  expect((await prepareOwnerWebCheckout(db, input)).dispatch).toBe(false)
  await expect(
    prepareOwnerWebCheckout(db, {
      ...input,
      product: { ...product, productId: "PLN_other" },
    }),
  ).rejects.toThrow("pending")
})

test("an uncertain initialize attempt remains reserved and a lost owner cannot prepare payment", async () => {
  const { db, state } = fixture()
  const prepared = await prepareOwnerWebCheckout(db, input)
  await finishOwnerWebCheckout(db, {
    id: prepared.session.id,
    accountId,
    state: "uncertain",
  })
  await expect(prepareOwnerWebCheckout(db, input)).rejects.toThrow("pending")
  state.owner = false
  await expect(prepareOwnerWebCheckout(db, input)).rejects.toThrow("owner")
  expect(state.sessions).toHaveLength(1)
})

test("verified receipts grant one owner period, preserve explicit coverage and cannot replay after refund", async () => {
  const { db, state } = fixture()
  const prepared = await prepareOwnerWebCheckout(db, input)
  const receipt = {
    checkoutId: prepared.session.id,
    accountId,
    reference: `ewasub-${prepared.session.id}`,
    customerCode: "CUS_owner",
    authorizationDigest: "digest",
    paidAt: new Date("2026-11-01Z"),
    expiresAt: new Date("2026-12-01Z"),
    now: new Date("2026-11-08Z"),
  }
  expect((await applyOwnerWebCharge(db, receipt)).applied).toBe(true)
  expect(state.subscription?.status).toBe("ACTIVE")
  expect(state.subscription?.provider).toBe("OTHER")
  expect((await applyOwnerWebCharge(db, receipt)).applied).toBe(false)
  expect(
    state.events.filter((e) => e.type === "owner_paystack_charge"),
  ).toHaveLength(1)
  await finishOwnerWebCheckout(db, {
    id: prepared.session.id,
    accountId,
    state: "ready",
    checkoutUrl: "https://checkout.paystack.com/fixture",
  })
  expect(state.sessions[0]?.checkoutUrl).toBeNull()
  await recordWebRefund(db, receipt.reference, receipt.now)
  await revokeOwnerWebCharge(db, receipt)
  expect(state.subscription?.status).toBe("CANCELLED")
  await expect(applyOwnerWebCharge(db, receipt)).rejects.toThrow("refunded")
  expect(state.subscription?.status).toBe("CANCELLED")
})

test("an early refund tombstone and a current native subscription prevent a web grant", async () => {
  const { db, state } = fixture()
  state.subscription = {
    provider: "APP_STORE",
    status: "ACTIVE",
    currentPeriodEndsAt: new Date(Date.now() + 86400000),
  }
  await expect(prepareOwnerWebCheckout(db, input)).rejects.toThrow(
    "existing subscription",
  )
  state.subscription = null
  const prepared = await prepareOwnerWebCheckout(db, input)
  const receipt = {
    checkoutId: prepared.session.id,
    accountId,
    reference: `ewasub-${prepared.session.id}`,
    customerCode: "CUS_owner",
    authorizationDigest: "digest",
    paidAt: new Date("2026-11-01Z"),
    expiresAt: new Date("2026-12-01Z"),
    now: new Date("2026-11-08Z"),
  }
  await recordWebRefund(db, receipt.reference, receipt.now)
  await expect(applyOwnerWebCharge(db, receipt)).rejects.toThrow("refunded")
  expect(state.purchase).toBeNull()
  expect(state.subscription).toBeNull()
})

test("foreign-owner receipts, expired periods and old renewals cannot replace the current paid period", async () => {
  const { db, state } = fixture()
  const prepared = await prepareOwnerWebCheckout(db, input)
  const receipt = {
    checkoutId: prepared.session.id,
    accountId,
    reference: `ewasub-${prepared.session.id}`,
    customerCode: "CUS_owner",
    authorizationDigest: "digest",
    paidAt: new Date("2026-11-01Z"),
    expiresAt: new Date("2026-12-01Z"),
    now: new Date("2026-11-08Z"),
  }
  await expect(
    applyOwnerWebCharge(db, {
      ...receipt,
      accountId: "5e882a1e-d161-44cc-844c-4c0e94410009",
    }),
  ).rejects.toThrow("binding")
  await expect(
    applyOwnerWebCharge(db, { ...receipt, expiresAt: new Date("2028-01-01Z") }),
  ).rejects.toThrow("binding")
  await applyOwnerWebCharge(db, receipt)
  await bindOwnerWebSubscription(db, {
    customerCode: "CUS_owner",
    authorizationDigest: "digest",
    productId: product.productId,
    subscriptionCode: "SUB_owner",
    environment: "sandbox",
  })
  state.sessions.length = 0 // Deleting the initiating Tenant projection does not delete payment authority.
  state.businessOwner = false // Closing/releasing that business cannot lose the owner's other paid coverage.

  const renewal = {
    ...receipt,
    subscriptionCode: "SUB_owner",
    reference: "renewal",
    authorizationDigest: "rotated-card",
    paidAt: new Date("2026-12-01Z"),
    expiresAt: new Date("2027-01-01Z"),
    now: new Date("2026-12-01Z"),
  }
  await expect(
    applyOwnerWebCharge(db, { ...renewal, subscriptionCode: "SUB_foreign" }),
  ).rejects.toThrow("binding")
  await expect(
    applyOwnerWebCharge(db, { ...renewal, customerCode: "CUS_foreign" }),
  ).rejects.toThrow("binding")
  expect((await applyOwnerWebCharge(db, renewal)).applied).toBe(true)
  const currentEnd = state.subscription?.currentPeriodEndsAt
  const older = {
    ...receipt,
    subscriptionCode: "SUB_owner",
    reference: "older-invoice",
  }
  expect((await applyOwnerWebCharge(db, older)).applied).toBe(false)
  expect(state.subscription?.currentPeriodEndsAt).toEqual(currentEnd)
  await recordWebRefund(db, older.reference, older.now)
  await revokeOwnerWebCharge(db, older)
  expect(state.subscription?.status).toBe("ACTIVE")
})
