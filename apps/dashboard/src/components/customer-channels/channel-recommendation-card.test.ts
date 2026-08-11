import { describe, expect, test } from "bun:test"

import { getChannelRecommendationView } from "./channel-recommendation-card"

describe("Customer Channel recommendation card", () => {
  test("renders typed central routing guidance without runtime authority", () => {
    expect(
      getChannelRecommendationView({
        advisoryOnly: true,
        attendantMode: "team_attendants",
        authorizationEffect: "none",
        connectionMode: "central_with_branch_choice",
        policyReviewRequired: false,
        reasons: ["onboarding_whatsapp", "multi_store_team"],
        recommendedChannels: ["web", "whatsapp"],
        setupSteps: [
          "connect_whatsapp",
          "assign_attendants",
          "configure_store_routing",
          "publish_entry_point",
        ],
      }),
    ).toEqual({
      attendantLabel: "Team attendants",
      channelLabel: "Web + WhatsApp",
      routingLabel: "Central connection with branch choice",
      steps: [
        "Connect and test a WhatsApp number",
        "Assign the people who will answer customers",
        "Confirm which Store receives each conversation",
        "Publish the Store link and QR code",
      ],
    })
  })
})
