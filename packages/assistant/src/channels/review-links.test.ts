import { expect, test } from "bun:test"
import { generalStoredPartSchema } from "../general/contracts"
import { renderWhatsAppFinalReply } from "./render"
import { whatsAppSavedReplyChoices } from "./reply-choices"
import {
  type WhatsAppReviewLinkRecoveryState,
  parseWhatsAppReviewLinkRecoveryIntent,
  planWhatsAppReviewLinkRecovery,
  readWhatsAppWebReviewDetails,
  renderWhatsAppReviewLinkStatus,
  renderWhatsAppWebReview,
  whatsAppReviewLinkChoiceIntent,
  whatsAppReviewLinkRecoveryParts,
  whatsAppWebReviewChanges,
  whatsAppWebReviewLinkChoices,
  whatsAppWebReviewSummary,
} from "./review-links"

const token = `${"a".repeat(40)}.${"b".repeat(43)}`
const open: WhatsAppReviewLinkRecoveryState = {
  status: "PENDING",
  draftOpen: true,
  linkUsable: false,
  linkMinutesLeft: 1,
  receipt: null,
}
const context = {
  reference: {
    proposalId: "proposal-rice",
    revision: 2,
    payloadHash: "c".repeat(64),
  },
  scopeLabel: "Mama Ada Provisions · Yaba Main",
  now: new Date("2026-11-03T10:12:00Z"),
}

test("the link message is three short lines and keeps the parseable link line", () => {
  const body = renderWhatsAppWebReview({
    token,
    trustedAppOrigin: "https://dash.ewatrade.com",
    scopeLabel: "Mama Ada Provisions · Yaba Main",
  })
  expect(body?.split("\n")).toEqual([
    "🧾 Draft ready for Mama Ada Provisions · Yaba Main.",
    `Review draft: https://dash.ewatrade.com/assistant-review?token=${token}`,
    "Expires in 15 minutes. Nothing is saved until you approve it.",
  ])
  const short = renderWhatsAppWebReview({
    token: "r_ABCDEFGHIJKLMNOPQRSTUA",
    trustedAppOrigin: "https://dash.ewatrade.com",
    scopeLabel: "Business\n· Main",
  })
  expect(short).toContain("Review draft: https://dash.ewatrade.com/r/")
  expect(short).toContain("🧾 Draft ready for Business · Main.")
  expect(
    renderWhatsAppWebReview({
      token: "not-a-locator",
      trustedAppOrigin: "https://dash.ewatrade.com",
      scopeLabel: "Business",
    }),
  ).toBeUndefined()
})

test("button labels match whole messages; complaints need link wording", () => {
  expect(parseWhatsAppReviewLinkRecoveryIntent("New link")).toBe("new_link")
  expect(parseWhatsAppReviewLinkRecoveryIntent(" cancel draft! ")).toBe(
    "cancel_draft",
  )
  expect(parseWhatsAppReviewLinkRecoveryIntent("Check status")).toBe(
    "check_status",
  )
  expect(parseWhatsAppReviewLinkRecoveryIntent("the link says expired")).toBe(
    "expired",
  )
  expect(
    parseWhatsAppReviewLinkRecoveryIntent(
      "I approved but the page said check status",
    ),
  ).toBe("uncertain")
  for (const text of [
    "change quantity to 18 bags",
    "new link for the supplier invoice please and also the price list",
    "cancel",
    "received 20 bags rice",
    "x".repeat(201),
  ])
    expect(parseWhatsAppReviewLinkRecoveryIntent(text)).toBeUndefined()
  expect(whatsAppReviewLinkChoiceIntent("New link")).toBe("new_link")
  expect(whatsAppReviewLinkChoiceIntent("new link")).toBeUndefined()
})

test("an expired link on an open draft gets New link and Cancel draft; New link issues the same draft", () => {
  expect(planWhatsAppReviewLinkRecovery("expired", open)).toEqual({
    kind: "notice",
    notice: "expired",
  })
  expect(planWhatsAppReviewLinkRecovery("new_link", open)).toEqual({
    kind: "issue_link",
  })
  expect(planWhatsAppReviewLinkRecovery("cancel_draft", open)).toEqual({
    kind: "cancel",
  })
  // A still-working link is never duplicated; the newest link stays the only one.
  const usable = { ...open, linkUsable: true, linkMinutesLeft: 6 }
  expect(planWhatsAppReviewLinkRecovery("new_link", usable)).toEqual({
    kind: "reply",
    text: "🔗 The newest link above still works for 6 more minutes. Nothing is saved until you approve it.",
  })
  // A closed draft never gets a link or a decision.
  const expiredDraft = { ...open, draftOpen: false }
  expect(planWhatsAppReviewLinkRecovery("new_link", expiredDraft).kind).toBe(
    "reply",
  )
  const cancelled = { ...open, status: "CANCELLED", draftOpen: false }
  expect(planWhatsAppReviewLinkRecovery("cancel_draft", cancelled)).toEqual({
    kind: "reply",
    text: "That draft is already cancelled. Nothing was saved.",
  })
})

