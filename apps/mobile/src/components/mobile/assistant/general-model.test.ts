import { expect, test } from "bun:test"
import {
  generalTokenBudgetLine,
  generalTokenBudgetUsed,
} from "@ewatrade/assistant/general/allowance"
import {
  generalAnswerRoute,
  generalAnswers,
  generalReceiptRoute,
  generalSavedSnapshot,
  readGeneralCache,
  readGeneralSnapshot,
} from "./general-model"
const data = readGeneralSnapshot({
  conversation: { id: "conversation", title: "Saved chat" },
  messages: [
    {
      id: "message",
      role: "assistant",
      parts: [{ type: "text", text: "Saved answer" }],
    },
  ],
  proposals: [
    {
      id: "proposal",
      revision: 1,
      payload: { action: "customer_create", name: "Amina" },
      status: "PENDING",
      expiresAt: "2030-01-01T00:00:00.000Z",
      receipt: null,
      approvalToken: "secret",
    },
  ],
  activeRunId: "run",
  allowance: {
    remainingRequests: 2,
    remainingTokens: 100,
    resetsAt: "2030-01-01",
  },
  businessName: "Shop",
  storeName: "Store",
  currencyCode: "NGN",
})
if (!data) throw new Error("Invalid General snapshot fixture")
test("allowance parsing retains token metadata and supports old installed-client snapshots", () => {
  expect(readGeneralSnapshot(data)?.allowance.tokenLimit).toBeUndefined()
  const snapshot = readGeneralSnapshot({
    ...data,
    allowance: {
      remainingRequests: 0,
      remainingTokens: 3_873_128,
      repliesUnlimited: true,
      requestLimit: null,
      tokenLimit: 5_000_000,
      resetsAt: "2026-11-01T00:00:00Z",
    },
  })
  if (!snapshot) throw new Error("Invalid token allowance snapshot")
  expect(snapshot.allowance.repliesUnlimited).toBe(true)
  expect(snapshot.allowance.requestLimit).toBeNull()
  expect(snapshot.allowance.remainingRequests).toBe(0)
  expect(snapshot.allowance.tokenLimit).toBe(5_000_000)
  expect(generalTokenBudgetUsed(snapshot.allowance)).toBe(false)
  expect(generalTokenBudgetLine(snapshot.allowance)).toContain(
    `${(3_873_128).toLocaleString()} of ${(5_000_000).toLocaleString()} tokens left`,
  )
  expect(generalSavedSnapshot(snapshot).allowance).toEqual(snapshot.allowance)
})
test("offline snapshot never persists approval tokens or active execution state", () => {
  const saved = generalSavedSnapshot(data)
  expect(JSON.stringify(saved)).not.toContain("secret")
  expect(saved.activeRunId).toBe(null)
  expect(data.proposals[0]?.approvalToken).toBe("secret")
  const raw = JSON.stringify({ scope: "scope", savedAt: 1000, data })
  expect(
    readGeneralCache(raw, "scope", 1001)?.data.proposals[0]?.approvalToken,
  ).toBeUndefined()
  expect(readGeneralCache(raw, "other", 1001)).toBe(null)
  expect(readGeneralCache(raw, "scope", 1000 + 24 * 60 * 60 * 1000 + 1)).toBe(
    null,
  )
  expect(readGeneralCache(raw, "scope", -100000)).toBe(null)
  expect(readGeneralCache("broken", "scope")).toBe(null)
})
test("receipt navigation uses actual command IDs and the existing native route parameters", () => {
  expect(
    generalReceiptRoute({
      kind: "payment",
      recordId: "payment-real",
      orderId: "order-real",
      title: "Paid",
      detail: "Saved",
    }),
  ).toEqual({ pathname: "/order/[orderId]", params: { orderId: "order-real" } })
  expect(
    generalReceiptRoute({
      kind: "product",
      recordId: "product-real",
      title: "Added",
      detail: "Saved",
    }),
  ).toEqual({
    pathname: "/catalog-item/[catalogItemId]",
    params: { catalogItemId: "product-real" },
  })
})

