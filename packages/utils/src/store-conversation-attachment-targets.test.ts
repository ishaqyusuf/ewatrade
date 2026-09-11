import { describe, expect, test } from "bun:test"
import {
  canSelectStoreConversationAttachment,
  resolveStoreConversationAttachmentTargets,
  storeConversationAttachmentTargetRequiresConsent,
} from "./store-conversation-attachment-targets"

describe("Store conversation attachment targets", () => {
  test("keeps exact active revisions and offers supported first Requests", () => {
    expect(
      resolveStoreConversationAttachmentTargets({
        availableRequestKinds: ["product_inquiry", "prescription"],
        requests: [
          {
            id: "inquiry-1",
            kind: "commerce_inquiry",
            label: "Blue bag",
            lifecycle: "active",
            revision: 4,
          },
          {
            id: "service-closed",
            kind: "service_request",
            label: "Old repair",
            lifecycle: "terminal",
            revision: 7,
          },
        ],
      }),
    ).toEqual([
      {
        key: JSON.stringify({
          kind: "existing_request",
          request: {
            id: "inquiry-1",
            kind: "commerce_inquiry",
            revision: 4,
          },
        }),
        label: "Blue bag",
        target: {
          kind: "existing_request",
          request: {
            id: "inquiry-1",
            kind: "commerce_inquiry",
            revision: 4,
          },
        },
      },
      {
        key: JSON.stringify({ kind: "new_commerce_inquiry" }),
        label: "New product Request",
        target: { kind: "new_commerce_inquiry" },
      },
      {
        key: JSON.stringify({ kind: "new_prescription_request" }),
        label: "New prescription Request",
        target: { kind: "new_prescription_request" },
      },
    ])
  })

  test("does not invent a new Service Request from media", () => {
    expect(
      resolveStoreConversationAttachmentTargets({
        availableRequestKinds: ["service"],
        requests: [],
      }),
    ).toEqual([])
  })

  test("requires explicit consent only for a new Prescription Request", () => {
    const newPrescription = { kind: "new_prescription_request" } as const
    const existingPrescription = {
      kind: "existing_request",
      request: {
        id: "prescription-1",
        kind: "prescription_request",
        revision: 2,
      },
    } as const

    expect(
      storeConversationAttachmentTargetRequiresConsent(newPrescription),
    ).toBe(true)
    expect(
      storeConversationAttachmentTargetRequiresConsent(existingPrescription),
    ).toBe(false)
    expect(
      canSelectStoreConversationAttachment({
        capabilityAvailable: true,
        prescriptionConsentAccepted: false,
        target: newPrescription,
      }),
    ).toBe(false)
    expect(
      canSelectStoreConversationAttachment({
        capabilityAvailable: true,
        prescriptionConsentAccepted: true,
        target: newPrescription,
      }),
    ).toBe(true)
  })
})
