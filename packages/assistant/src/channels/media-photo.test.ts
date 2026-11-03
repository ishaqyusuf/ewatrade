import { expect, test } from "bun:test"
import {
  WHATSAPP_PHOTO_ORDER_LIST_MAX,
  isWhatsAppPhotoButton,
  isWhatsAppPhotoOrderRow,
  parseWhatsAppPhotoButton,
  parseWhatsAppPhotoOrderRow,
  renderWhatsAppPhotoReview,
  whatsAppCaptionOrderNumbers,
  whatsAppPhotoChoiceText,
  whatsAppPhotoOrderList,
  whatsAppPhotoOrderListFallback,
  whatsAppPhotoOrderOfferContentSchema,
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

const chidi = {
  id: "order-2",
  orderNumber: "S-1042",
  customerName: "Chidi Eze",
  totalMinor: 15_600_000,
  currencyCode: "NGN",
}
const offered = [
  chidi,
  {
    id: "order-1",
    orderNumber: "S-1038",
    customerName: "Musa Ibrahim",
    totalMinor: 6_200_050,
    currencyCode: "NGN",
  },
]

test("Other order list: order-number titles, customer and total descriptions, Not listed last, Meta limits", () => {
  const list = whatsAppPhotoOrderList(offered, "Yaba Main")
  expect(list).toEqual({
    body: "Which order is the photo for?",
    button: "Choose order",
    sectionTitle: "Orders · Yaba Main",
    rows: [
      {
        id: "wa-photo-order:1",
        title: "S-1042",
        description: "Chidi Eze · ₦156,000",
      },
      {
        id: "wa-photo-order:2",
        title: "S-1038",
        description: "Musa Ibrahim · ₦62,000.50",
      },
      {
        id: "wa-photo-order:none",
        title: "Not listed",
        description: "Tell me which order it's for",
      },
    ],
  })
  expect(
    whatsAppPhotoOrderList(offered, "A very long store name indeed")
      ?.sectionTitle,
  ).toBe("Orders")
  const many = Array.from({ length: 12 }, (_, index) => ({
    ...chidi,
    id: `order-${index}`,
    orderNumber: `S-${2000 + index}`,
    customerName: `${"Customer ".repeat(12)}${index}`,
  }))
  const capped = whatsAppPhotoOrderList(
    many.slice(0, WHATSAPP_PHOTO_ORDER_LIST_MAX),
  )
  expect(capped?.rows).toHaveLength(10)
  for (const row of capped?.rows ?? []) {
    expect(row.title.length).toBeLessThanOrEqual(24)
    expect(row.description.length).toBeLessThanOrEqual(72)
    expect(row.id.length).toBeLessThanOrEqual(200)
  }
  expect(whatsAppPhotoOrderList([])).toBeNull()
  // An order number that cannot be a row title is never silently offered.
  expect(
    whatsAppPhotoOrderList([{ ...chidi, orderNumber: "S-".padEnd(30, "1") }]),
  ).toBeNull()
  expect(whatsAppPhotoOrderListFallback(offered)).toBe(
    "Which order is the photo for?\n\n- S-1042 · Chidi Eze · ₦156,000\n- S-1038 · Musa Ibrahim · ₦62,000.50\n\nTo attach it, send the photo again with the order number in the caption.",
  )
})

test("list rows are positions bound to the tapped list message, never order ids", () => {
  expect(isWhatsAppPhotoOrderRow("wa-photo-order:1")).toBe(true)
  expect(isWhatsAppPhotoOrderRow("wa-photo:other")).toBe(false)
  expect(isWhatsAppPhotoButton("wa-photo-order:1")).toBe(false)
  expect(parseWhatsAppPhotoOrderRow("wa-photo-order:9", "wamid.list")).toEqual({
    row: 9,
    replyToMessageId: "wamid.list",
  })
  expect(
    parseWhatsAppPhotoOrderRow("wa-photo-order:none", "wamid.list"),
  ).toEqual({ row: "none", replyToMessageId: "wamid.list" })
  for (const id of [
    "wa-photo-order:0",
    "wa-photo-order:10",
    "wa-photo-order:order-2",
  ])
    expect(parseWhatsAppPhotoOrderRow(id, "wamid.list")).toBeNull()
  expect(parseWhatsAppPhotoOrderRow("wa-photo-order:1")).toBeNull()
  expect(whatsAppPhotoChoiceText("other")).toBe(
    "Attach this photo to a different order. Ask me which one.",
  )
})

test("stored order offer content is strict and bounded", () => {
  const content = {
    type: "photo_order_offer",
    choice: { decision: "other", replyToMessageId: "wamid.review" },
    offer: {
      sourceInboxId: "inbox",
      attachmentId: "attachment",
      contentDigest: "a".repeat(64),
      orders: offered,
      retentionUntil: "2026-12-03T12:00:00.000Z",
      authorityDigest: "b".repeat(64),
      expiresAt: "2026-11-04T12:00:00.000Z",
    },
  }
  expect(whatsAppPhotoOrderOfferContentSchema.safeParse(content).success).toBe(
    true,
  )
  expect(
    whatsAppPhotoOrderOfferContentSchema.safeParse({
      ...content,
      offer: { ...content.offer, orders: [] },
    }).success,
  ).toBe(false)
  expect(
    whatsAppPhotoOrderOfferContentSchema.safeParse({
      ...content,
      offer: {
        ...content.offer,
        orders: Array.from({ length: 10 }, () => chidi),
      },
    }).success,
  ).toBe(false)
  expect(
    whatsAppPhotoOrderOfferContentSchema.safeParse({
      ...content,
      offer: { ...content.offer, rowToken: "x" },
    }).success,
  ).toBe(false)
})
