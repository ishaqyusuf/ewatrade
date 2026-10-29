import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { DOMImplementation } from "@xmldom/xmldom"
import * as nuqs from "nuqs"
import { createLoader } from "nuqs/server"
import type { ComponentType, ReactNode } from "react"
import { Suspense, act, lazy, useEffect, useState } from "react"

const document = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const window = {
  document,
  HTMLIFrameElement: class {},
  HTMLElement: class {},
  addEventListener() {},
  removeEventListener() {},
}
Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true })
Object.assign(document, {
  defaultView: window,
  addEventListener() {},
  removeEventListener() {},
})
const createElement = document.createElement.bind(document)
document.createElement = (name: string) =>
  Object.assign(createElement(name), {
    style: {},
    addEventListener() {},
    removeEventListener() {},
  })
const createText = document.createTextNode.bind(document)
document.createTextNode = (value: string) => {
  const node = createText(value)
  Object.defineProperty(node, "nodeValue", {
    get: () => node.data,
    set: (next: string) => {
      node.data = next
    },
  })
  return node
}
const { createRoot } = await import("react-dom/client")
let params = new URLSearchParams()
let pathname = "/activity"
let ownedJob: { jobId: string } | null = null
mock.module("nuqs", () => ({
  ...nuqs,
  useQueryStates: (parsers: Parameters<typeof createLoader>[0]) => [
    createLoader(parsers)(params),
    async () => {},
  ],
}))
mock.module("next/navigation", () => ({ usePathname: () => pathname }))
mock.module("@/hooks/use-assistant-draft-job-handoff", () => ({
  useAssistantDraftJobOverlay: () => ownedJob,
}))
mock.module("@ewatrade/ui", () => ({ Button: () => null }))
mock.module("@/observability/sentry", () => ({ captureDashboardError() {} }))
mock.module("@/components/catalog-item/catalog-appearance", () => ({
  CatalogAppearance: ({ children }: { children: ReactNode }) => children,
}))
mock.module("next/dynamic", () => ({
  default: (
    load: () => Promise<ComponentType>,
    options: { loading: ComponentType },
  ) => {
    const Loaded = lazy(async () => {
      const Component = await load()
      imported.push(Component.displayName ?? "unnamed")
      if (Component.displayName === heldName)
        await new Promise<void>((resolve) => {
          release = resolve
        })
      return { default: Component }
    })
    return function Deferred(props: object) {
      return (
        <Suspense fallback={<options.loading />}>
          <Loaded {...props} />
        </Suspense>
      )
    }
  },
}))
const imported: string[] = []
let heldName: string | null = null
let release: (() => void) | undefined
let nextInstance = 0
const instances = new Map<
  string,
  {
    id: number
    draft: string
    setDraft: (value: string) => void
    props: object
  }
