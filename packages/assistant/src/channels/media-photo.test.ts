import { expect, test } from "bun:test"
import {
  isWhatsAppPhotoButton,
  parseWhatsAppPhotoButton,
  renderWhatsAppPhotoReview,
  whatsAppCaptionOrderNumbers,
  whatsAppPhotoChoiceText,
  whatsAppPhotoReviewButtons,
  whatsAppPhotoReviewContentSchema,
} from "./media"

const order = {
  id: "order-1",
  orderNumber: "S-1038",
  customerName: "Musa Ibrahim",
}

test("photo review matches the design copy, keeps one leading emoji and never claims a payment", () => {
  const body = renderWhatsAppPhotoReview(order)
  expect(body).toBe(
    "📎 Photo kept as sent. I don't read what's in photos.\n\nAttach it to ```S-1038``` · Musa Ibrahim?\n_Attaching doesn't record a payment._",
  )
  expect(renderWhatsAppPhotoReview({ ...order, customerName: null })).toContain(
    "Attach it to ```S-1038```?",
  )
  expect(
    renderWhatsAppPhotoReview({
      ...order,
      customerName: "Musa https://evil.example ```x",
    }),
  ).not.toContain("https://")
  expect(renderWhatsAppPhotoReview({ ...order, orderNumber: "```" })).toBeNull()
})

test("photo buttons are three, titles fit 20 characters and carry no authority", () => {
  const buttons = whatsAppPhotoReviewButtons(order)
  expect(buttons.map((button) => button.title)).toEqual([
    "Attach to S-1038",
    "Other order",
    "Discard",
  ])
  for (const button of buttons)
    expect(button.title.length).toBeLessThanOrEqual(20)
  expect(
    whatsAppPhotoReviewButtons({ orderNumber: "ORD-12345678901" })[0]?.title,
  ).toBe("Attach")
  expect(isWhatsAppPhotoButton("wa-photo:attach")).toBe(true)
  expect(isWhatsAppPhotoButton("wa-voice:use")).toBe(false)
  expect(parseWhatsAppPhotoButton("wa-photo:attach", "wamid.review")).toEqual({
    decision: "attach",
    replyToMessageId: "wamid.review",
  })
  expect(parseWhatsAppPhotoButton("wa-photo:discard", "wamid.review")).toEqual({
    decision: "discard",
    replyToMessageId: "wamid.review",
  })
  // Without the tapped message's context id there is nothing to bind to.
  expect(parseWhatsAppPhotoButton("wa-photo:attach")).toBeNull()
  expect(
    parseWhatsAppPhotoButton("wa-photo:confirm", "wamid.review"),
  ).toBeNull()
})

test("caption order references are matched exactly, bounded and never guessed", () => {
  expect(
    whatsAppCaptionOrderNumbers("transfer slip from Musa for S-1038"),
  ).toEqual(["S-1038"])
  expect(
    whatsAppCaptionOrderNumbers("receipt for ord-001 and ORD-001"),
  ).toEqual(["ORD-001"])
  expect(whatsAppCaptionOrderNumbers("paid 5000 on 2026-11-03")).toEqual([])
  expect(whatsAppCaptionOrderNumbers("ABC-12-34")).toEqual([])
  expect(whatsAppCaptionOrderNumbers(undefined)).toEqual([])
  expect(whatsAppCaptionOrderNumbers("A-1 B-2 C-3 D-4")).toHaveLength(3)
})

test("chosen photos become the owner's own request text for the canonical attach draft", () => {
  expect(whatsAppPhotoChoiceText("attach", order)).toBe(
    "Attach this photo to order S-1038.",
  )
  expect(whatsAppPhotoChoiceText("other", order)).toBe(
    "Attach this photo to a different order. Ask me which one.",
  )
})

test("stored photo review content is strict", () => {
  const review = {
    attachmentId: "attachment",
    contentDigest: "a".repeat(64),
    order,
    retentionUntil: "2026-12-03T12:00:00.000Z",
    authorityDigest: "b".repeat(64),
    expiresAt: "2026-11-04T12:00:00.000Z",
  }
  const source = {
    type: "media",
    media: { id: "media", mediaType: "image/jpeg", sourceType: "image" },
    text: "receipt for S-1038",
  }
  expect(
    whatsAppPhotoReviewContentSchema.safeParse({
      type: "photo_review",
      source,
      review,
    }).success,
  ).toBe(true)
  expect(
    whatsAppPhotoReviewContentSchema.safeParse({
      type: "photo_review",
      source,
      review: { ...review, approvalToken: "x" },
    }).success,
  ).toBe(false)
})
