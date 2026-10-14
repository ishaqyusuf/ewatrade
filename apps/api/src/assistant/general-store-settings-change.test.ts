import { afterAll, beforeAll, expect, test } from "bun:test"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralTransactionContext } from "./general-actions"
import { storeSettingsUpdate } from "./general-store-settings-change"

const savedKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "s".repeat(32)
})
afterAll(() => {
  if (savedKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = savedKey
})

type Action = Extract<GeneralAction, { action: "store_settings_update" }>
function context(options: { plan?: string } = {}) {
  const store = {
    id: "store-a",
    name: "Wuse",
    currencyCode: "NGN",
    metadata: {},
    tenant: {
      name: "Amina Stores",
      metadata: {
        orderReceiptSettings: {
          showCustomerName: true,
          showPaymentBreakdown: true,
          thankYouNote: "Thank you for shopping with us.",
        },
      },
    },
    commercialOrderReminderSettings: null as null | Record<string, unknown>,
    salesRepOrderVisibility: "OWN_SALES",
  }
  const writes: string[] = []
  const db = {
    store: {
      findFirst: async () => store,
      updateMany: async (args: {
        data: { salesRepOrderVisibility?: string }
      }) => {
        writes.push(`visibility:${args.data.salesRepOrderVisibility}`)
        if (args.data.salesRepOrderVisibility)
          store.salesRepOrderVisibility = args.data.salesRepOrderVisibility
        return { count: 1 }
      },
    },
    $executeRaw: async () => {
      writes.push("receipts")
      return 1
    },
    commercialOrderReminderSettings: {
      upsert: async (args: { update: Record<string, unknown> }) => {
        writes.push("reminders")
        store.commercialOrderReminderSettings = {
          ...args.update,
          updatedAt: new Date(),
        }
        return { ...args.update, storeId: "store-a", updatedAt: new Date() }
      },
    },
  }
  const ctx = {
    session: { user: { id: "owner-u" }, session: { id: "session" } },
    tenantContext: {
      tenant: {
        id: "tenant-a",
        dataClassification: "QA",
        retailOpsPlanId: options.plan ?? "pro",
      },
      membership: { role: "OWNER" },
      activeStore: { id: "store-a", name: "Wuse" },
      stores: [{ id: "store-a" }],
      staffAccess: { status: "ACTIVE", mode: "LEGACY" },
    },
    db,
  } as unknown as GeneralTransactionContext
  return { ctx, store, writes }
}
const receipts: Action = {
  action: "store_settings_update",
  change: {
    section: "receipts",
    scope: "store",
    settings: {
      showCustomerName: false,
      showPaymentBreakdown: true,
      thankYouNote: "See you soon",
    },
  },
}
const reminders: Action = {
  action: "store_settings_update",
  change: {
    section: "reminders",
    enabled: true,
    dayBeforeEnabled: true,
    sameDayEnabled: false,
  },
}
const visibility: Action = {
  action: "store_settings_update",
  change: { section: "order_visibility", visibility: "ALL_STORE_ORDERS" },
}

test("review shows before and after with the Store-wide effect", async () => {
  const { ctx } = context()
  const review = await storeSettingsUpdate.review?.(ctx, receipts)
  expect(review?.lines).toEqual([
    "Wuse · own receipt settings",
    "Before: none (uses business defaults)",
    'After: customer name no, payment breakdown yes, note "See you soon"',
    "Only Wuse. Other Stores keep the business defaults or their own settings.",
    "Receipts already shared stay as they were.",
  ])
  const remindersReview = await storeSettingsUpdate.review?.(ctx, reminders)
  expect(remindersReview?.lines).toContain("Same day: yes → no")
  const visibilityReview = await storeSettingsUpdate.review?.(ctx, visibility)
  expect(visibilityReview?.lines).toContain(
    "Sales reps (Cashier/Operator) see: only orders they created → all orders in this Store",
  )
})

test("a change already saved is refused instead of re-saved", async () => {
  const { ctx } = context()
  await expect(
    storeSettingsUpdate.validate(
      ctx,
      {
        action: "store_settings_update",
        change: { section: "order_visibility", visibility: "OWN_SALES" },
      },
      false,
    ),
  ).rejects.toThrow("This setting is already saved.")
})

test("the review goes stale when the current value changes", async () => {
  const { ctx, store } = context()
  const before = await storeSettingsUpdate.validate(ctx, reminders, false)
  store.commercialOrderReminderSettings = {
    enabled: false,
    dayBeforeEnabled: true,
    sameDayEnabled: true,
    updatedAt: new Date(),
  }
  const after = await storeSettingsUpdate.validate(ctx, reminders, false)
  expect(after?.revision).not.toBe(before?.revision)
})

test("each section keeps its plan gate", async () => {
  const { ctx, writes } = context({ plan: "free" })
  await expect(
    storeSettingsUpdate.review?.(ctx, reminders),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  // Visibility has no plan gate.
  expect(
    (await storeSettingsUpdate.review?.(ctx, visibility))?.lines,
  ).toBeTruthy()
  expect(writes).toEqual([])
})

test("confirmation writes through the canonical setter and names the section", async () => {
  const { ctx, writes } = context()
  expect(await storeSettingsUpdate.execute(ctx, visibility, "key")).toEqual({
    kind: "store_order_visibility",
    recordId: "store-a",
    title: "Store setting saved",
    detail: "Wuse · Sales reps see all orders in this Store",
  })
  expect(
    await storeSettingsUpdate.execute(ctx, reminders, "key-2"),
  ).toMatchObject({ kind: "store_reminder_settings", recordId: "store-a" })
  expect(
    await storeSettingsUpdate.execute(ctx, receipts, "key-3"),
  ).toMatchObject({ kind: "store_receipt_settings" })
  expect(writes).toEqual([
    "visibility:ALL_STORE_ORDERS",
    "reminders",
    "receipts",
  ])
})
