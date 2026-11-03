import { expect, test } from "bun:test"
import { generalStoredPartSchema } from "../general/contracts"
import { renderWhatsAppFinalReply } from "./render"
import { whatsAppSavedReplyChoices } from "./reply-choices"
import {
  type WhatsAppReviewLinkRecoveryState,
  parseWhatsAppReviewLinkRecoveryIntent,
  planWhatsAppReviewLinkRecovery,
  renderWhatsAppReviewLinkStatus,
  renderWhatsAppWebReview,
  whatsAppReviewLinkChoiceIntent,
  whatsAppReviewLinkRecoveryParts,
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
