import { expect, mock, test } from "bun:test"
import type { ServiceBookingTarget } from "@ewatrade/assistant/general/booking-read"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
// Actual consumer, target schema and mount-owned freshness guards; native and
// query stand-ins. No database, server, device or provider request is made.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/text", { Text: children })
standIn("components/ui/view", { View: children })
standIn("components/mobile/green-till/kit", { ListCard: children })
mock.module("react-native", () => ({ ScrollView: children }))
const buttons = new Map<string, () => void>()
standIn("components/mobile/action-button", {
  ActionButton: ({
    children,
    onPress,
  }: { children: ReactNode; onPress: () => void }) => {
    buttons.set(String(children), onPress)
    return <button type="button">{children}</button>
  },
})
const routes: unknown[] = []
mock.module("expo-router", () => ({
  useRouter: () => ({ push: (route: unknown) => routes.push(route) }),
}))
let profile = {
  id: "actor",
  businessId: "business",
  storeId: "store",
  role: "OPERATOR",
  staffAccessMode: "SCOPED",
  catalogEditor: false,
  status: "ACTIVE" as string | undefined,
}
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
const context = {
  actorUserId: "actor",
  tenant: { id: "business" },
  activeStore: { id: "store" },
}
const target: ServiceBookingTarget = {
  kind: "service_booking",
  bookingId: "private-booking",
  sourceId: "private-source",
  offeringId: "private-offering",
}
const booking = {
  id: target.bookingId,
  sourceId: target.sourceId,
  offeringId: target.offeringId,
  quoteId: "PRIVATE_QUOTE",
  quoteVersionId: "PRIVATE_VERSION",
  commercialOrderId: "canonical-order",
  status: "confirmed",
  revision: 4,
  startAt: "2026-10-16T08:00:00.000Z",
  endAt: "2026-10-16T09:00:00.000Z",
  timezone: "Africa/Lagos",
  reservedCapacity: 2,
  resource: {
    id: "PRIVATE_RESOURCE",
    label: "Current Laundry Bench",
    kind: "station",
    status: "active",
    currentCapacity: 5,
    currentRevision: 8,
  },
  configuration: {
    id: "PRIVATE_CONFIG",
    currentStatus: "active",
    currentRevision: 9,
    bookedRevision: 3,
  },
  payment: {
    storedStatus: "awaiting_payment",
    requirement: "deposit",
    depositMinor: 500,
    payableMinor: 2500,
    requiredMinor: 500,
    currencyCode: "NGN",
    policyRevision: 6,
    currentOrder: {
      id: "canonical-order",
      orderNumber: "ORD-081",
      status: "confirmed",
      currencyCode: "NGN",
      totalMinor: 3000,
      recordedAmountPaidMinor: 1000,
      storedPaymentStatus: "partially_paid",
    },
    providerSettlement: "not_checked",
    publicToken: "NEVER_RENDER",
  },
  cancellationPolicy: {
    windowMinutesBeforeStart: 60,
    refundPolicy: "manual_review",
    revision: 2,
  },
  milestones: {
    confirmedAt: "2026-10-15T11:00:00.000Z",
    arrivedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    noShowAt: null,
  },
  capacityAssessment: "not_checked",
  privateField: "NEVER_RENDER",
  publicCapabilityToken: "NEVER_RENDER",
}
const calls: { name: string; input: unknown; enabled?: boolean }[] = []
const queryKeys: unknown[] = []
function procedure(name: string) {
  return {
    queryOptions: (input: unknown, options: object) => {
      calls.push({ name, input, ...options })
      return {
        queryKey: [name, input],
        queryFn: async () => {
          throw Error("No request permitted")
        },
        ...options,
      }
    },
  }
}
standIn("trpc/client", {
  useTRPC: () => ({
    tenant: { current: procedure("context") },
    serviceCommerce: { assistantBookingDetail: procedure("booking") },
  }),
})
let refreshes: string[] = []
function ready(data: unknown, name: string) {
  return {
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data,
    refetch: async () => {
      refreshes.push(name)
      return { isSuccess: true, data }
    },
  }
}
let contextQuery = ready(context, "context")
let bookingQuery = ready(booking, "booking")
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[] }) => {
    queryKeys.push(options.queryKey)
    return options.queryKey[0] === "context" ? contextQuery : bookingQuery
  },
}))
const { NativeBookingOriginalScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-booking-original-screen"
)
function render(value = target) {
  buttons.clear()
  return renderToStaticMarkup(
    createElement(NativeBookingOriginalScreen, { target: value }),
  )
}
function reset() {
  profile = {
    id: "actor",
    businessId: "business",
    storeId: "store",
    role: "OPERATOR",
    staffAccessMode: "SCOPED",
    catalogEditor: false,
    status: "ACTIVE",
  }
  contextQuery = ready(context, "context")
  bookingQuery = ready(booking, "booking")
  calls.length = 0
  routes.length = 0
  refreshes = []
}
test("only pure protected current scope and exact booking/source/Offering reads are used", () => {
  reset()
  const html = render()
  expect(calls.map((call) => call.name)).toEqual(["context", "booking"])
  expect(calls.at(-1)?.input).toEqual({
    bookingId: target.bookingId,
    sourceId: target.sourceId,
    offeringId: target.offeringId,
  })
  expect(calls.at(-1)?.enabled).toBe(true)
  expect(html).toContain("Saved booking")
  expect(html).not.toContain("private-booking")
  expect(html).not.toContain("private-source")
  expect(html).not.toContain("private-offering")
})
test("saved timing/timezone/capacity/status revisions are separated from current configuration", () => {
  reset()
  const html = render()
  for (const text of [
    "Stored booking status",
    "confirmed",
    "Saved revision",
    "2026-10-16T08:00:00.000Z",
    "2026-10-16T09:00:00.000Z",
    "Africa/Lagos",
    "Reserved capacity",
    "Current Laundry Bench",
    "Current configured resource capacity",
    "Current resource revision",
    "Configuration revision at booking",
    "Current configuration revision",
    "not a count of available slots",
    "Remaining capacity was not checked",
  ])
    expect(html).toContain(text)
})
test("stored booking payment policy remains distinct from current Order and no provider settlement or refund eligibility is claimed", () => {
  reset()
  const html = render()
  for (const text of [
    "Saved payment policy",
    "awaiting payment",
    "Saved payment requirement",
    "deposit",
    "₦25.00",
    "₦5.00",
    "Current original Order",
    "ORD-081",
    "partially paid",
    "₦30.00",
    "₦10.00",
    "Provider settlement was not checked",
    "Saved cancellation terms",
    "manual review",
    "do not establish current refund eligibility",
  ])
    expect(html).toContain(text)
})
test("current Order link uses only exact canonical response linkage", () => {
  reset()
  render()
  buttons.get("Open current Order")?.()
  expect(routes).toEqual([
    { pathname: "/order/[orderId]", params: { orderId: "canonical-order" } },
  ])
  expect([...buttons.keys()]).toEqual([
    "Open current Order",
    "Refresh original booking",
  ])
})
test("absent Order is not interpreted as a zero balance or paid outcome; no guessed Order navigation", () => {
  reset()
  bookingQuery = ready(
    {
      ...booking,
      commercialOrderId: null,
      payment: { ...booking.payment, currentOrder: null },
    },
    "booking",
  )
  const html = render()
  expect(html).toContain("No current Order is linked")
  expect(html).toContain("does not establish a zero balance or paid outcome")
  expect(buttons.has("Open current Order")).toBe(false)
})
test("malformed current Order linkage withholds that Order facts and navigation", () => {
  reset()
  bookingQuery = ready(
    {
      ...booking,
      payment: {
        ...booking.payment,
        currentOrder: {
          ...booking.payment.currentOrder,
          id: "foreign",
          orderNumber: "PRIVATE_FOREIGN_ORDER",
        },
      },
    },
    "booking",
  )
  const html = render()
  expect(html).toContain("current linked Order is unavailable")
  expect(html).not.toContain("PRIVATE_FOREIGN_ORDER")
  expect(buttons.has("Open current Order")).toBe(false)
})
test("milestones remain explicit UTC recorded facts, including missing times", () => {
  reset()
  bookingQuery = ready(
    {
      ...booking,
      milestones: {
        ...booking.milestones,
        arrivedAt: "2026-10-16T08:10:00.000Z",
        startedAt: "2026-10-16T08:12:00.000Z",
        completedAt: "2026-10-16T08:50:00.000Z",
      },
    },
    "booking",
  )
  const html = render()
  for (const text of [
    "Recorded milestones (UTC)",
    "2026-10-15T11:00:00.000Z",
    "2026-10-16T08:10:00.000Z",
    "2026-10-16T08:12:00.000Z",
    "2026-10-16T08:50:00.000Z",
    "No-show recorded",
    "Not recorded",
  ])
    expect(html).toContain(text)
})
test("private JSON, identifiers and public capability tokens are never rendered", () => {
  reset()
  const html = render()
  for (const text of [
    "NEVER_RENDER",
    "PRIVATE_QUOTE",
    "PRIVATE_VERSION",
    "PRIVATE_RESOURCE",
    "PRIVATE_CONFIG",
    "publicCapabilityToken",
    "providerSettlement",
  ])
    expect(html).not.toContain(text)
  expect(html).toContain(
    "changes no booking, payment, refund, Order or public capability",
  )
})
test("each reopen uses distinct owned query cache keys", () => {
  reset()
  render()
  const previous = queryKeys.at(-1)
  render()
  expect(queryKeys.at(-1)).not.toEqual(previous)
})
test("cached/refetching/paused/denied/earlier-mount facts are hidden for both scope and booking", () => {
  for (const name of ["context", "booking"]) {
    for (const state of [
      { isFetching: true },
      { isPaused: true },
      { isError: true },
      { isFetchedAfterMount: false },
    ]) {
      reset()
      if (name === "context")
        contextQuery = { ...ready(context, "context"), ...state }
      else bookingQuery = { ...ready(booking, "booking"), ...state }
      const html = render()
      expect(html).not.toContain("ORD-081")
      expect(html).not.toContain("Current Laundry Bench")
      expect(html).not.toContain("2026-10-16T08:00:00.000Z")
      expect(buttons.has("Open current Order")).toBe(false)
    }
  }
})
test("wrong booking, source or Offering tuple refuses all saved facts", () => {
  for (const patch of [
    { id: "foreign" },
    { sourceId: "foreign" },
    { offeringId: "foreign" },
  ]) {
    reset()
    bookingQuery = ready({ ...booking, ...patch }, "booking")
    const html = render()
    expect(html).toContain("exact saved booking is unavailable")
    expect(html).not.toContain("Current Laundry Bench")
    expect(html).not.toContain("ORD-081")
  }
})
test("wrong current actor/business/Store disables the detail request and withholds all facts", () => {
  for (const patch of [
    { actorUserId: "foreign" },
    { tenant: { id: "foreign" } },
    { activeStore: { id: "foreign" } },
    { activeStore: null },
  ]) {
    reset()
    contextQuery = ready({ ...context, ...patch }, "context")
    const html = render()
    expect(calls.at(-1)?.enabled).toBe(false)
    expect(html).not.toContain("ORD-081")
    expect(html).not.toContain("Current Laundry Bench")
  }
})
test("canonical scoped roles remain server-authoritative; missing status may read but known inactive or missing scope creates no queries", () => {
  for (const role of ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "CASHIER"]) {
    reset()
    profile.role = role
    expect(render()).toContain("Saved booking")
  }
  reset()
  profile.status = undefined
  expect(render()).toContain("Saved booking")
  for (const patch of [
    { id: "" },
    { businessId: "" },
    { storeId: "" },
    { status: "SUSPENDED" },
    { status: "INVITED" },
  ]) {
    reset()
    profile = { ...profile, ...patch }
    expect(render()).toContain(
      "current business and Store access is unavailable",
    )
    expect(calls).toEqual([])
  }
})
test("null or invalid monetary values remain unavailable and never format invented precision", () => {
  for (const value of [
    null,
    Number.MAX_SAFE_INTEGER + 1,
    100.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
  ]) {
    reset()
    bookingQuery = ready(
      {
        ...booking,
        payment: {
          ...booking.payment,
          depositMinor: value,
          payableMinor: value,
          requiredMinor: value,
          currentOrder: {
            ...booking.payment.currentOrder,
            totalMinor: value,
            recordedAmountPaidMinor: value,
          },
        },
      },
      "booking",
    )
    const html = render()
    expect(html).toContain("Amount unavailable")
    expect(html).not.toContain("₦NaN")
    expect(html).not.toContain("₦∞")
    expect(html).not.toContain("₦1.01")
    expect(html).not.toContain("₦-0.01")
  }
})
test("authority or token injection in target is refused before protected reads", () => {
  reset()
  expect(render({ ...target, tenantId: "foreign" } as never)).toContain(
    "link or your current",
  )
  expect(calls).toEqual([])
})
test("Refresh and denied Retry recheck current scope before pure booking read", async () => {
  reset()
  render()
  buttons.get("Refresh original booking")?.()
  for (let i = 0; i < 4; i++) await Promise.resolve()
  expect(refreshes).toEqual(["context", "booking"])
  reset()
  bookingQuery = { ...ready(booking, "booking"), isError: true }
  render()
  buttons.get("Retry original booking")?.()
  for (let i = 0; i < 4; i++) await Promise.resolve()
  expect(refreshes).toEqual(["context", "booking"])
})