>()
const mounted: string[] = []
function feature(name: string) {
  function Feature(props: object) {
    const [id] = useState(() => ++nextInstance)
    const [draft, setDraft] = useState("")
    instances.set(name, { id, draft, setDraft, props })
    useEffect(() => {
      mounted.push(name)
      return () => {
        if (instances.get(name)?.id === id) instances.delete(name)
      }
    }, [id, name])
    return <output>{name}</output>
  }
  return Object.assign(Feature, { displayName: name })
}
mock.module("@/components/catalog-item/catalog-item-detail-modal", () => ({
  CatalogItemDetailModal: feature("CatalogItemDetailModal"),
}))
mock.module("@/components/catalog-item/catalog-item-sheet", () => ({
  CatalogItemSheet: feature("CatalogItemSheet"),
}))
mock.module("./customer-request-sheet", () => ({
  CustomerRequestSheet: feature("CustomerRequestSheet"),
}))
mock.module("./service-intake-receipt-sheet", () => ({
  ServiceIntakeReceiptSheet: feature("ServiceIntakeReceiptSheet"),
}))
mock.module("./service-intake-sheet", () => ({
  ServiceIntakeSheet: feature("ServiceIntakeSheet"),
}))
mock.module("./service-job-sheet", () => ({
  ServiceJobSheet: feature("ServiceJobSheet"),
}))
mock.module("./service-work-original-sheet", () => ({
  ServiceWorkOriginalSheet: feature("ServiceWorkOriginalSheet"),
}))
mock.module(
  "@/components/notification-center/business-notification-settings",
  () => ({
    BusinessNotificationPreferencesSheet: feature(
      "BusinessNotificationPreferencesSheet",
    ),
  }),
)
mock.module("./activity-sheet", () => ({
  ActivitySheet: feature("ActivitySheet"),
}))
mock.module("./assistant-booking-sheet", () => ({
  AssistantBookingSheet: feature("AssistantBookingSheet"),
}))
mock.module("./assistant-cash-count-sheet", () => ({
  AssistantCashCountSheet: feature("AssistantCashCountSheet"),
}))
mock.module("./assistant-day-close-sheet", () => ({
  AssistantDayCloseSheet: feature("AssistantDayCloseSheet"),
}))
mock.module("./assistant-manual-message-sheet", () => ({
  AssistantManualMessageSheet: feature("AssistantManualMessageSheet"),
}))
mock.module("./assistant-quote-approval-sheet", () => ({
  AssistantQuoteApprovalSheet: feature("AssistantQuoteApprovalSheet"),
}))
mock.module("./assistant-service-request-sheet", () => ({
  AssistantServiceRequestSheet: feature("AssistantServiceRequestSheet"),
}))
mock.module("./business-report-sheet", () => ({
  BusinessReportSheet: feature("BusinessReportSheet"),
}))
mock.module("./closeout-sheet", () => ({
  CloseoutSheet: feature("CloseoutSheet"),
}))
mock.module("./customer-details-sheet", () => ({
  CustomerDetailsSheet: feature("CustomerDetailsSheet"),
}))
mock.module("./customer-ledger-sheet", () => ({
  CustomerLedgerSheet: feature("CustomerLedgerSheet"),
}))
mock.module("./customer-message-sheet", () => ({
  CustomerMessageSheet: feature("CustomerMessageSheet"),
}))
mock.module("./domain-sheet", () => ({ DomainSheet: feature("DomainSheet") }))
mock.module("./finance-movement-details-sheet", () => ({
  FinanceMovementDetailsSheet: feature("FinanceMovementDetailsSheet"),
}))
mock.module("./finance-sheet", () => ({
  FinanceSheet: feature("FinanceSheet"),
}))
mock.module("./inventory-operation-details-sheet", () => ({
  InventoryOperationDetailsSheet: feature("InventoryOperationDetailsSheet"),
}))
mock.module("./order-details-sheet", () => ({
  OrderDetailsSheet: feature("OrderDetailsSheet"),
}))
mock.module("./prescription-request-sheet", () => ({
  PrescriptionRequestSheet: feature("PrescriptionRequestSheet"),
}))
mock.module("./purchase-bill-details-sheet", () => ({
  PurchaseBillDetailsSheet: feature("PurchaseBillDetailsSheet"),
}))
mock.module("./purchase-registration-details-sheet", () => ({
  PurchaseRegistrationDetailsSheet: feature("PurchaseRegistrationDetailsSheet"),
}))
mock.module("./receipt-sheet", () => ({
  ReceiptSheet: feature("ReceiptSheet"),
}))
mock.module("./service-commerce-sheet", () => ({
  ServiceCommerceSheet: feature("ServiceCommerceSheet"),
}))
mock.module("./staff-access-sheet", () => ({
  StaffAccessSheet: feature("StaffAccessSheet"),
}))
mock.module("./staff-activity-sheet", () => ({
  StaffActivitySheet: feature("StaffActivitySheet"),
}))
mock.module("./staff-directory-sheet", () => ({
  StaffDirectorySheet: feature("StaffDirectorySheet"),
}))
mock.module("./staff-history-sheet", () => ({
  StaffHistorySheet: feature("StaffHistorySheet"),
}))
mock.module("./staff-invitation-sheet", () => ({
  StaffInvitationSheet: feature("StaffInvitationSheet"),
}))
mock.module("./staff-member-sheet", () => ({
  StaffMemberSheet: feature("StaffMemberSheet"),
}))
mock.module("./staff-status-sheet", () => ({
  StaffStatusSheet: feature("StaffStatusSheet"),
}))
mock.module("./stock-count-sheet", () => ({
  StockCountSheet: feature("StockCountSheet"),
}))
mock.module("./stock-transfer-details-sheet", () => ({
  StockTransferDetailsSheet: feature("StockTransferDetailsSheet"),
}))
mock.module("./store-conversation-sheet", () => ({
  StoreConversationSheet: feature("StoreConversationSheet"),
}))
mock.module("./store-settings-sheet", () => ({
  StoreSettingsSheet: feature("StoreSettingsSheet"),
}))
const { GlobalSheets } = await import("./global-sheets")
const access = {
  serviceJobs: true,
  manageServiceJobs: true,
  serviceIntake: true,
  domains: true,
  staffHistory: true,
  staffDirectory: true,
  sales: true,
  ordersPage: true,
  catalog: true,
  catalogReadAccessKey: "inert-access",
  scopedStaff: false,
  finance: true,
  prescriptions: true,
  managePrescriptionSetup: true,
}
const props = {
  actorUserId: "actor",
  tenantId: "tenant",
  access,
  store: {
    id: "store",
    name: "Inert Store",
    currencyCode: "NGN",
    businessProfileKey: null,
  },
  storeIds: ["store"],
  timeZone: "UTC",
}
let root: ReturnType<typeof createRoot> | undefined
let container: ReturnType<typeof document.createElement>
async function render(overrides: Partial<typeof props> = {}) {
  if (!root) {
    container = document.createElement("div")
    root = createRoot(container as unknown as HTMLElement)
  }
  await act(async () => {
    root?.render(
      <Suspense fallback={null}>
        <GlobalSheets {...props} {...overrides} />
      </Suspense>,
    )
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
}
beforeEach(() => {
  params = new URLSearchParams()
  pathname = "/activity"
  ownedJob = null
  mounted.length = 0
  instances.clear()
  imported.length = 0
  heldName = null
  release = undefined
})
afterEach(async () => {
  release?.()
  await act(async () => root?.unmount())
  root = undefined
})
test("ordinary navigation never mounts an unopened sheet family", async () => {
  await render()
  expect(mounted).toEqual([])
  expect(instances.size).toBe(0)
  expect(imported).toEqual([])
})

test("pending requested code shows feedback that clears when its intent closes", async () => {
  heldName = "ReceiptSheet"
  params = new URLSearchParams({ receiptIds: "inert" })
  await render()
  expect(container.textContent).toContain("Opening…")
  expect(instances.size).toBe(0)
  params = new URLSearchParams()
  await render()
  expect(container.textContent).not.toContain("Opening…")
  await act(async () => {
    release?.()
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
})

test("a chunk completing after a scope change cannot mount the previous owner's controller", async () => {
  heldName = "FinanceSheet"
  params = new URLSearchParams({ financeSheet: "expense" })
  await render()
  expect(container.textContent).toContain("Opening…")
  params = new URLSearchParams()
  await render({ actorUserId: "other" })
  await act(async () => {
    release?.()
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
  expect(instances.size).toBe(0)
  expect(mounted).toEqual([])
})

test("a recorded-order message offer activates its existing controller without opening a message", async () => {
  params = new URLSearchParams({ messageOffer: "inert-order" })
  await render()
  expect([...instances.keys()]).toEqual(["CustomerMessageSheet"])
})
const cases: [string, Record<string, string>][] = [
  ["CatalogItemDetailModal", { catalogDetail: "inert" }],
  ["CatalogItemSheet", { catalogItem: "create" }],
  [
    "CustomerRequestSheet",
    { serviceSheet: "customer_request", requestId: "inert" },
  ],
  ["ServiceIntakeReceiptSheet", { serviceIntake: "inert" }],
  ["ServiceIntakeSheet", { serviceSheet: "intake" }],
  ["ServiceJobSheet", { serviceSheet: "job", jobId: "inert" }],
  ["ServiceWorkOriginalSheet", { assistantWorkOriginal: "inert" }],
  ["BusinessNotificationPreferencesSheet", { alertPreferences: "true" }],
  ["ActivitySheet", { activityEvent: "inert" }],
  ["AssistantBookingSheet", { assistantBooking: "inert" }],
  ["AssistantCashCountSheet", { assistantCashCount: "inert" }],
  ["AssistantDayCloseSheet", { assistantDayCloseBook: "inert" }],
  ["AssistantManualMessageSheet", { assistantManualMessage: "inert" }],
  ["AssistantQuoteApprovalSheet", { assistantQuoteApproval: "inert" }],
  ["AssistantServiceRequestSheet", { assistantServiceRequest: "inert" }],
  ["BusinessReportSheet", { businessReport: "inert" }],
  ["CloseoutSheet", { inventoryCloseout: "inert" }],
  ["CustomerDetailsSheet", { customerDetail: "inert" }],
  ["CustomerLedgerSheet", { ledgerAccount: "inert", ledgerAction: "entry" }],
  ["CustomerMessageSheet", { messageSheet: "compose-all" }],
  ["DomainSheet", { domainMode: "details" }],
  ["FinanceMovementDetailsSheet", { financeMovement: "inert" }],
  ["FinanceSheet", { financeSheet: "expense" }],
  ["InventoryOperationDetailsSheet", { inventoryOperation: "inert" }],
  ["OrderDetailsSheet", { orderSheet: "details", orderId: "inert" }],
  ["PrescriptionRequestSheet", { prescriptionSheet: "details" }],
  ["PurchaseBillDetailsSheet", { purchaseBill: "inert" }],
  ["PurchaseRegistrationDetailsSheet", { purchaseRegistration: "inert" }],
  ["ReceiptSheet", { receiptIds: "inert" }],
  ["ServiceCommerceSheet", { serviceCommerceSheet: "intake" }],
  ["StaffAccessSheet", { staffAccessEvent: "inert" }],
  ["StaffActivitySheet", { staffActivity: "inert" }],
  ["StaffDirectorySheet", { staffDirectory: "inert" }],
  ["StaffHistorySheet", { staffHistory: "inert" }],
  ["StaffInvitationSheet", { staffInvitation: "inert" }],
  ["StaffMemberSheet", { staffMember: "inert" }],
  ["StaffStatusSheet", { staffStatusEvent: "inert" }],
  ["StockCountSheet", { inventoryCount: "inert" }],
  ["StockTransferDetailsSheet", { stockTransfer: "inert" }],
  [
    "StoreConversationSheet",
    { conversationId: "inert", conversationSheet: "detail" },
  ],
  ["StoreSettingsSheet", { storeSettings: "inert" }],
]
for (const [name, values] of cases) {
  test(`typed deep link activates only ${name}`, async () => {
    params = new URLSearchParams(values)
    await render()
    expect([...instances.keys()]).toEqual([name])
    expect(mounted).toEqual([name])
  })
}
test("invalid modes, missing paired IDs and stock-entry form modes never activate details", async () => {
  params = new URLSearchParams({
    catalogItem: "bogus",
    domainMode: "bogus",
    financeSheet: "bogus",
    serviceSheet: "job",
    orderSheet: "details",
    conversationSheet: "detail",
    messageSheet: "order",
    prescriptionSheet: "bogus",
    serviceCommerceSheet: "bogus",
    inventoryOperation: "adjustment",
    ledgerAction: "entry",
    activityEvent: "  ",
  })
  await render()
  expect(mounted).toEqual([])
})
test("close and reopen retain the activated controller and its draft within one scope", async () => {
  params = new URLSearchParams({ orderSheet: "details", orderId: "inert" })
  await render()
  const before = instances.get("OrderDetailsSheet")
  expect(before).toBeDefined()
  await act(async () => before?.setDraft("kept"))
  params = new URLSearchParams()
  await render()
  expect(instances.get("OrderDetailsSheet")?.id).toBe(before?.id)
  expect(instances.get("OrderDetailsSheet")?.draft).toBe("kept")
  params = new URLSearchParams({ orderSheet: "details", orderId: "another" })
  await render()
  expect(mounted).toEqual(["OrderDetailsSheet"])
  expect(instances.get("OrderDetailsSheet")?.id).toBe(before?.id)
})
test("scope changes remove activated closed controllers", async () => {
  params = new URLSearchParams({ financeSheet: "expense" })
  await render()
  params = new URLSearchParams()
  await render({ actorUserId: "other" })
  expect(instances.size).toBe(0)
  await render({ tenantId: "other" })
  expect(instances.size).toBe(0)
  await render({ store: { ...props.store, id: "other" } })
  expect(instances.size).toBe(0)
})

test("Catalog's current access fingerprint still remounts its private reader", async () => {
  params = new URLSearchParams({ catalogDetail: "inert" })
  await render({ access: { ...access, catalog: false } })
  const before = instances.get("CatalogItemDetailModal")
  expect(before?.props).toMatchObject({
    readOnly: true,
    accessKey: "inert-access",
  })
  await render({ access: { ...access, catalogReadAccessKey: "new-access" } })
  expect(instances.get("CatalogItemDetailModal")?.id).not.toBe(before?.id)
  expect(instances.get("CatalogItemDetailModal")?.props).toMatchObject({
    readOnly: false,
    accessKey: "new-access",
  })
})

test("scoped staff retain Domain and Service Commerce factory exclusions", async () => {
  params = new URLSearchParams({
    domainMode: "details",
    serviceCommerceSheet: "intake",
    conversationSheet: "detail",
    conversationId: "inert",
  })
  await render({ access: { ...access, scopedStaff: true } })
  expect(instances.size).toBe(0)
})

test("malformed original targets still load their existing refusal owner", async () => {
  params = new URLSearchParams({
    assistantQuoteApproval: "",
    staffHistory: "",
    serviceIntake: "",
  })
  await render()
  expect([...instances.keys()].sort()).toEqual([
    "AssistantQuoteApprovalSheet",
    "ServiceIntakeReceiptSheet",
    "StaffHistorySheet",
  ])
})
test("fresh access removal unmounts a previously activated feature", async () => {
  params = new URLSearchParams({ financeSheet: "expense" })
  await render()
  await render({ access: { ...access, finance: false } })
  expect(instances.size).toBe(0)
  await render()
  expect(mounted).toEqual(["FinanceSheet", "FinanceSheet"])
})
test("Catalog and Services retain their route-owned exclusion", async () => {
  params = new URLSearchParams({
    catalogItem: "create",
    serviceSheet: "job",
    jobId: "inert",
  })
  pathname = "/catalog"
  await render()
  expect([...instances.keys()]).toEqual(["ServiceJobSheet"])
  pathname = "/services"
  await render()
  expect([...instances.keys()]).toEqual(["CatalogItemSheet"])
})
test("owned assistant Job can activate after factory access loss; unrelated Job cannot", async () => {
  const denied = {
    ...access,
    serviceIntake: false,
    serviceJobs: false,
    manageServiceJobs: false,
  }
  params = new URLSearchParams({ serviceSheet: "job", jobId: "inert" })
  await render({ access: denied })
  expect(instances.size).toBe(0)
  ownedJob = { jobId: "inert" }
  await render({ access: denied })
  expect([...instances.keys()]).toEqual(["ServiceJobSheet"])
  expect(instances.get("ServiceJobSheet")?.props).toMatchObject({
    nativeAccessAvailable: false,
    scope: { actorUserId: "actor", tenantId: "tenant", storeId: "store" },
  })
})
