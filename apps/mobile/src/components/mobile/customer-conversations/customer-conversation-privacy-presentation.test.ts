import { describe, expect, test } from "bun:test"

import {
  CUSTOMER_CONVERSATION_PRIVACY_OPTIONS,
  formatCustomerConversationPrivacyOutcome,
  projectCustomerConversationPrivacyRequestStatus,
  projectCustomerConversationPrivacySubmit,
} from "./customer-conversation-privacy-presentation"

describe("customer conversation privacy presentation", () => {
  test("describes erasable and retained classifications truthfully", () => {
    expect(CUSTOMER_CONVERSATION_PRIVACY_OPTIONS).toEqual([
      {
        description: "Replace presentation text with a neutral placeholder.",
        label: "Chat messages",
        value: "presentation_message",
      },
      {
        description: "Remove eligible non-clinical files and audio.",
        label: "Generic attachments",
        value: "generic_media",
      },
      {
        description: "Revoke verified notification destinations.",
        label: "Notification contacts",
        value: "verified_contact",
      },
      {
        description: "End guest-device access; account access remains.",
        label: "Guest devices",
        value: "guest_credential",
      },
      {
        description:
          "Check which commercial, clinical, and audit records must stay.",
        label: "Required records",
        value: "commercial_record",
      },
    ])
  })

  test("formats every server outcome without claiming total deletion", () => {
    expect(
      formatCustomerConversationPrivacyOutcome({
        classification: "presentation_message",
        status: "removed",
      }),
    ).toBe("Chat messages: removed")
    expect(
      formatCustomerConversationPrivacyOutcome({
        classification: "commercial_record",
        status: "retained_required",
      }),
    ).toBe("Required records: retained as required")
    expect(
      formatCustomerConversationPrivacyOutcome({
        classification: "generic_media",
        status: "unavailable",
      }),
    ).toBe("Generic attachments: unavailable")
  })

  test("keeps queued and completed request summaries classification-specific", () => {
    expect(
      projectCustomerConversationPrivacyRequestStatus({
        outcomes: [],
        status: null,
      }),
    ).toEqual({
      detail: "Your request is queued. Refresh to see each category’s result.",
      title: "Privacy request submitted",
      tone: "success",
    })

    expect(
      projectCustomerConversationPrivacyRequestStatus({
        outcomes: [
          {
            classification: "presentation_message",
            status: "removed",
          },
          {
            classification: "commercial_record",
            status: "retained_required",
          },
        ],
        status: "completed",
      }),
    ).toEqual({
      detail: "Chat messages: removed · Required records: retained as required",
      title: "Privacy request completed",
      tone: "success",
    })

    expect(
      projectCustomerConversationPrivacyRequestStatus({
        outcomes: [],
        readError: true,
        status: null,
      }),
    ).toEqual({
      detail: "We couldn't refresh this request. Try again.",
      title: "Privacy status unavailable",
      tone: "destructive",
    })

    expect(
      projectCustomerConversationPrivacyRequestStatus({
        outcomes: [],
        status: "failed",
      }),
    ).toEqual({
      detail:
        "This request could not be completed. Try again or contact support.",
      title: "Privacy request needs attention",
      tone: "destructive",
    })
  })

  test("disables duplicate and in-flight privacy submissions", () => {
    expect(
      projectCustomerConversationPrivacySubmit({
        hasSelection: true,
        pending: false,
        submitted: false,
      }),
    ).toEqual({ disabled: false, label: "Request privacy review" })
    expect(
      projectCustomerConversationPrivacySubmit({
        hasSelection: true,
        pending: true,
        submitted: false,
      }),
    ).toEqual({ disabled: true, label: "Requesting review…" })
    expect(
      projectCustomerConversationPrivacySubmit({
        hasSelection: true,
        pending: false,
        submitted: true,
      }),
    ).toEqual({ disabled: true, label: "Review requested" })
  })
})
