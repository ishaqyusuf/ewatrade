import { expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { generalReceiptSchema } from "@ewatrade/assistant/general/contracts"
import { readGeneralSnapshot } from "@ewatrade/assistant/general/snapshot"
import { generalAnswerRoute, generalReceiptRoute } from "./general-model"
import {
  nativeEditorActions,
  nativeParityGaps,
  nativeReceiptKinds,
} from "./native-parity"
import { nativeStockActions } from "./native-stock-values"

const receipt = (kind: string) => {
  const base = {
    kind,
    recordId: "record-real",
    bookId: "book-real",
    orderId: "order-real",
    title: "Saved",
    detail: "Saved",
  }
  if (kind === "service_work")
    return generalReceiptSchema.parse({
      kind,
      recordId: "record-real",
      eventId: "event-real",
      eventType: "ASSIGNED",
      recordedAt: "2026-10-15T10:00:00Z",
      effectiveAt: "2026-10-15T10:00:00Z",
      title: "Saved",
      detail: "Saved",
    })
  if (kind === "service_work_note" || kind === "service_work_exception")
    return generalReceiptSchema.parse({
      kind,
      recordId: "record-real",
      jobId: "job-real",
      lineId: null,
      recordedAt: "2026-10-15T10:00:00Z",
      title: "Saved",
      detail: "Saved",
      ...(kind === "service_work_exception"
        ? {
            exceptionType: "QUALITY",
            outcome: "OPEN",
            occurredAt: "2026-10-15T09:00:00Z",
          }
        : {}),
    })
  if (kind === "commerce_quote_decision")
    return generalReceiptSchema.parse({
      kind,
      recordId: "record-real",
      quoteId: "quote-real",
      quoteVersionId: "version-real",
      decision: "approved",
      policyRevision: 1,
      decidedAt: "2026-10-15T10:00:00Z",
      decidedByMembershipId: "actor-real",
      reason: "Agreed",
      releaseState: "released",
      title: "Saved",
      detail: "Saved",
    })
  if (kind === "service_manual_message")
    return generalReceiptSchema.parse({
      kind,
      recordId: "record-real",
      orderId: "order-real",
      title: "Saved",
      detail: "Saved",
      jobId: "job-real",
      shareId: "share-real",
    })
  return generalReceiptSchema.parse(base)
}

test("every capability declaring mobile has a native editor and exact receipt object", () => {
  const declared = capabilityManifest.filter((entry) =>
    entry.clients.some((client) => client === "mobile"),
  )
  const gaps = nativeParityGaps(declared)
  expect(gaps).toEqual([])
  // The current native write set, so widening it is a reviewed change.
  expect(
    declared
      .flatMap((entry) => (entry.mode === "write" ? [entry.action] : []))
      .sort(),
  ).toEqual([...nativeEditorActions].sort())
})

test("receipt routes open only the exact native object", () => {
  for (const kind of nativeReceiptKinds)
    expect(generalReceiptRoute(receipt(kind), "record-real")).not.toBeNull()
  // A settings receipt for another Store has no exact native screen here.
  expect(
    generalReceiptRoute(receipt("store_reminder_settings"), "other-store"),
  ).toBeNull()
  expect(
    generalReceiptRoute(receipt("store_receipt_settings"), "record-real"),
  ).toEqual({ pathname: "/receipt-settings-modal", params: {} })
  expect(generalReceiptRoute(receipt("customer"))).toEqual({
    pathname: "/customer-ledger/[customerId]",
    params: { customerId: "record-real" },
  })
  // A payment without its stored Order link is unavailable, never guessed.
  expect(
    generalReceiptRoute({
      kind: "payment",
      recordId: "exact-payment-record",
      title: "Payment recorded",
      detail: "Saved",
    }),
  ).toBeNull()
  expect(generalReceiptRoute(receipt("payment"))).toEqual({
    pathname: "/order/[orderId]",
    params: { orderId: "order-real" },
  })
  // Stock receipts open their exact saved parent, not a related item or Order.
  for (const [kind, pathname, parameter] of [
    ["inventory", "/stock-operation/[operationId]", "operationId"],
    ["stock_count", "/stock-count/[stockCountId]", "stockCountId"],
    ["stock_transfer", "/stock-transfer/[transferId]", "transferId"],
    ["inventory_closeout", "/inventory-closeout/[closeoutId]", "closeoutId"],
  ] as const) {
    const route = generalReceiptRoute(receipt(kind))
    expect(route?.pathname).toBe(pathname)
    expect(route && Object.keys(route.params)).toEqual([parameter])
    expect(route && Reflect.get(route.params, parameter)).toBe("record-real")
  }
  // Kinds without a native screen never fall back to the Order screen.
  expect(generalReceiptRoute(receipt("finance_supplier"))).toBeNull()
})

test("dashboard-only write capabilities are reported as native gaps", () => {
  const gaps = new Map(
    nativeParityGaps(capabilityManifest).map((gap) => [gap.id, gap.missing]),
  )
  for (const action of nativeStockActions) {
    const capability = capabilityManifest.find(
      (entry) => entry.mode === "write" && entry.action === action,
    )
    expect(capability).toBeDefined()
    expect(capability?.clients).toContain("mobile")
    expect(capability && gaps.has(capability.id)).toBe(false)
  }
  expect(gaps.get("finance.supplier.opening")).toEqual(["editor", "receipt"])
  expect(gaps.has("sales.order.replace")).toBe(false)
  expect(gaps.has("customers.create")).toBe(false)
  expect(gaps.has("catalog.price.update")).toBe(false)
  expect(gaps.has("sales.order.cancel")).toBe(false)
})

test("saved actions another client owns stay visible after a reload", () => {
  const base = {
    conversation: { id: "conversation", title: "Saved chat" },
    messages: [],
    proposals: [],
    activeRunId: null,
    allowance: {
      remainingRequests: 4,
      remainingTokens: 400,
      resetsAt: "2026-11-01T00:00:00.000Z",
    },
    businessName: "Amina Stores",
    storeName: "Main",
    currencyCode: "NGN",
  }
  // Older cached snapshots have no field and still parse.
  expect(readGeneralSnapshot(base)?.unavailableProposals).toEqual([])
  expect(
    readGeneralSnapshot({
      ...base,
      unavailableProposals: [
        { id: "draft", status: "PENDING", reason: "client_unavailable" },
      ],
    })?.unavailableProposals,
  ).toEqual([{ id: "draft", status: "PENDING", reason: "client_unavailable" }])
  expect(
    readGeneralSnapshot({
      ...base,
      unavailableProposals: [
        { id: "draft", status: "PENDING", reason: "invented" },
      ],
    }),
  ).toBeNull()
})

test("shipped reads declare mobile support or a reviewed dashboard-only gap", () => {
  // Shipped reads answer without dashboard-only Open targets, so the native
  // card renders them; a new one must declare mobile or give a reason here.
  expect(
    capabilityManifest
      .filter(
        (entry) =>
          entry.mode === "read" &&
          entry.rollout !== "planned" &&
          !entry.clients.some((client) => client === "mobile"),
      )
      .map((entry) => entry.id),
    // Recorded Finance balances currently have dashboard-only acceptance.
  ).toEqual(["finance.money_account_balances.read"])
})

test("planned staff directory, member and history mobile declarations retain exact read targets", () => {
  for (const [id, target] of [
    [
      "staff.directory.read",
      {
        kind: "staff_directory",
        filters: {
          assignmentStoreId: "selected-store",
          cursor: "saved-cursor",
        },
      },
    ],
    [
      "staff.member.read",
      { kind: "staff_member", membershipId: "selected-member" },
    ],
    [
      "staff.history.read",
      {
        kind: "staff_history",
        filters: { membershipId: "selected-member", cursor: "saved-cursor" },
      },
    ],
  ] as const) {
    const capability = capabilityManifest.find((entry) => entry.id === id)
    expect(capability?.clients.some((client) => client === "mobile")).toBe(true)
    expect(capability?.rollout).toBe("planned")
    expect(generalAnswerRoute(target)).toEqual({
      pathname: "/staff-invite-modal",
      params: { target: JSON.stringify(target) },
    })
  }
})