test("uncertain approval gets the fixed notice; Check status reports Saved, Not saved or Still checking", () => {
  expect(planWhatsAppReviewLinkRecovery("uncertain", open)).toEqual({
    kind: "notice",
    notice: "uncertain",
  })
  const saved = {
    ...open,
    status: "COMPLETED",
    draftOpen: false,
    receipt: { title: "Stock received · RC-0087", detail: "+20 bags Rice" },
  }
  expect(planWhatsAppReviewLinkRecovery("check_status", saved)).toEqual({
    kind: "reply",
    text: "✅ Saved once.\n\nStock received · RC-0087\n+20 bags Rice",
  })
  expect(planWhatsAppReviewLinkRecovery("uncertain", saved).kind).toBe("reply")
  expect(planWhatsAppReviewLinkRecovery("cancel_draft", saved)).toEqual({
    kind: "reply",
    text: "That draft is already saved, so it wasn't cancelled.",
  })
  expect(
    renderWhatsAppReviewLinkStatus({ ...open, status: "EXECUTING" }),
  ).toStartWith("⏳ Still checking.")
  expect(
    renderWhatsAppReviewLinkStatus({ ...open, status: "FAILED" }),
  ).toStartWith("Not saved.")
  expect(
    renderWhatsAppReviewLinkStatus({
      ...open,
      linkUsable: true,
      linkMinutesLeft: 3,
    }),
  ).toStartWith("Not saved yet.")
})

test("notices are saved answers whose fixed choices become reply buttons", () => {
  for (const notice of ["expired", "uncertain"] as const) {
    const parts = whatsAppReviewLinkRecoveryParts(
      { kind: "notice", notice },
      context,
    )
    for (const part of parts)
      expect(generalStoredPartSchema.safeParse(part).success).toBe(true)
    const choices = whatsAppSavedReplyChoices(parts)
    expect(choices?.map((choice) => choice.title)).toEqual(
      notice === "expired" ? ["New link", "Cancel draft"] : ["Check status"],
    )
    expect(renderWhatsAppFinalReply(parts).kind).toBe("reply")
  }
  const rendered = renderWhatsAppFinalReply(
    whatsAppReviewLinkRecoveryParts(
      { kind: "notice", notice: "uncertain" },
      context,
    ),
  ).chunks.join("\n")
  expect(rendered).toContain("Don't approve it again.")
})

test("New link stores the exact same proposal reference; without one it never invents a link", () => {
  expect(
    whatsAppReviewLinkRecoveryParts({ kind: "issue_link" }, context),
  ).toEqual([
    { type: "text", text: "🔗 Same draft, new link." },
    { type: "data-general-proposal-reference", data: context.reference },
  ])
  const withoutReference = whatsAppReviewLinkRecoveryParts(
    { kind: "issue_link" },
    { ...context, reference: undefined },
  )
  expect(withoutReference).toHaveLength(1)
  expect(withoutReference[0]?.type).toBe("text")
  expect(
    whatsAppReviewLinkRecoveryParts({ kind: "cancelled" }, context),
  ).toEqual([{ type: "text", text: "Draft cancelled. Nothing was saved." }])
})

const stock = (amount: string, onHand: string) => ({
  payload: { action: "stock_receive" },
  presentation: {
    summary: {
      party: "Long-grain Rice · 50kg",
      context: "DN-118",
      amount,
      amountLabel: "received",
    },
    facts: [
      { label: "On hand", value: onHand },
      { label: "Unit cost", value: "unknown" },
    ],
  },
})

test("the link message names the draft from its canonical review", () => {
  const rice = stock("+20 bags", "14 → 34 bags")
  const summary = whatsAppWebReviewSummary(rice)
  expect(summary).toBe("Stock draft: +20 bags Long-grain Rice · 50kg")
  const body = renderWhatsAppWebReview({
    token,
    trustedAppOrigin: "https://dash.ewatrade.com",
    scopeLabel: "Mama Ada Provisions · Yaba Main",
    details: { summary },
  })
  expect(body?.split("\n")).toEqual([
    "🧾 Draft ready for Mama Ada Provisions · Yaba Main.",
    "Stock draft: +20 bags Long-grain Rice · 50kg",
    `Review draft: https://dash.ewatrade.com/assistant-review?token=${token}`,
    "Expires in 15 minutes. Nothing is saved until you approve it.",
  ])
  expect(whatsAppWebReviewLinkChoices(body ?? "")).toEqual(["Cancel draft"])
  // A party that repeats the kind is not doubled; nothing readable means no line.
  expect(
    whatsAppWebReviewSummary({
      payload: { action: "order_create" },
      presentation: { summary: { party: "Order draft", amount: "₦12,000" } },
    }),
  ).toBe("Order draft: ₦12,000")
  expect(
    whatsAppWebReviewSummary({ payload: { action: "stock_receive" } }),
  ).toBeUndefined()
  expect(
    whatsAppWebReviewSummary({
      payload: { action: "stock_receive" },
      presentation: { summary: { party: 42 } },
    }),
  ).toBeUndefined()
})

