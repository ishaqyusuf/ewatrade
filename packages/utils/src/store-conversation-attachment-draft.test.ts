import { describe, expect, test } from "bun:test"
import {
  createStoreConversationAttachmentDraft,
  reduceStoreConversationAttachmentDraft,
  resolveStoreConversationComposerAction,
} from "./store-conversation-attachment-draft"

const policy = {
  acceptedMimeTypes: [
    "image/jpeg",
    "image/png",
    "application/pdf",
    "audio/mp4",
  ],
  allowedKinds: ["image", "document", "audio"] as const,
  maxAudioBytes: 5_000_000,
  maxBytes: 10 * 1024 * 1024,
}

describe("Store conversation attachment draft", () => {
  test("accepts a permitted local image without projecting it as sent", () => {
    const result = createStoreConversationAttachmentDraft({
      file: {
        localReference: "device-private://photo-1",
        mimeType: "image/jpeg",
        name: "medicine.jpg",
        size: 1_024,
      },
      operationId: "operation-1",
      policy,
    })

    expect(result).toEqual({
      draft: {
        failureMessage: null,
        file: {
          kind: "image",
          localReference: "device-private://photo-1",
          mimeType: "image/jpeg",
          name: "medicine.jpg",
          size: 1_024,
        },
        operationId: "operation-1",
        progress: 0,
        status: "selected",
      },
      ok: true,
    })
  })

  test("rejects unsupported MIME and oversized files as picker hints", () => {
    expect(
      createStoreConversationAttachmentDraft({
        file: {
          localReference: "device-private://word-document",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          name: "request.docx",
          size: 500,
        },
        operationId: "operation-word",
        policy: {
          ...policy,
          acceptedMimeTypes: [
            ...policy.acceptedMimeTypes,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ],
        },
      }),
    ).toEqual({
      message: "This file type is not permitted for this Request.",
      ok: false,
    })

    expect(
      createStoreConversationAttachmentDraft({
        file: {
          localReference: "device-private://script",
          mimeType: "text/javascript",
          name: "script.js",
          size: 100,
        },
        operationId: "operation-2",
        policy,
      }),
    ).toEqual({
      message: "This file type is not permitted for this Request.",
      ok: false,
    })

    expect(
      createStoreConversationAttachmentDraft({
        file: {
          localReference: "device-private://large",
          mimeType: "application/pdf",
          name: "large.pdf",
          size: policy.maxBytes + 1,
        },
        operationId: "operation-3",
        policy,
      }),
    ).toEqual({
      message: "Choose a file smaller than 10 MB.",
      ok: false,
    })
  })

  test("keeps one operation id through upload failure and retry", () => {
    const selected = createStoreConversationAttachmentDraft({
      file: {
        localReference: "device-private://document",
        mimeType: "application/pdf",
        name: "request.pdf",
        size: 500,
      },
      operationId: "stable-operation",
      policy,
    })
    if (!selected.ok) throw new Error("Expected a draft")

    const uploading = reduceStoreConversationAttachmentDraft(selected.draft, {
      type: "upload_started",
    })
    const progressed = reduceStoreConversationAttachmentDraft(uploading, {
      progress: 67,
      type: "upload_progressed",
    })
    const failed = reduceStoreConversationAttachmentDraft(progressed, {
      message: "Upload interrupted. Try again.",
      type: "upload_failed",
    })
    const retried = reduceStoreConversationAttachmentDraft(failed, {
      type: "upload_retried",
    })

    expect(progressed.progress).toBe(67)
    expect(failed.status).toBe("failed")
    expect(retried).toMatchObject({
      failureMessage: null,
      operationId: "stable-operation",
      progress: 0,
      status: "selected",
    })
  })

  test("accepts a bounded voice note and applies the smaller audio limit", () => {
    expect(
      createStoreConversationAttachmentDraft({
        file: {
          localReference: "device-private://voice-note",
          mimeType: "audio/mp4",
          name: "voice-note.m4a",
          size: 4_000_000,
        },
        operationId: "operation-voice",
        policy,
      }),
    ).toMatchObject({
      draft: { file: { kind: "audio" }, status: "selected" },
      ok: true,
    })

    expect(
      createStoreConversationAttachmentDraft({
        file: {
          localReference: "device-private://voice-note-large",
          mimeType: "audio/mp4",
          name: "voice-note.m4a",
          size: 5_000_001,
        },
        operationId: "operation-voice-large",
        policy,
      }),
    ).toEqual({
      message: "Choose a voice note smaller than 4.8 MB.",
      ok: false,
    })
  })

  test("cancel returns to a removable local draft and composer action is honest", () => {
    const selected = createStoreConversationAttachmentDraft({
      file: {
        localReference: "device-private://photo",
        mimeType: "image/png",
        name: "item.png",
        size: 500,
      },
      operationId: "operation-4",
      policy,
    })
    if (!selected.ok) throw new Error("Expected a draft")

    const uploading = reduceStoreConversationAttachmentDraft(selected.draft, {
      type: "upload_started",
    })
    const cancelled = reduceStoreConversationAttachmentDraft(uploading, {
      type: "upload_cancelled",
    })

    expect(cancelled.status).toBe("selected")
    expect(resolveStoreConversationComposerAction("", cancelled, false)).toBe(
      "send",
    )
    expect(resolveStoreConversationComposerAction("", uploading, false)).toBe(
      "cancel",
    )
    expect(resolveStoreConversationComposerAction("", null, false)).toBe("idle")
    expect(resolveStoreConversationComposerAction("hello", null, true)).toBe(
      "disabled",
    )
  })
})
