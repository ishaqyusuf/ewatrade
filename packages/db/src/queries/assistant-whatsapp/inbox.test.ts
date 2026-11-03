import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import {
  acceptAssistantWhatsAppIngress,
  assistantWhatsAppIngressActionContent,
  assistantWhatsAppPhotoIngressContent,
} from "./inbox"

const now = new Date("2026-10-15T09:00:00Z")
const base = {
  phoneNumberId: "123456789",
  senderId: "2348000000000",
  providerMessageId: "wamid.synthetic",
  timestamp: String(now.getTime() / 1000),
  type: "text",
  text: "search rice",
}
test("invalid, expired and future ingress is rejected before database access", async () => {
  let transactions = 0
  const db = {
    $transaction: async () => {
      transactions++
      throw Error("must not read database")
    },
  } as unknown as PrismaClient
  expect(
    await acceptAssistantWhatsAppIngress(
      db,
      { ...base, actorUserId: "foreign" },
      ["pilot"],
      now,
    ),
  ).toMatchObject({ kind: "ignored", reason: "invalid" })
  expect(
    await acceptAssistantWhatsAppIngress(
      db,
      { ...base, timestamp: String(now.getTime() / 1000 - 86401) },
      ["pilot"],
      now,
    ),
  ).toMatchObject({ kind: "ignored", reason: "stale" })
  expect(
    await acceptAssistantWhatsAppIngress(
      db,
      { ...base, timestamp: String(now.getTime() / 1000 + 301) },
      ["pilot"],
      now,
    ),
  ).toMatchObject({ kind: "ignored", reason: "stale" })
  expect(transactions).toBe(0)
})

test("photo choice buttons never become executable action decisions", () => {
  for (const quickActionId of [
    "wa-photo:attach",
    "wa-photo:other",
    "wa-photo:discard",
    "wa-photo:unknown",
    "wa-photo-order:1",
    "wa-photo-order:none",
    "wa-photo-order:x",
  ])
    expect(
      assistantWhatsAppIngressActionContent({
        type: "interactive",
        quickActionId,
        replyToMessageId: "wamid.review",
      }),
    ).toBeNull()
})

test("photo order list rows bind to the tapped list message and carry only a position", () => {
  expect(
    assistantWhatsAppPhotoIngressContent({
      quickActionId: "wa-photo-order:3",
      replyToMessageId: "wamid.list",
    }),
  ).toEqual({
    type: "photo_order_choice",
    choice: { row: 3, replyToMessageId: "wamid.list" },
  })
  expect(
    assistantWhatsAppPhotoIngressContent({
      quickActionId: "wa-photo-order:none",
      replyToMessageId: "wamid.list",
    }),
  ).toEqual({
    type: "photo_order_choice",
    choice: { row: "none", replyToMessageId: "wamid.list" },
  })
  for (const quickActionId of [
    "wa-photo-order:0",
    "wa-photo-order:10",
    "wa-photo-order:order-id",
  ])
    expect(
      assistantWhatsAppPhotoIngressContent({
        quickActionId,
        replyToMessageId: "wamid.list",
      }),
    ).toEqual({ type: "invalid_photo_choice" })
  // Without the list message's context id there is nothing to bind to.
  expect(
    assistantWhatsAppPhotoIngressContent({ quickActionId: "wa-photo-order:1" }),
  ).toEqual({ type: "invalid_photo_choice" })
  expect(
    assistantWhatsAppPhotoIngressContent({
      quickActionId: "wa-photo:other",
      replyToMessageId: "wamid.review",
    }),
  ).toEqual({
    type: "photo_choice",
    choice: { decision: "other", replyToMessageId: "wamid.review" },
  })
  expect(assistantWhatsAppPhotoIngressContent({})).toBeNull()
})