test("finance receipt routes retain the exact Book and original record, refusing unpinned originals", () => {
  for (const kind of ["finance_movement", "finance_bill"] as const) {
    const base = { kind, recordId: "original", title: "Saved", detail: "Saved" }
    expect(generalReceiptRoute(base)).toBeNull()
    expect(generalReceiptRoute({ ...base, bookId: " " })).toBeNull()
    expect(generalReceiptRoute({ ...base, bookId: "saved-book" })).toEqual(
      kind === "finance_movement"
        ? {
            pathname: "/finance-movement/[entryId]",
            params: { entryId: "original", bookId: "saved-book" },
          }
        : {
            pathname: "/finance-expense/[billId]",
            params: { billId: "original", bookId: "saved-book" },
          },
    )
  }
})

test("staff receipt and answer Opens retain exact event or command identities", () => {
  for (const kind of [
    "staff_status",
    "staff_access",
    "staff_invitation",
  ] as const) {
    const target =
      kind === "staff_invitation"
        ? { kind, commandId: "original" }
        : { kind, eventId: "original" }
    const route = {
      pathname: "/staff-invite-modal" as const,
      params: { target: JSON.stringify(target) },
    }
    expect(
      generalReceiptRoute({
        kind,
        recordId: "original",
        title: "Saved",
        detail: "Saved",
      }),
    ).toEqual(route)
    expect(generalAnswerRoute(target)).toEqual(route)
    expect(
      generalReceiptRoute({
        kind,
        recordId: "",
        title: "Saved",
        detail: "Saved",
      }),
    ).toBeNull()
  }
})

test("staff directory, member and history answer Opens keep exact saved filters", () => {
  for (const target of [
    { kind: "staff_member", membershipId: "selected-member" },
    {
      kind: "staff_directory",
      filters: {
        search: "Amina",
        assignmentStoreId: "saved-store",
        cursor: "saved-page",
      },
    },
    {
      kind: "staff_history",
      filters: {
        membershipId: "selected-member",
        stream: "STORE_ACCESS",
        cursor: "saved-history-page",
      },
    },
  ] as const) {
    const route = generalAnswerRoute(target)
    expect(route?.pathname).toBe("/staff-invite-modal")
    expect(route?.params).toEqual({ target: JSON.stringify(target) })
  }
})

test("service answer and receipt Opens select saved originals rather than the work queue or a related Order", () => {
  const intake = generalReceiptRoute({
    kind: "service_intake",
    recordId: "saved-intake",
    orderId: "saved-order",
    title: "Saved",
    detail: "Saved",
  })
  expect(intake?.pathname).toBe("/service-jobs-modal")
  expect(
    intake && "target" in intake.params
      ? JSON.parse(intake.params.target ?? "null")
      : null,
  ).toEqual({
    kind: "service_intake",
    intakeId: "saved-intake",
    orderId: "saved-order",
  })
  expect(
    generalReceiptRoute({
      kind: "service_intake",
      recordId: "saved-intake",
      title: "Legacy",
      detail: "Missing original Order",
    }),
  ).toBeNull()
  for (const target of [
    { kind: "service_work", jobId: "saved-job", eventId: "saved-event" },
    { kind: "service_work_note", jobId: "saved-job", recordId: "saved-note" },
    {
      kind: "service_work_exception",
      jobId: "saved-job",
      recordId: "saved-exception",
    },
    {
      kind: "commerce_quote_approval",
      approvalId: "saved-approval",
      quoteId: "saved-quote",
      quoteVersionId: "saved-version",
    },
  ] as const) {
    const route = generalAnswerRoute(target)
    expect(route?.pathname).toBe("/service-jobs-modal")
    expect(
      route?.pathname === "/service-jobs-modal"
        ? JSON.parse(route.params.target)
        : null,
    ).toEqual(target)
  }
})

test("only validated server answer cards survive saved history", () => {
  const answer = {
    id: "summary",
    title: "Sales",
    value: "NGN 20.00",
    scope: "QA Store · Your orders",
    asOf: "2030-01-01T00:00:00.000Z",
    detail: "2 orders · order value, not cash collected.",
  }
  const parts = [{ type: "data-general-answer", data: answer }]
  expect(generalAnswers(parts)).toEqual([answer])
  expect(
    generalAnswers([
      { type: "data-general-answer", data: { ...answer, asOf: "invalid" } },
    ]),
  ).toEqual([])
  expect(
    generalAnswers([{ type: "data-general-proposal", data: answer }]),
  ).toEqual([])
  const snapshot = readGeneralSnapshot({
    ...data,
    messages: [{ id: "answer", role: "assistant", parts }],
  })
  expect(snapshot).not.toBeNull()
  if (!snapshot) throw Error("Expected saved answer")
  expect(
    generalAnswers(generalSavedSnapshot(snapshot).messages[0]?.parts),
  ).toEqual([answer])
  expect(
    readGeneralSnapshot({
      ...data,
      messages: [
        {
          id: "bad",
          role: "assistant",
          parts: [
            {
              type: "data-general-answer",
              data: { ...answer, approvalToken: "secret" },
            },
          ],
        },
      ],
    }),
  ).toBeNull()
})

