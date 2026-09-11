import { describe, expect, test } from "bun:test"
import type { StoreConversationAttachmentDraft } from "@ewatrade/utils"

import { projectCustomerVoicePreviewPresentation } from "./customer-voice-preview-presentation"

const selected: StoreConversationAttachmentDraft = {
  failureMessage: null,
  file: {
    kind: "audio",
    localReference: "device-private://voice-note",
    mimeType: "audio/mp4",
    name: "voice-note.m4a",
    size: 84_000,
  },
  operationId: "voice-preview",
  progress: 0,
  status: "selected",
}

describe("projectCustomerVoicePreviewPresentation", () => {
  test("presents a selected local note as private and ready to send", () => {
    expect(
      projectCustomerVoicePreviewPresentation(selected, "Prescription pickup"),
    ).toEqual({
      accessibilityLabel:
        "voice-note.m4a. For Prescription pickup. Ready to send privately.",
      pauseLabel:
        "Pause voice note preview. voice-note.m4a. For Prescription pickup. Ready to send privately.",
      playLabel:
        "Play voice note preview. voice-note.m4a. For Prescription pickup. Ready to send privately.",
      removeLabel: "Remove voice-note.m4a",
      retryLabel: null,
    })
  })

  test("keeps uploading and failed recovery states explicit", () => {
    expect(
      projectCustomerVoicePreviewPresentation(
        { ...selected, progress: 67, status: "uploading" },
        "Prescription pickup",
      ),
    ).toMatchObject({
      removeLabel: "Cancel voice-note.m4a upload",
      retryLabel: null,
      accessibilityLabel:
        "voice-note.m4a. For Prescription pickup. 67% uploaded.",
    })
    expect(
      projectCustomerVoicePreviewPresentation(
        {
          ...selected,
          failureMessage: "Upload interrupted. Try again.",
          status: "failed",
        },
        "Prescription pickup",
      ),
    ).toMatchObject({
      removeLabel: "Remove voice-note.m4a",
      retryLabel: "Retry voice-note.m4a",
      accessibilityLabel:
        "voice-note.m4a. For Prescription pickup. Upload interrupted. Try again.",
    })
  })
})
