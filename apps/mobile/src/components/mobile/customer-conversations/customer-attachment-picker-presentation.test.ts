import { describe, expect, test } from "bun:test"

import { resolveCustomerAttachmentPickerPresentation } from "./customer-attachment-picker-presentation"

describe("resolveCustomerAttachmentPickerPresentation", () => {
  test("projects equal private-media rows for the permitted attachment kinds", () => {
    expect(
      resolveCustomerAttachmentPickerPresentation({
        attachmentKinds: ["audio", "document", "image"],
        documentAvailable: true,
        requestLabel: "Prescription pickup",
      }),
    ).toEqual({
      description: "Choose what to attach to Prescription pickup.",
      items: [
        {
          accessibilityLabel:
            "Choose Photo. Choose an image from this device. Attach to Prescription pickup.",
          description: "Choose an image from this device",
          kind: "image",
          label: "Photo",
        },
        {
          accessibilityLabel:
            "Choose PDF document. Choose a private PDF file. Attach to Prescription pickup.",
          description: "Choose a private PDF file",
          kind: "document",
          label: "PDF document",
        },
      ],
      title: "Share privately",
    })
  })

  test("omits unavailable media without inventing a disabled action", () => {
    expect(
      resolveCustomerAttachmentPickerPresentation({
        attachmentKinds: ["image"],
        documentAvailable: false,
        requestLabel: "Request",
      }).items,
    ).toEqual([
      {
        accessibilityLabel:
          "Choose Photo. Choose an image from this device. Attach to Request.",
        description: "Choose an image from this device",
        kind: "image",
        label: "Photo",
      },
    ])
  })
})