test("activity answers open natively; each event opens only its exact object", async () => {
  const { generalAnswerRoute, staffActivityRecordRoute } = await import(
    "./general-model"
  )
  const target = {
    kind: "staff_activity" as const,
    filters: {
      from: "2026-10-12T00:00:00+01:00",
      to: "2026-10-13T00:00:00+01:00",
    },
    cursor: null,
    limit: 1,
    shown: [
      {
        stream: "PAYMENT" as const,
        id: "p-1",
        at: "2026-10-12T13:05:00.000Z",
        summary: "Amina did: Payment recorded",
        record: {
          kind: "payment" as const,
          id: "p-1",
          orderId: "o-1",
          label: "ORD-1042",
        },
      },
    ],
  }
  expect(generalAnswerRoute(target)).toEqual({
    pathname: "/staff-activity-modal",
    params: { target: JSON.stringify(target) },
  })
  expect(generalAnswerRoute(undefined)).toBeNull()
  // A payment opens its Order through the stored link, never by payment ID.
  expect(
    staffActivityRecordRoute({
      kind: "payment",
      id: "p-1",
      orderId: "o-1",
      label: "x",
    }),
  ).toEqual({ pathname: "/order/[orderId]", params: { orderId: "o-1" } })
  expect(
    staffActivityRecordRoute({
      kind: "product",
      id: "item-1",
      offeringId: "off-1",
      label: "x",
    }),
  ).toEqual({
    pathname: "/catalog-item/[catalogItemId]",
    params: { catalogItemId: "item-1" },
  })
  for (const record of [
    { kind: "stock_operation" as const, id: "s-1", label: "x" },
    { kind: "stock_count" as const, id: "c-1", label: "x" },
    { kind: "service_job" as const, id: "j-1", orderId: "o-1", label: "x" },
    { kind: "finance_entry" as const, id: "f-1", bookId: "b-1", label: "x" },
  ])
    expect(staffActivityRecordRoute(record)).toBeNull()
})

test("activity Opens stay in the event's own Store", async () => {
  const { staffActivityOpen } = await import("./general-model")
  const order = { kind: "order" as const, id: "o-1", label: "ORD-1" }
  expect(
    staffActivityOpen(
      { record: order, store: { id: "store-b", name: "Garki" } },
      "store-a",
    ),
  ).toEqual({ unavailable: "Switch to Garki to open." })
  expect(
    staffActivityOpen(
      { record: order, store: { id: "store-a", name: "Wuse" } },
      "store-a",
    ),
  ).toEqual({
    route: { pathname: "/order/[orderId]", params: { orderId: "o-1" } },
  })
  expect(
    staffActivityOpen(
      {
        record: { kind: "product", id: "i-1", offeringId: "f-1", label: "x" },
        store: null,
      },
      "store-a",
    ),
  ).toEqual({
    route: {
      pathname: "/catalog-item/[catalogItemId]",
      params: { catalogItemId: "i-1" },
    },
  })
  expect(
    staffActivityOpen(
      {
        record: { kind: "stock_count", id: "c-1", label: "x" },
        store: { id: "store-a", name: "Wuse" },
      },
      "store-a",
    ),
  ).toEqual({ unavailable: "Open this record on the dashboard." })
})

test("General snapshots accept old cache and additive token-only allowance without nullable legacy counters", () => {
  expect(readGeneralSnapshot(data)).not.toBeNull()
  const snapshot = readGeneralSnapshot({
    ...data,
    allowance: {
      remainingRequests: 4_399_999,
      remainingTokens: 4_399_999,
      repliesUnlimited: true,
      requestLimit: null,
      tokenLimit: 5_000_000,
      resetsAt: "2026-11-01T00:00:00Z",
    },
  })
  expect(snapshot?.allowance.repliesUnlimited).toBe(true)
  expect(typeof snapshot?.allowance.remainingRequests).toBe("number")
  expect(snapshot?.allowance.remainingRequests).toBeGreaterThan(0)
  expect(snapshot?.allowance.requestLimit).toBeNull()
})
