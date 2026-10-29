import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { type FetchQueryOptions, QueryClient } from "@tanstack/react-query"

const reads: { path: string; input: unknown }[] = []
let signedIn = true
let role = "OWNER"
let pharmacy = true
let hasStore = true
let release = () => {}
let gate: Promise<void>
let client: QueryClient
const stores = [
  { id: "store-a", name: "A" },
  { id: "store-b", name: "B" },
]
function endpoint(path: string) {
  return {
    queryOptions: (input?: unknown, options?: object) => ({
      ...options,
      queryKey: [path, input],
      queryFn: async () => {
        reads.push({ path, input })
        await gate
        return {}
      },
    }),
  }
}
mock.module("server-only", () => ({}))
mock.module("@/lib/session", () => ({
  getServerSession: async () => (signedIn ? { user: { id: "actor" } } : null),
}))
mock.module("@/lib/tenant", () => ({
  getActiveTenant: async () => ({
    membership: { role },
    tenant: { id: "tenant", timezone: "UTC" },
    activeStore: hasStore ? stores[0] : null,
    stores: hasStore ? stores : [],
  }),
}))
mock.module("@/lib/navigation", () => ({
  getDashboardNavItem: (href: string) => (pharmacy ? { href } : null),
}))
mock.module("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))
mock.module("@/utils/columns", () => ({
  getInitialTableSettings: async () => ({}),
}))
mock.module("@/utils/directory-views", () => ({
  getInitialDirectoryView: async () => ({ scope: "display", view: null }),
}))
mock.module(
  "@/components/customer-channels/customer-channels-workspace",
  () => ({
    CustomerChannelsWorkspace: () => null,
    CustomerChannelsSkeleton: () => null,
  }),
)
mock.module("@/components/compliance/pharmacy-compliance-workspace", () => ({
  PharmacyComplianceWorkspace: () => null,
}))
mock.module("@/components/service-commerce/service-commerce-setup", () => ({
  ServiceCommerceSetup: () => null,
  ServiceCommerceSetupSkeleton: () => null,
}))
mock.module("@/components/receipts/settings-form", () => ({
  ReceiptSettingsForm: () => null,
}))
mock.module("@/components/settings/return-refund-settings", () => ({
  ReturnRefundSettings: () => null,
}))
mock.module("@/components/stores/stores-directory", () => ({
  StoresDirectory: () => null,
  StoresSkeleton: () => null,
}))
mock.module("@/components/customer-messages/template-list", () => ({
  CustomerMessageTemplateList: () => null,
}))
mock.module("@/components/settings/settings-page", () => ({
  SettingsPage: () => null,
}))
mock.module("@/components/store-conversations/conversation-workspace", () => ({
  ConversationWorkspace: () => null,
  ConversationQueueSkeleton: () => null,
}))
mock.module("@/components/orders/overview/order-page", () => ({
  OrderPage: () => null,
}))
mock.module("@/trpc/server", () => ({
  prefetch: (options: FetchQueryOptions) => client.prefetchQuery(options),
  HydrateClient: () => null,
  trpc: {
    catalog: { listItems: endpoint("catalog.listItems") },
    tenant: { stores: endpoint("tenant.stores") },
    orders: {
      get: endpoint("orders.get"),
      timeline: endpoint("orders.timeline"),
      changeOptions: endpoint("orders.changeOptions"),
      receiptSettings: endpoint("orders.receiptSettings"),
      changePolicy: endpoint("orders.changePolicy"),
    },
    customerMessages: { templates: { list: endpoint("templates.list") } },
    prescriptions: Object.fromEntries(
      [
        "setup",
        "channelInfo",
        "whatsappConnections",
        "deliveryZones",
        "retentionPolicy",
        "manualDeliveryReviews",
        "complianceEvents",
      ].map((key) => [key, endpoint(`prescriptions.${key}`)]),
    ),
    serviceAccess: { requests: endpoint("serviceAccess.requests") },
    serviceCommerce: Object.fromEntries(
      [
        "channelWorkspace",
        "pendingQuoteApprovals",
        "storeConversationAvailabilitySettings",
        "quoteReleaseSettings",
        "storeConversationChannelModeSettings",
        "workspaceAccess",
        "bookingConfiguration",
        "storeConversationQueue",
        "storeConversationTimeline",
      ].map((key) => [key, endpoint(`serviceCommerce.${key}`)]),
    ),
  },
}))
const { default: Channels } = await import("./settings/channels/page")
const { default: Compliance } = await import("./settings/compliance/page")
const { default: ServiceCommerce } = await import(
  "./settings/service-commerce/page"
)
const { default: Receipts } = await import("./settings/receipts/page")
const { default: Returns } = await import("./settings/returns/page")
const { default: Stores } = await import("./settings/stores/page")
const { default: Messages } = await import("./settings/whatsapp-messages/page")
const { default: Conversations } = await import("./conversations/page")
const { default: Order } = await import("./sales/orders/[orderId]/page")
const props = () => ({ searchParams: Promise.resolve({ storeId: "store-b" }) })
const routes = [
  ["Channels", () => Channels(props()), 5],
  ["Compliance", () => Compliance(props()), 7],
  ["Service commerce", () => ServiceCommerce(props()), 2],
  ["Receipts", () => Receipts(props()), 1],
  ["Returns", () => Returns(props()), 1],
  ["Stores", () => Stores(), 1],
  ["Messages", () => Messages(props()), 1],
  [
    "Conversations",
    () =>
      Conversations({
        searchParams: Promise.resolve({
          store: "store-b",
          conversationId: "conversation",
          conversationSheet: "detail",
        }),
      }),
    2,
  ],
  ["Order", () => Order({ params: Promise.resolve({ orderId: "order" }) }), 3],
] as const
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))
beforeEach(() => {
  reads.length = 0
  signedIn = true
  role = "OWNER"
  pharmacy = true
  hasStore = true
  gate = new Promise<void>((resolve) => {
    release = resolve
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
})
afterEach(() => {
  release()
  client.clear()
})

for (const [name, render, count] of routes) {
  test(`${name} returns its loading owner while all presentation reads remain pending`, async () => {
    let rendered = false
    const rendering = render().then(() => {
      rendered = true
    })
    try {
      await settle()
      expect(rendered).toBe(true)
      expect(reads).toHaveLength(count)
      for (const read of reads) {
        if (
          read.input &&
          typeof read.input === "object" &&
          "storeId" in read.input
        )
          expect(read.input.storeId).toBe("store-b")
      }
    } finally {
      release()
      await rendering
    }
  })
  test(`${name} refuses signed-out admission before scheduling reads`, async () => {
    signedIn = false
    await expect(render()).rejects.toThrow("redirect:")
    expect(reads).toEqual([])
  })
}

test("manager and pharmacy page admission still precedes optional presentation", async () => {
  role = "CASHIER"
  for (const render of [
    () => Compliance(props()),
    () => Receipts(props()),
    () => Returns(props()),
    () => Stores(),
    () => Messages(props()),
  ])
    await expect(render()).rejects.toThrow("redirect:")
  role = "OWNER"
  pharmacy = false
  await expect(Compliance(props())).rejects.toThrow("redirect:/settings")
  expect(reads).toEqual([])
})

test("channel operator scheduling does not acquire manager settings", async () => {
  role = "OPERATOR"
  release()
  await Channels(props())
  expect(reads.map((read) => read.path).sort()).toEqual([
    "serviceCommerce.channelWorkspace",
    "serviceCommerce.pendingQuoteApprovals",
  ])
})

test("open booking preserves selected offering and request dependencies", async () => {
  release()
  await ServiceCommerce({
    searchParams: Promise.resolve({
      storeId: "store-b",
      offeringId: "offering",
      serviceCommerceSheet: "booking",
    }),
  })
  expect(
    reads.find((read) => read.path === "serviceCommerce.bookingConfiguration")
      ?.input,
  ).toEqual({ storeId: "store-b", offeringId: "offering" })
  expect(
    reads.find((read) => read.path === "serviceAccess.requests")?.input,
  ).toEqual({ storeId: "store-b", limit: 100 })
})

test("unpermitted Store URLs retain the existing permitted fallback", async () => {
  release()
  await Receipts({ searchParams: Promise.resolve({ storeId: "foreign" }) })
  expect(reads[0]?.input).toEqual({ storeId: "store-a" })
})
