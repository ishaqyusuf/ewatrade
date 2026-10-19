import { expect, test } from "bun:test"
import { whatsAppIngressSchema } from "./ingress"
const input = {
  phoneNumberId: "123456789",
  senderId: "2348000000000",
  providerMessageId: "wamid.synthetic",
  timestamp: "1792050000",
  type: "text",
  text: "123456",
}

test("normalized ingress accepts a linked business amount without treating it as identity proof", () => {
  expect(whatsAppIngressSchema.parse(input).text).toBe("123456")
  expect(
    whatsAppIngressSchema.safeParse({ ...input, actorUserId: "foreign" })
      .success,
  ).toBe(false)
  for (const value of [
    { ...input, text: " " },
    { ...input, timestamp: undefined },
    { ...input, providerMessageId: "a".repeat(257) },
    { ...input, text: "a".repeat(8001) },
    { ...input, type: "interactive" },
    { ...input, type: "media" },
  ])
    expect(whatsAppIngressSchema.safeParse(value).success).toBe(false)
  expect(
    whatsAppIngressSchema.safeParse({
      ...input,
      type: "interactive",
      quickActionId: "opaque-review",
      replyToMessageId: "original-review",
    }).success,
  ).toBe(true)
  expect(
    whatsAppIngressSchema.safeParse({
      ...input,
      type: "media",
      media: {
        id: "provider-media",
        mediaType: "image/jpeg",
        url: "https://untrusted.test",
      },
    }).success,
  ).toBe(false)
})
