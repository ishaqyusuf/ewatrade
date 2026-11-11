import {
  firstOrderCatalogStepSub,
  greenTillHomeStage,
  homeAskQuestions,
  homeMoney,
  orderPaymentPill,
  recordAvatar,
} from "../../apps/mobile/src/components/mobile/dashboard/green-till-home-model"
import { GREEN_TILL_THEME } from "../../apps/mobile/src/lib/green-till-theme"
import {
  type RetailOpsPlanId,
  getPlan,
} from "../../apps/mobile/src/lib/retail-ops-subscription"

type Workspace = Parameters<typeof greenTillHomeStage>[0]
type Order = Parameters<typeof orderPaymentPill>[0] & {
  name?: string
  phone?: string
  totalMinor: number
  meta: string
}

const orders: [Order, Order, Order, Order] = [
  {
    name: "Tomi Bello",
    meta: "#1047 · 2 × Canvas tote · 09:20",
    totalMinor: 3200000,
    amountPaidMinor: 3200000,
    balanceDueMinor: 0,
    status: "COMPLETED",
  },
  {
    name: "Deji Cole",
    meta: "#1046 · 1 × Storage basket · 09:04",
    totalMinor: 2450000,
    amountPaidMinor: 0,
    balanceDueMinor: 2450000,
    status: "CONFIRMED",
  },
  {
    meta: "#1045 · 1 × Canvas tote · 08:48",
    totalMinor: 1850000,
    amountPaidMinor: 1000000,
    balanceDueMinor: 850000,
    status: "COMPLETED",
  },
  {
    name: "Sola Danjuma",
    meta: "#1044 · 4 × Cotton towel · 08:32",
    totalMinor: 7100000,
    amountPaidMinor: 7100000,
    balanceDueMinor: 0,
    status: "COMPLETED",
  },
]

const historicalOrders: Order[] = [
  { ...orders[0], paymentStatus: "REFUNDED" },
  { ...orders[1], status: "CANCELLED" },
  { ...orders[2], status: "DRAFT" },
  { ...orders[3], name: undefined, phone: "+234 800 000 0123" },
]

type HomeFixture = Workspace & {
  offline: boolean
  role: "OWNER" | "ADMIN" | "MANAGER"
  assistant: boolean
  setupAssistant: boolean
  sales: "ready" | "loading" | "unavailable" | "cached" | "zero" | "partial"
  recent: "loaded" | "loading" | "unavailable" | "empty"
  orders: Order[]
  pending: number
  attention: "unpaid" | "all" | "none"
  payments: boolean
  team: "hidden" | "invite" | "saving" | "error"
  tenant: "ready" | "loading" | "unavailable"
  plan: RetailOpsPlanId
  preview: "loaded" | "empty" | "loading" | "unavailable"
  businesses: "one" | "multiple" | "unavailable"
  shareError: boolean
  staffReview: boolean
  personal: boolean
  catalogLoaded: boolean
}

const baseline: HomeFixture = {
  workspace: "available",
  catalog: "ready",
  hasOrderHistory: true,
  offline: false,
  role: "OWNER",
  assistant: true,
  setupAssistant: true,
  sales: "ready",
  recent: "loaded",
  orders,
  pending: 0,
  attention: "unpaid",
  payments: false,
  team: "hidden",
  tenant: "ready",
  plan: "free",
  preview: "loaded",
  businesses: "one",
  shareError: false,
  staffReview: false,
  personal: false,
  catalogLoaded: true,
}

