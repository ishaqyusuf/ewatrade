import { afterAll, beforeAll, expect, test } from "bun:test"
import { WHATSAPP_PHOTO_ORDER_LIST_MAX } from "@ewatrade/assistant/channels/media"
import { openOrderWhere } from "@ewatrade/db/queries"
import { listAssistantWhatsAppPhotoOfferOrders } from "./channel-media-turn"
import type { GeneralContext } from "./general-context"

const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "photo-offer-test-key-at-least-thirty-two-bytes"
})
afterAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
})

function fixture(role: string, salesRepOrderVisibility = "OWN_ORDERS") {
  const reads: unknown[] = []
  const ctx = {
    db: {
      store: {
        findFirst: async () => ({ salesRepOrderVisibility }),
      },
      commercialOrder: {
        findMany: async (input: unknown) => {
          reads.push(input)
          return [{ id: "order-new" }, { id: "order-old" }]
        },
      },
    },
    session: { user: { id: "actor" }, session: { id: "browser-session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "business",
        dataClassification: "QA",
        retailOpsPlanId: "pro",
        currencyCode: "NGN",
      },
      membership: { id: "membership", role },
      activeStore: { id: "store", name: "Yaba Main", currencyCode: "NGN" },
      stores: [{ id: "store" }],
      staffAccess: {
        businessRole: role,
        status: "ACTIVE",
        mode: "LEGACY",
        catalogEditor: false,
        assignments: [],
      },
    },
  } as unknown as GeneralContext
  return { ctx, reads }
}

test("Other order offers the newest open orders visible in this Store, capped for the list", async () => {
  const { ctx, reads } = fixture("OWNER")
  expect(await listAssistantWhatsAppPhotoOfferOrders(ctx)).toEqual([
    "order-new",
    "order-old",
  ])
  expect(reads).toEqual([
    {
      where: { tenantId: "business", storeId: "store", ...openOrderWhere },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
      take: WHATSAPP_PHOTO_ORDER_LIST_MAX,
    },
  ])
})

test("a sales rep is offered only the orders they may already see", async () => {
  const own = fixture("CASHIER")
  await listAssistantWhatsAppPhotoOfferOrders(own.ctx)
  expect(own.reads).toEqual([
    expect.objectContaining({
      where: {
        tenantId: "business",
        storeId: "store",
        createdByUserId: "actor",
        ...openOrderWhere,
      },
    }),
  ])
  const all = fixture("CASHIER", "ALL_STORE_ORDERS")
  await listAssistantWhatsAppPhotoOfferOrders(all.ctx)
  expect(all.reads).toEqual([
    expect.objectContaining({
      where: { tenantId: "business", storeId: "store", ...openOrderWhere },
    }),
  ])
})

test("without a usable assistant scope nothing is offered and the order is never read", async () => {
  const { ctx, reads } = fixture("OWNER")
  const key = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = ""
  try {
    expect(await listAssistantWhatsAppPhotoOfferOrders(ctx)).toEqual([])
  } finally {
    process.env.ASSISTANT_APPROVAL_SIGNING_KEY = key
  }
  expect(reads).toEqual([])
})
