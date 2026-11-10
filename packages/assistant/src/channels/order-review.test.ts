import { expect, test } from "bun:test"
import { generalActionSchema } from "../general/contracts"
import {
  nativeOrderChoiceIssues,
  orderReviewPageButtonId,
  parseOrderReviewPageIntent,
  renderNativeOrderReviewPages,
} from "./order-review"

const payload = generalActionSchema.parse({
  action: "order_create",
  customerChoice: "walk_in",
  paymentChoice: "unpaid",
  fulfillNow: false,
  lines: [
    {
      offeringId: "rice",
      quantity: "1.5",
      expectedFixedPriceMinor: 10000,
      expectedConfigurationVersionId: "v1",
    },
  ],
})
if (payload.action !== "order_create") throw Error("Order expected")
const frame = {
  source: { proposalId: "proposal", revision: 1, payloadHash: "a".repeat(64) },
  businessName: "Shop",
  storeName: "Main",
  expiresAt: "2026-11-10T20:00:00.000Z",
}
const summary = [
  "Customer: Walk-in",
  "Total: ₦30,000",
  "Received: ₦0 · unpaid",
  "Received into: none · no payment recorded",
  "Balance: ₦30,000",
  "Handover: collect later; on-hand stays unchanged and product stock is reserved",
  "Nothing is saved until you confirm.",
]
function item(n: number) {
  return [
    `${n}. Long-grain Rice · 50kg · Bag`,
    "1 × ₦1,000 = ₦1,000",
    `Stock: on hand 50 → 50; reserved 0 → ${n}; available 50 → ${50 - n} bags`,
  ]
}
test("native collection requires explicit customer, payment, handover and exact saved catalog lines", () => {
  expect(nativeOrderChoiceIssues(payload)).toEqual([])
  expect(
    nativeOrderChoiceIssues({
      ...payload,
      customerChoice: undefined,
      paymentChoice: undefined,
      fulfillNow: undefined,
    }),
  ).toHaveLength(3)
  expect(
    nativeOrderChoiceIssues({ ...payload, customerChoice: "saved" }).join(" "),
  ).toContain("separate confirmation")
  expect(
    nativeOrderChoiceIssues({ ...payload, customerName: "Walk-in" }).join(" "),
  ).toContain("must not also")
  expect(
    nativeOrderChoiceIssues({ ...payload, paymentChoice: "partial" }).join(" "),
  ).toContain("amount already received")
  expect(
    nativeOrderChoiceIssues({
      ...payload,
      lines: [
        {
          custom: "quick_sale",
          amountMinor: 100,
          description: "Not a catalog sale",
        },
      ],
    }).join(" "),
  ).toContain("exact saved product")
})
test("complete maximum review preserves every exact row without clipping and ends with full summary", () => {
  const lines = [
    ...Array.from({ length: 30 }, (_, i) => item(i + 1)).flat(),
    ...summary,
  ]
  const pages = renderNativeOrderReviewPages({ ...frame, lines, itemCount: 30 })
  expect(pages).toBeDefined()
  if (!pages) throw Error("Pages required")
  expect(pages.length).toBeGreaterThan(1)
  expect(pages.every((x) => x.length <= 680)).toBe(true)
  const all = pages.join("\n")
  for (const n of Array.from({ length: 30 }, (_, i) => i + 1))
    expect(all.split(`\n${n}. Long-grain Rice`).length - 1).toBe(1)
  expect(pages.at(-1)).toContain(summary.join("\n"))
  expect(all).not.toMatch(/Confirm [A-Za-z0-9_-]{43}/)
  expect(pages[0]).toContain(`page 1 of ${pages.length}`)
  expect(
    renderNativeOrderReviewPages({
      ...frame,
      lines: [...item(1), ...summary],
      itemCount: 1,
    }),
  ).toHaveLength(1)
})
test("unreviewable facts, control characters and over-limit shapes refuse rather than truncate", () => {
  expect(
    renderNativeOrderReviewPages({
      ...frame,
      lines: [...item(1), ...summary, `Note: ${"x".repeat(700)}`],
      itemCount: 1,
    }),
  ).toBeUndefined()
  expect(
    renderNativeOrderReviewPages({
      ...frame,
      lines: ["1. item\u202ehidden", ...item(1).slice(1), ...summary],
      itemCount: 1,
    }),
  ).toBeUndefined()
  expect(
    renderNativeOrderReviewPages({
      ...frame,
      lines: [...item(1), ...summary],
      itemCount: 31,
    }),
  ).toBeUndefined()
})
test("page locators are quoted navigation only; bare Next and unquoted or malformed controls do not enter business actions", () => {
  const event = {
    quickActionId: orderReviewPageButtonId("outbox", "next"),
    replyToMessageId: "wamid.page",
  }
  expect(parseOrderReviewPageIntent(event)).toEqual({
    type: "order_review_page",
    sourceOutboxId: "outbox",
    direction: "next",
    replyToMessageId: "wamid.page",
  })
  expect(
    parseOrderReviewPageIntent({ ...event, replyToMessageId: undefined })?.type,
  ).toBe("invalid_order_review_page")
  expect(parseOrderReviewPageIntent({ text: "Next" })).toBeNull()
  expect(
    parseOrderReviewPageIntent({
      text: "Next sale page outbox",
      replyToMessageId: "wamid.page",
    })?.type,
  ).toBe("order_review_page")
  expect(
    parseOrderReviewPageIntent({
      quickActionId: "ewa-wa-order-page-v1:outbox:confirm",
      replyToMessageId: "wamid.page",
    })?.type,
  ).toBe("invalid_order_review_page")
})
