import { describe, expect, test } from "bun:test"

import {
  channelRecommendationSummary,
  chatHoursSummary,
  connectionStoresLabel,
} from "./channel-settings-labels"

const recommendation = {
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
} as const

describe("Customer channels settings copy", () => {
  test("sums up the onboarding suggestion in one plain sentence", () => {
    expect(channelRecommendationSummary(recommendation)).toBe(
      "Suggested when you signed up: one WhatsApp number for all your stores, and your team replies. This is only a suggestion; nothing is turned on.",
    )
    expect(
      channelRecommendationSummary({
        ...recommendation,
        attendantMode: "owner_attendant",
        connectionMode: "store_specific",
        policyReviewRequired: true,
      }),
    ).toBe(
      "Suggested when you signed up: one WhatsApp number for each store, and you reply. This is only a suggestion; nothing is turned on. Pharmacy stores also need the pharmacy compliance check.",
    )
  })

  test("names the stores a number serves", () => {
    expect(connectionStoresLabel([])).toBe("Not used by any store yet")
    expect(connectionStoresLabel([{ name: "Ikeja" }])).toBe("Used by Ikeja")
    expect(
      connectionStoresLabel([
        { name: "Ikeja" },
        { name: "Lekki" },
        { name: "Yaba" },
      ]),
    ).toBe("Used by Ikeja, Lekki and Yaba")
  })

  test("summarises weekly chat hours Monday first", () => {
    const weekdays = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      endMinute: 18 * 60,
      startMinute: 8 * 60,
    }))
    expect(chatHoursSummary(weekdays)).toBe("Mon–Fri, 8am–6pm")
    expect(
      chatHoursSummary([
        ...weekdays,
        { dayOfWeek: 6, endMinute: 13 * 60 + 30, startMinute: 9 * 60 },
      ]),
    ).toBe("Mon–Fri, 8am–6pm · Sat, 9am–1:30pm")
    expect(chatHoursSummary([])).toBe("Closed every day")
    expect(
      chatHoursSummary(
        [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          dayOfWeek,
          endMinute: 1440,
          startMinute: 0,
        })),
      ),
    ).toBe("All day, every day")
    expect(
      chatHoursSummary([{ dayOfWeek: 0, endMinute: 1440, startMinute: 600 }]),
    ).toBe("Sun, 10am–midnight")
  })
})
