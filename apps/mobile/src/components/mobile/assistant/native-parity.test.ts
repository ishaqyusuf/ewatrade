import { expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type { GeneralReceipt } from "@ewatrade/assistant/general/contracts"
import { readGeneralSnapshot } from "@ewatrade/assistant/general/snapshot"
import { generalReceiptRoute } from "./general-model"
import {
  nativeEditorActions,
  nativeParityGaps,
  nativeReceiptKinds,
} from "./native-parity"

const receipt = (kind: string) =>
  ({
    kind,
    recordId: "record-real",
    bookId: "book-real",
    orderId: "order-real",
    title: "Saved",
    detail: "Saved",
  }) as GeneralReceipt

test("every capability declaring mobile has a native editor and exact receipt object", () => {
  const declared = capabilityManifest.filter((entry) =>
    entry.clients.includes("mobile"),
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
  // Kinds without a native screen never fall back to the Order screen.
  for (const kind of [
    "stock_count",
    "inventory",
    "stock_transfer",
    "inventory_closeout",
    "finance_bill",
    "finance_movement",
    "finance_cash_count",
    "finance_supplier",
    "staff_access",
    "service_intake",
  ])
    expect(generalReceiptRoute(receipt(kind))).toBeNull()
})

test("dashboard-only write capabilities are reported as native gaps", () => {
  const gaps = new Map(
    nativeParityGaps(capabilityManifest).map((gap) => [gap.id, gap.missing]),
  )
  expect(gaps.get("inventory.count.create")).toEqual(["editor", "receipt"])
  expect(gaps.get("sales.order.replace")).toEqual(["editor"])
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
          !entry.clients.includes("mobile"),
      )
      .map((entry) => entry.id),
    // Recorded Finance balances currently have dashboard-only acceptance.
  ).toEqual(["finance.money_account_balances.read"])
})
