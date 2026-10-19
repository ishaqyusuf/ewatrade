import { expect, test } from "bun:test"
import {
  type WhatsAppActionReview,
  appendWhatsAppActionReviewInstructions,
  parseWhatsAppActionButton,
  parseWhatsAppTypedAction,
  renderWhatsAppActionReview,
  renderWhatsAppActionReviewBody,
  whatsAppActionButtonId,
  whatsAppProposalSourceSchema,
} from "./action-review"

const confirmCode = "a".repeat(43)
const cancelCode = "b".repeat(43)
const now = Date.parse("2026-10-15T12:00:00.000Z")
const options = { confirmCode, cancelCode, now }
const review: WhatsAppActionReview = {
  source: {
    proposalId: "exact-proposal",
    revision: 7,
    payloadHash: "c".repeat(64),
  },
  title: "Record supplier payment",
  businessName: "Original business",
  storeName: "Original Store",
  reviewLines: [
    "Record money already paid; no provider transfer is made.",
    "Book: October NGN · account Shop bank · supplier Amina.",
    "Original invoice INV-002 · payable after payment ₦0.25.",
  ],
  complete: true,
  requiresPresentation: true,
  expiresAt: "2026-10-15T12:05:00.000Z",
  presentation: {
    summary: {
      party: "Amina",
      amount: "₦90,071,992,547,409,931.23",
      amountLabel: "Recorded payment",
    },
    facts: [{ label: "From", value: "Shop bank" }],
    table: {
      columns: [{ label: "Item" }, { label: "Quantity" }, { label: "Value" }],
      rows: [
        {
          cells: ["Eggs", "9007199254740993.125 crates", "₦0.25"],
          detail: "Original unit configuration · no stock movement",
        },
        { cells: ["Rice", "3 bags", "₦10.00"] },
      ],
      preview: 1,
      total: { label: "Total", value: "₦10.25" },
    },
    sections: [
      {
        title: "Book effects",
        summary: "Original expense bill",
        rows: [
          {
            label: "Invoice",
            value: "INV-002",
            detail: "Saved source revision 4",
          },
        ],
        chips: [{ label: "Existing bank" }],
        note: "Record-only; no settlement checked.",
      },
    ],
    note: "Review all facts before confirming.",
  },
}

test("durable review body contains no action codes and dispatch appends instructions only in memory", () => {
  const durable = renderWhatsAppActionReviewBody(review, { now })
  expect(durable.kind).toBe("review")
  expect(durable.body).not.toContain(confirmCode)
  expect(durable.body).not.toContain(cancelCode)
  const before = JSON.stringify(durable)
  const dispatched = appendWhatsAppActionReviewInstructions(durable, options)
  expect(dispatched.body).toContain(`Confirm ${confirmCode}`)
  expect(JSON.stringify(durable)).toBe(before)
  expect(dispatched).toEqual(renderWhatsAppActionReview(review, options))
})

test("complete canonical review preserves every fact, hidden row, exact amount/unit and source revision", () => {
  const rendered = renderWhatsAppActionReview(review, options)
  expect(rendered.kind).toBe("review")
  if (rendered.kind !== "review")
    throw Error("Complete review unexpectedly refused")
  expect(rendered.source).toEqual(review.source)
  for (const value of [
    "Business: Original business",
    "Store: Original Store",
    "Draft revision: 7",
    "₦90,071,992,547,409,931.23",
    "9007199254740993.125 crates",
    "Rice",
    "Saved source revision 4",
    "no stock movement",
    `Confirm ${confirmCode}`,
    `Cancel ${cancelCode}`,
    review.expiresAt,
  ])
    expect(rendered.body).toContain(value)
  expect(rendered.body).not.toContain("exact-proposal")
  expect(rendered.body).not.toContain(review.source.payloadHash)
  expect(rendered.body.length).toBeLessThanOrEqual(3000)
  expect(renderWhatsAppActionReview(review, options)).toEqual(rendered)
})

