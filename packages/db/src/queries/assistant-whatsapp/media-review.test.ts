import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { assistantAttachmentRequestId } from "../assistant-attachments"
import { assistantWhatsAppIngressActionContent } from "./inbox"
import { assistantWhatsAppVoiceAttachmentMatches } from "./media-review"
import { assistantWhatsAppMediaClientRequestId } from "./media-source"

const now = new Date("2026-10-15T12:00:00Z")
const transcript = "Record a sale for 500 naira after my review."
const row = {
  id: "audio-one",
  kind: "AUDIO",
  status: "READY",
  messageId: null,
  contentDigest: "a".repeat(64),
  transcript,
  processingAttempts: 2,
  retentionUntil: new Date(now.getTime() + 60_000),
}
const proof = {
  attachmentId: row.id,
  contentDigest: row.contentDigest,
  transcriptDigest: createHash("sha256").update(transcript).digest("hex"),
  processingGeneration: 2,
}

test("voice approval binds exact original content, transcript and processing generation", () => {
  expect(assistantWhatsAppVoiceAttachmentMatches(row, proof, now)).toBe(true)
  for (const changed of [
    { ...row, id: "different" },
    { ...row, kind: "IMAGE" },
    { ...row, status: "PROCESSING" },
    { ...row, messageId: "already-used" },
    { ...row, contentDigest: "b".repeat(64) },
    { ...row, transcript: `${transcript} Changed.` },
    { ...row, transcript: null },
    { ...row, processingAttempts: 3 },
    { ...row, retentionUntil: now },
  ])
    expect(assistantWhatsAppVoiceAttachmentMatches(changed, proof, now)).toBe(
      false,
    )
})

test("original provider event attachment identity survives retries and separates scope, message and media", () => {
  const source = assistantWhatsAppMediaClientRequestId(
    "123456789",
    "message",
    "media",
  )
  const scope = { tenantId: "tenant", storeId: "store", userId: "user" }
  const id = assistantAttachmentRequestId(scope, "chat", source)
  expect(assistantAttachmentRequestId(scope, "chat", source)).toBe(id)
  expect(
    assistantAttachmentRequestId({ ...scope, userId: "other" }, "chat", source),
  ).not.toBe(id)
  expect(
    assistantAttachmentRequestId(
      { ...scope, storeId: "other" },
      "chat",
      source,
    ),
  ).not.toBe(id)
  expect(assistantAttachmentRequestId(scope, "other-chat", source)).not.toBe(id)
  expect(
    assistantWhatsAppMediaClientRequestId(
      "123456789",
      "other-message",
      "media",
    ),
  ).not.toBe(source)
  expect(
    assistantWhatsAppMediaClientRequestId(
      "123456789",
      "message",
      "other-media",
    ),
  ).not.toBe(source)
  expect(
    assistantWhatsAppMediaClientRequestId("987654321", "message", "media"),
  ).not.toBe(source)
})

test("voice Use/Edit/Cancel grammar is reserved before action decision regex", () => {
  for (const text of [
    "Use transcript",
    "Edit transcript: Corrected message",
    "Cancel transcript",
    "Edit transcript:",
  ]) {
    expect(
      assistantWhatsAppIngressActionContent({
        type: "text",
        text,
        replyToMessageId: "exact-review",
      }),
    ).toBeNull()
  }
  expect(
    assistantWhatsAppIngressActionContent({
      type: "text",
      text: "Cancel guessed",
      replyToMessageId: "exact-review",
    }),
  ).toEqual({ type: "invalid_action" })
})