const firstOrder: Partial<HomeFixture> = { hasOrderHistory: false }
const scenarios = {
  "Home & workspace": [
    ["everyday", "Everyday · Assistant enabled", {}],
    [
      "assistant-unavailable",
      "Everyday · Assistant unavailable",
      { assistant: false },
    ],
    ["manager", "Manager · Store sharing hidden", { role: "MANAGER" }],
    ["admin", "Admin", { role: "ADMIN" }],
    ["workspace-loading", "Workspace loading", { workspace: "loading" }],
    [
      "workspace-unavailable",
      "Workspace unavailable",
      { workspace: "unavailable" },
    ],
    [
      "offline",
      "Offline · Cached workspace",
      { workspace: "cached", offline: true, sales: "cached", pending: 2 },
    ],
    [
      "offline-empty",
      "Offline · No cached orders or totals",
      {
        workspace: "cached",
        offline: true,
        sales: "unavailable",
        recent: "empty",
        tenant: "unavailable",
      },
    ],
    [
      "offline-unknown",
      "Offline · Workspace not cached",
      { workspace: "offline-unknown", offline: true },
    ],
  ],
  Setup: [
    [
      "setup",
      "New business · Empty catalog",
      { ...firstOrder, catalog: "empty", preview: "empty" },
    ],
    [
      "setup-unfinished",
      "New business · Unfinished catalog",
      { ...firstOrder, catalog: "unfinished", setupAssistant: false },
    ],
    ["first-order", "Ready for first order · Catalog loaded", firstOrder],
    [
      "first-order-no-catalog",
      "Ready for first order · Catalog unavailable",
      { ...firstOrder, catalogLoaded: false },
    ],
  ],
  "Sales & recent orders": [
    [
      "orders-history",
      "Cancelled, refunded and draft orders",
      { orders: historicalOrders },
    ],
    [
      "orders-empty",
      "Recent orders empty · Existing business",
      { recent: "empty" },
    ],
    ["orders-loading", "Recent orders loading", { recent: "loading" }],
    [
      "orders-unavailable",
      "Recent orders unavailable",
      { recent: "unavailable" },
    ],
    ["sales-loading", "Today’s sales loading", { sales: "loading" }],
    [
      "sales-unavailable",
      "Today’s sales unavailable",
      { sales: "unavailable" },
    ],
    ["zero-sales", "No sales today · Unpaid orders exist", { sales: "zero" }],
    [
      "no-attention",
      "No sales today · No items need attention",
      { sales: "zero", attention: "none" },
    ],
    ["partial-sales", "Partial sales totals", { sales: "partial" }],
    ["sync-waiting", "Online · Changes waiting to sync", { pending: 2 }],
    [
      "attention-all",
      "Approvals, unpaid orders and deliveries",
      { attention: "all" },
    ],
    ["payments", "Payments to check", { payments: true }],
  ],
  "Team & Store sharing": [
    ["team-invite", "Invite your team", { team: "invite" }],
    ["team-saving", "Team preference saving", { team: "saving" }],
    ["team-error", "Team preference error", { team: "error" }],
    ["staff-review", "Staff rules review", { staffReview: true }],
    ["personal", "Personal conversations available", { personal: true }],
    [
      "paid-store",
      "Store sharing · Full catalog",
      { plan: "starter", businesses: "multiple" },
    ],
    ["store-loading", "Store link loading", { tenant: "loading" }],
    ["store-unavailable", "Store link unavailable", { tenant: "unavailable" }],
    ["store-items-loading", "Store items loading", { preview: "loading" }],
    [
      "store-items-unavailable",
      "Store items unavailable",
      { preview: "unavailable" },
    ],
    [
      "store-businesses-unavailable",
      "Other businesses unavailable",
      { businesses: "unavailable" },
    ],
    ["store-share-error", "Store sharing failed", { shareError: true }],
  ],
} satisfies Record<string, [string, string, Partial<HomeFixture>][]>

const fixtureById = new Map(
  Object.values(scenarios)
    .flat()
    .map(([id, , fixture]) => [id, fixture]),
)

export function homeFixture(id: string) {
  const fixture = { ...baseline, ...fixtureById.get(id) }
  const stage = greenTillHomeStage(fixture)
  const soldToday =
    fixture.sales === "zero" ||
    fixture.sales === "loading" ||
    fixture.sales === "unavailable"
      ? 0
      : 4
  const unpaidOrders = fixture.attention === "none" ? 0 : 1
  return {
    ...fixture,
    stage,
    soldToday,
    sharePlan: getPlan(fixture.plan),
    catalogStep: firstOrderCatalogStepSub(
      fixture.catalogLoaded ? 3 : undefined,
    ),
    questions:
      fixture.assistant && !fixture.offline
        ? homeAskQuestions({ soldToday, unpaidOrders })
        : null,
    rows:
      fixture.recent === "loaded"
        ? fixture.orders.slice(0, 4).map((order, index) => {
            const customer = order.name || order.phone || "Walk-in customer"
            return {
              customer,
              avatar: recordAvatar(customer, index),
              pill: orderPaymentPill(order),
              amount: homeMoney(order.totalMinor, "NGN"),
              meta: order.meta,
            }
          })
        : [],
  }
}

if (typeof window !== "undefined") {
  Object.assign(window, {
    MOBILE_HOME_MODEL: { homeFixture, scenarios, palette: GREEN_TILL_THEME },
  })
}