test("incomplete, expired, clipped, unsafe, oversized or malformed reviews carry no native actions", () => {
  const candidates: unknown[] = [
    { ...review, complete: false },
    { ...review, presentation: undefined },
    { ...review, expiresAt: "2026-10-15T12:00:00.000Z" },
    { ...review, approvalToken: "browser-secret" },
    { ...review, reviewLines: ["Material name shortened…"] },
    { ...review, reviewLines: ["Unsafe \u202e amount"] },
    { ...review, reviewLines: ["Open https://unsafe.example/token"] },
    { ...review, reviewLines: ["x".repeat(2000), "y".repeat(2000)] },
    {
      ...review,
      presentation: {
        ...review.presentation,
        table: {
          columns: [{ label: "Amount" }],
          rows: [{ cells: ["₦1.00", "shifted"] }],
        },
      },
    },
  ]
  for (const candidate of candidates) {
    const rendered = renderWhatsAppActionReview(candidate, options)
    expect(rendered.kind).toBe("app_review")
    expect(rendered.body).not.toContain(confirmCode)
    expect(rendered.body).not.toContain(cancelCode)
  }
  expect(
    renderWhatsAppActionReview(review, { ...options, maxUnits: 500 }).kind,
  ).toBe("app_review")
  expect(
    renderWhatsAppActionReview(review, { ...options, cancelCode: confirmCode })
      .kind,
  ).toBe("app_review")
  expect(
    whatsAppProposalSourceSchema.safeParse({
      ...review.source,
      approvalToken: "secret",
    }).success,
  ).toBe(false)
})

test("typed confirmation and cancellation require exact opaque code and quoted provider context", () => {
  expect(
    parseWhatsAppTypedAction(`Confirm ${confirmCode}`, "original-review"),
  ).toEqual({
    kind: "action",
    decision: "confirm",
    code: confirmCode,
    replyToMessageId: "original-review",
  })
  expect(
    parseWhatsAppTypedAction(`cancel ${cancelCode}`, "original-review"),
  ).toEqual({
    kind: "action",
    decision: "cancel",
    code: cancelCode,
    replyToMessageId: "original-review",
  })
  for (const text of [
    "yes",
    "Proceed",
    "Save it",
    "Confirm",
    `Confirm ${confirmCode} extra`,
    `Confirm ${confirmCode}!`,
    `Confirm ${confirmCode.slice(1)}`,
    "Cancel 123456",
    `/Confirm ${confirmCode}`,
  ])
    expect(parseWhatsAppTypedAction(text, "original-review")).toEqual({
      kind: "invalid_action",
    })
  expect(parseWhatsAppTypedAction(`Confirm ${confirmCode}`)).toEqual({
    kind: "invalid_action",
  })
  expect(
    parseWhatsAppTypedAction(`Confirm ${confirmCode}`, "bad reply context"),
  ).toEqual({ kind: "invalid_action" })
  for (const text of [
    "12500",
    "1",
    "record a payment",
    "confirmation email",
    "I want to confirm the amount",
    "Edit this draft",
    "Edit the amount to 500",
    "Save the customer phone as 08030000000",
    "Cancel order ORD-123",
    "Cancel the booking for tomorrow",
    "Yes, change the amount to 500",
    "Proceed with drafting the customer details",
  ])
    expect(parseWhatsAppTypedAction(text, "original-review")).toBeNull()
})

test("proof-like text never reaches a model even when edited, pasted alone or followed by extra text", () => {
  for (const text of [
    "Cancel",
    "edit!",
    "save",
    "yes please",
    "proceed now",
    "cancel it",
    "Confirm the amount is 500",
    confirmCode,
    `Edit ${confirmCode} amount to 500`,
    `Save the customer ${confirmCode} extra`,
    `Cancel order ORD-123 ${cancelCode} extra`,
    `Here is ${confirmCode} please use it`,
    `Cancel ${cancelCode.slice(1)} extra`,
    `Edit ${confirmCode.slice(0, 20)}+${confirmCode.slice(21)} extra`,
    "Edit ewa-wa-action-v1:short:confirm",
    "Save ewa-wa-workflow-v1:setup:short:confirm",
  ])
    expect(parseWhatsAppTypedAction(text, "original-review")).toEqual({
      kind: "invalid_action",
    })
  expect(parseWhatsAppTypedAction(`Cancel ${cancelCode}`)).toEqual({
    kind: "invalid_action",
  })
  expect(
    parseWhatsAppTypedAction(`Cancel ${cancelCode}`, "bad quoted reply"),
  ).toEqual({ kind: "invalid_action" })
})

test("bounded versioned button IDs cannot choose another decision or bypass reply correlation", () => {
  const button = whatsAppActionButtonId(confirmCode, "confirm")
  expect(button.length).toBeLessThanOrEqual(256)
  expect(parseWhatsAppActionButton(button, "original-review")).toEqual({
    kind: "action",
    decision: "confirm",
    code: confirmCode,
    replyToMessageId: "original-review",
  })
  for (const value of [
    button,
    `${button}:other`,
    button.replace("v1", "v2"),
    button.replace(":confirm", ":execute"),
    "ewa-wa-action-v1:123456:confirm",
  ])
    expect(parseWhatsAppActionButton(value)).toEqual({ kind: "invalid_action" })
  expect(
    parseWhatsAppActionButton("other-control", "original-review"),
  ).toBeNull()
})
