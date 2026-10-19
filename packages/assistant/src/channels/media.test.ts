import { expect, test } from "bun:test"
import {
  parseWhatsAppVoiceChoice,
  renderWhatsAppVoiceReview,
  whatsAppMediaPolicy,
  whatsAppMediaSchema,
} from "./media"

test("media policy uses canonical limits and forbids audio masquerading as a document", () => {
  expect(
    whatsAppMediaPolicy({
      id: "id",
      mediaType: "audio/ogg; codecs=opus",
      sourceType: "audio",
      voice: true,
    }),
  ).toMatchObject({
    kind: "AUDIO",
    contentType: "audio/ogg",
    maxBytes: 10 * 1024 * 1024,
  })
  expect(
    whatsAppMediaPolicy({
      id: "id",
      mediaType: "audio/ogg",
      sourceType: "document",
    }),
  ).toBeNull()
  expect(
    whatsAppMediaPolicy({
      id: "id",
      mediaType: "image/png",
      sourceType: "audio",
    }),
  ).toBeNull()
  expect(
    whatsAppMediaPolicy({
      id: "id",
      mediaType: "application/zip",
      sourceType: "document",
    }),
  ).toBeNull()
  expect(
    whatsAppMediaSchema.safeParse({
      id: "id",
      mediaType: "image/png",
      url: "https://private.test",
    }).success,
  ).toBe(false)
  expect(
    whatsAppMediaPolicy({
      id: "id",
      mediaType: "text/plain",
      sourceType: "document",
      fileName: "../<original>.txt",
    })?.fileName,
  ).toBe("original.txt")
})

test("only explicit complete quoted transcript choices can enter the review path", () => {
  expect(parseWhatsAppVoiceChoice("Use transcript", "accepted-review")).toEqual(
    { decision: "use", replyToMessageId: "accepted-review" },
  )
  expect(
    parseWhatsAppVoiceChoice(
      "Edit transcript:  Received 500 naira\nfrom Musa",
      "accepted-review",
    ),
  ).toEqual({
    decision: "edit",
    replyToMessageId: "accepted-review",
    text: "Received 500 naira\nfrom Musa",
  })
  expect(
    parseWhatsAppVoiceChoice("Cancel transcript", "accepted-review")?.decision,
  ).toBe("cancel")
  for (const text of [
    "500",
    "Use",
    "yes",
    "Choose 1",
    "Edit transcript:",
    "Use transcript and pay now",
  ])
    expect(parseWhatsAppVoiceChoice(text, "accepted-review")).toBeNull()
  expect(parseWhatsAppVoiceChoice("Use transcript")).toBeNull()
})

test("review preserves the whole original transcript and refuses oversized approval", () => {
  const transcript = "Original voice text\nincluding the final line."
  expect(renderWhatsAppVoiceReview(transcript)).toContain(transcript)
  expect(renderWhatsAppVoiceReview("x".repeat(2001))).toBeNull()
  expect(renderWhatsAppVoiceReview(" ")).toBeNull()
  expect(renderWhatsAppVoiceReview("Hidden \u202eamount")).toBeNull()
  expect(renderWhatsAppVoiceReview("Open https://untrusted.example")).toBeNull()
})
