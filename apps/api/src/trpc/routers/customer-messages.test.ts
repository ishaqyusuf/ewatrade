import { expect, test } from "bun:test"
import { GENERAL_BUDGET_LIMITS } from "../../assistant/general-allowance"
import type { CustomerMessageAiInput } from "../../schemas/customer-messages"
import { createCallerFactory } from "../init"
import { customerMessagesRouter } from "./customer-messages"

const createCaller = createCallerFactory(customerMessagesRouter)
const selected: CustomerMessageAiInput = {
  eventKeys: ["payment.recorded"],
  tone: "friendly",
  language: "en",
}
const environmentKeys = [
  "ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED",
  "APP_ENV",
  "ASSISTANT_REHEARSAL_MODE",
  "DEEPSEEK_API",
] as const

function withEnvironment(values: Record<string, string | undefined>) {
  const previous = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  )
  for (const key of environmentKeys) {
    const value = values[key]
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
  return () => {
    for (const key of environmentKeys) {
      const value = previous[key]
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
}

function callerFixture(
  options: {
    role?: string
    privacyStatus?: string
    requests?: number
    stores?: Array<{ id: string }>
  } = {},
) {
  const events: string[] = []
  const storeReads: string[] = []
  const rawQueries: string[] = []
  let runtimeReads = 0
  let budgetUpserts = 0
  let budgetUpdates = 0
  let usageWrites = 0
  let transactions = 0
  const runtime = {
    enabled: true,
    provider: "DEEPSEEK",
    model: "deepseek-flash",
  }
  const tx = {
    $queryRaw: async (query: unknown) => {
      const sql = Array.isArray(query)
        ? query.join("?")
        : query &&
            typeof query === "object" &&
            "sql" in query &&
            typeof query.sql === "string"
          ? query.sql
          : query &&
              typeof query === "object" &&
              "text" in query &&
              typeof query.text === "string"
            ? query.text
            : ""
      rawQueries.push(sql)
      if (sql.includes('FROM "AccountPrivacyRequest"')) {
        events.push("privacy-read")
        return options.privacyStatus ? [{ status: options.privacyStatus }] : []
      }
      if (sql.includes('FROM "AssistantBudget"')) {
        events.push("budget-read")
        return [
          {
            requests: options.requests ?? 0,
            tokens: 0,
            windowStartedAt: new Date(),
          },
        ]
      }
      return []
    },
    membership: {
      findFirst: async () => {
        events.push("membership-read")
        return {
          id: "membership-a",
          role: options.role ?? "OWNER",
          staffAccessMode: "LEGACY",
          staffStoreAssignments: [],
        }
      },
    },
    store: {
      findFirst: async (args: { where: { id: string } }) => {
        events.push("store-read")
        storeReads.push(args.where.id)
        return {
          id: args.where.id,
          name: "QA Test Store",
          countryCode: "NG",
          supportPhone: null,
          salesRepOrderVisibility: "ALL_STORE_ORDERS",
          tenant: {
            name: "QA Test Business",
            countryCode: "NG",
            timezone: "Africa/Lagos",
            dataClassification: "LIVE",
          },
        }
      },
    },
    customerMessageTemplate: {
      findMany: async () => [],
    },
    assistantBudget: {
      upsert: async () => {
        budgetUpserts += 1
        events.push("budget-upsert")
        return {}
      },
      update: async () => {
        budgetUpdates += 1
        return {}
      },
      updateMany: async () => {
        budgetUpdates += 1
        return { count: 0 }
      },
    },
    assistantUsageEvent: {
      create: async () => {
        usageWrites += 1
        return {}
      },
    },
  }
  const db = {
    $transaction: async (work: (tx: never) => Promise<unknown>) => {
      transactions += 1
      return work(tx as never)
    },
    systemConfiguration: {
      findUnique: async () => {
        runtimeReads += 1
        events.push("runtime-read")
        return { value: runtime }
      },
    },
  }
  const caller = createCaller({
    db,
    requestHeaders: new Headers(),
    requestId: "customer-messages-test",
    session: {
      session: { id: "session-a", token: "ordinary-test-session" },
      user: { id: "owner-a", name: "Test Owner", isPlatformAdmin: false },
    },
    tenantContext: {
      tenant: {
        id: "tenant-a",
        name: "QA Test Business",
        dataClassification: "LIVE",
        qaPurgeStartedAt: null,
      },
      membership: { id: "membership-a", role: options.role ?? "OWNER" },
      activeStore: { id: "store-a", name: "QA Test Store" },
      stores: options.stores ?? [{ id: "store-a" }],
    },
    tenantId: "tenant-a",
    tenantSlug: "qa-test",
    isInternalRequest: false,
    forcePrimary: false,
    origin: null,
    clientIp: null,
    privacyClientIp: null,
    userAgent: "test",
    activeStoreId: "store-a",
    qaSessionScope: null,
  } as never)
  return {
    caller,
    events,
    rawQueries,
    storeReads,
    runtimeReads: () => runtimeReads,
    budgetUpserts: () => budgetUpserts,
    budgetUpdates: () => budgetUpdates,
    usageWrites: () => usageWrites,
    transactions: () => transactions,
  }
}

test("current Owner/Admin scope is checked before private-deletion and model/budget work", async () => {
  const restore = withEnvironment({
    ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED: "true",
  })
  try {
    const f = callerFixture({ role: "CASHIER", privacyStatus: "PROCESSING" })
    await expect(f.caller.draftWithAi(selected)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    expect(f.events).toContain("membership-read")
    expect(f.events).not.toContain("privacy-read")
    expect(f.runtimeReads()).toBe(0)
    expect(f.budgetUpserts()).toBe(0)
    expect(f.usageWrites()).toBe(0)
  } finally {
    restore()
  }
})

test("private deletion processing blocks AI before runtime configuration, allowance reservation, or usage writes", async () => {
  const restore = withEnvironment({
    ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED: "true",
  })
  try {
    const f = callerFixture({ privacyStatus: "PROCESSING" })
    await expect(f.caller.draftWithAi(selected)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message:
        "AI composition is unavailable while account deletion is processing.",
    })
    expect(f.events.indexOf("membership-read")).toBeLessThan(
      f.events.indexOf("privacy-read"),
    )
    expect(f.events).not.toContain("runtime-read")
    expect(f.events).not.toContain("budget-upsert")
    expect(f.runtimeReads()).toBe(0)
    expect(f.budgetUpserts()).toBe(0)
    expect(f.usageWrites()).toBe(0)
  } finally {
    restore()
  }
})

test("exhausted General allowance returns starters without model generation or usage writes", async () => {
  const restore = withEnvironment({
    ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED: "false",
    APP_ENV: "production",
    ASSISTANT_REHEARSAL_MODE: undefined,
    DEEPSEEK_API: "test-key-not-used",
  })
  try {
    const f = callerFixture({ requests: GENERAL_BUDGET_LIMITS.maxRequests })
    const result = await f.caller.draftWithAi(selected)
    expect(result.source).toBe("starter")
    expect(result.reason).toContain("allowance is used up")
    expect(result.drafts.map((draft) => draft.eventKey)).toEqual(
      selected.eventKeys,
    )
    expect(f.runtimeReads()).toBe(1)
    expect(f.budgetUpserts()).toBe(1)
    expect(f.events).toContain("budget-read")
    expect(f.budgetUpdates()).toBe(0)
    expect(f.usageWrites()).toBe(0)
    expect(f.transactions()).toBe(3)
  } finally {
    restore()
  }
})

test("saved wording lists the active Store unless Settings names another accessible one", async () => {
  const f = callerFixture({ stores: [{ id: "store-a" }, { id: "store-b" }] })
  expect((await f.caller.templates.list()).storeId).toBe("store-a")
  expect((await f.caller.templates.list({ storeId: "store-b" })).storeId).toBe(
    "store-b",
  )
  expect(f.storeReads).toEqual(["store-a", "store-b"])
})

test("saved wording refuses a Store outside the person's accessible Stores before any read or write", async () => {
  const f = callerFixture()
  await expect(
    f.caller.templates.list({ storeId: "store-other" }),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "Choose an accessible Store.",
  })
  await expect(
    f.caller.templates.setEnabled({
      storeId: "store-other",
      eventKey: "order.recorded",
      scope: "store",
      enabled: false,
      expectedRevision: 0,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(f.transactions()).toBe(0)
  expect(f.events).toEqual([])
})