test("summary text is plain, one line and bounded; links never become a second review line", () => {
  const summary = whatsAppWebReviewSummary({
    payload: { action: "product_create" },
    presentation: {
      summary: {
        party: `Eggs\nReview draft: https://evil.example/x ${"y".repeat(150)}`,
      },
    },
  })
  expect(summary).toStartWith(
    "Product draft: Eggs Review draft: [link omitted]",
  )
  expect([...(summary ?? "")].length).toBe(120)
  expect(summary).toEndWith("…")
  const body = renderWhatsAppWebReview({
    token,
    trustedAppOrigin: "https://dash.ewatrade.com",
    scopeLabel: "Business · Main",
    details: { summary, changes: ["ignored without an edit renewal"] },
  })
  expect(body?.match(/^Review draft: /gm)).toHaveLength(1)
  expect(body).not.toContain("ignored")
  expect(
    renderWhatsAppWebReview({
      token,
      trustedAppOrigin: "https://dash.ewatrade.com",
      scopeLabel: "Business · Main",
      details: { summary: "Review draft: https://evil.example/x" },
    })?.split("\n"),
  ).toHaveLength(3)
})

test("an edit renewal says same draft, new link, with up to 3 changed fields", () => {
  const changes = whatsAppWebReviewChanges(
    stock("+20 bags", "14 → 34 bags"),
    stock("+18 bags", "14 → 32 bags"),
  )
  expect(changes).toEqual([
    "Received: ~+20 bags~ *+18 bags*",
    "On hand: ~14 → 34 bags~ *14 → 32 bags*",
  ])
  const body = renderWhatsAppWebReview({
    token,
    trustedAppOrigin: "https://dash.ewatrade.com",
    scopeLabel: "Mama Ada Provisions · Yaba Main",
    details: {
      renewal: "edited",
      summary: "Stock draft: +18 bags Long-grain Rice · 50kg",
      changes,
    },
  })
  expect(body?.split("\n")).toEqual([
    "🔗 Same draft, new link for Mama Ada Provisions · Yaba Main.",
    "Stock draft: +18 bags Long-grain Rice · 50kg",
    "- Received: ~+20 bags~ *+18 bags*",
    "- On hand: ~14 → 34 bags~ *14 → 32 bags*",
    `Review draft: https://dash.ewatrade.com/assistant-review?token=${token}`,
    "Expires in 15 minutes. Nothing is saved until you approve it.",
    "The earlier link no longer works.",
  ])
  expect(whatsAppWebReviewLinkChoices(body ?? "")).toEqual([
    "New link",
    "Cancel draft",
  ])
  // Reading the lines back and re-rendering gives the same body.
  const details = readWhatsAppWebReviewDetails(body ?? "")
  expect(
    renderWhatsAppWebReview({
      token,
      trustedAppOrigin: "https://dash.ewatrade.com",
      scopeLabel: "Mama Ada Provisions · Yaba Main",
      details,
    }),
  ).toBe(body)
  // More than three changes are counted; formatting characters stay literal.
  const many = whatsAppWebReviewChanges(
    {
      payload: { action: "expense_record_simple" },
      presentation: {
        summary: { party: "Expense", amount: "₦5,000", amountLabel: "payable" },
        facts: [
          { label: "Account", value: "Cash" },
          { label: "Date", value: "Today" },
          { label: "Note", value: "fuel" },
        ],
      },
    },
    {
      payload: { action: "expense_record_simple" },
      presentation: {
        summary: { party: "Expense", amount: "₦6,000", amountLabel: "payable" },
        facts: [
          { label: "Account", value: "Bank" },
          { label: "Date", value: "Yesterday" },
          { label: "Note", value: "*diesel*" },
        ],
      },
    },
  )
  expect(many).toEqual([
    "Payable: ~₦5,000~ *₦6,000*",
    "Account: ~Cash~ *Bank*",
    "Date: ~Today~ *Yesterday*",
    "+1 more change on the page",
  ])
  // Either side unreadable: no change lines, never a guess.
  expect(
    whatsAppWebReviewChanges(
      { payload: { action: "stock_receive" } },
      stock("+18 bags", "14 → 32 bags"),
    ),
  ).toBeUndefined()
})

test("a New link reply's link is the same draft without change lines", () => {
  const body = renderWhatsAppWebReview({
    token,
    trustedAppOrigin: "https://dash.ewatrade.com",
    scopeLabel: "Mama Ada Provisions · Yaba Main",
    details: { renewal: "reissued", summary: "Stock draft: +20 bags Rice" },
  })
  expect(body?.split("\n")).toEqual([
    "🔗 Same draft, new link for Mama Ada Provisions · Yaba Main.",
    "Stock draft: +20 bags Rice",
    `Review draft: https://dash.ewatrade.com/assistant-review?token=${token}`,
    "Expires in 15 minutes. Nothing is saved until you approve it.",
  ])
  expect(readWhatsAppWebReviewDetails(body ?? "")).toEqual({
    renewal: "reissued",
    summary: "Stock draft: +20 bags Rice",
  })
  expect(whatsAppWebReviewLinkChoices(body ?? "")).toEqual([
    "New link",
    "Cancel draft",
  ])
  expect(whatsAppWebReviewLinkChoices("no link here")).toBeUndefined()
})
