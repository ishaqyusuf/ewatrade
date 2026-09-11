import { describe, expect, test } from "bun:test"

import {
  DEFAULT_STORE_CONVERSATION_WEEKLY_HOURS,
  evaluateStoreConversationAvailability,
  storeConversationAvailabilityScheduleCommandSchema,
  storeConversationWeeklyHoursSchema,
} from "."

describe("Store Conversation availability", () => {
  test("accepts bounded non-overlapping weekly hours and rejects invalid configuration", () => {
    expect(
      storeConversationWeeklyHoursSchema.parse([
        { dayOfWeek: 1, endMinute: 720, startMinute: 540 },
        { dayOfWeek: 1, endMinute: 1020, startMinute: 780 },
      ]),
    ).toHaveLength(2)
    expect(
      storeConversationWeeklyHoursSchema.safeParse([
        { dayOfWeek: 1, endMinute: 720, startMinute: 540 },
        { dayOfWeek: 1, endMinute: 800, startMinute: 700 },
      ]).success,
    ).toBe(false)
    expect(
      storeConversationAvailabilityScheduleCommandSchema.safeParse({
        clientOperationId: "availability-operation-1",
        expectedRevision: 0,
        reason: "Set customer response hours",
        storeId: "store-1",
        timezone: "Not/A_Timezone",
        weeklyHours: DEFAULT_STORE_CONVERSATION_WEEKLY_HOURS,
      }).success,
    ).toBe(false)
  })

  test("keeps the additive default available when current server gates pass", () => {
    expect(
      evaluateStoreConversationAvailability({
        chatEnabled: true,
        eligibleAttendant: true,
        eligibleVerticals: ["service"],
        manualPaused: false,
        now: new Date("2026-08-14T09:00:00.000Z"),
        profileReady: true,
        timezone: "Africa/Lagos",
        weeklyHours: DEFAULT_STORE_CONVERSATION_WEEKLY_HOURS,
      }),
    ).toEqual({
      available: true,
      customerMessage: null,
      reason: null,
      recovery: [],
      reopensAt: null,
      state: "available",
    })
  })

  test("projects an exact next opening only when schedule is the sole blocker", () => {
    const projection = evaluateStoreConversationAvailability({
      chatEnabled: true,
      eligibleAttendant: true,
      eligibleVerticals: ["service"],
      manualPaused: false,
      now: new Date("2026-08-14T18:30:00.000Z"),
      profileReady: true,
      timezone: "Africa/Lagos",
      weeklyHours: [
        { dayOfWeek: 5, endMinute: 1020, startMinute: 540 },
        { dayOfWeek: 6, endMinute: 720, startMinute: 600 },
      ],
    })

    expect(projection).toMatchObject({
      available: false,
      reason: "outside_service_hours",
      recovery: ["view_history", "wait_until_reopen", "notify_when_available"],
      state: "unavailable_until",
    })
    expect(projection.reopensAt).toEqual(new Date("2026-08-15T09:00:00.000Z"))
  })

  test("fails closed indefinitely without leaking staffing, professional, policy, or pause detail", () => {
    for (const input of [
      {
        chatEnabled: true,
        eligibleAttendant: false,
        eligibleVerticals: ["service" as const],
        manualPaused: false,
        profileReady: true,
      },
      {
        chatEnabled: true,
        eligibleAttendant: true,
        eligibleVerticals: [] as const,
        manualPaused: false,
        profileReady: true,
      },
      {
        chatEnabled: true,
        eligibleAttendant: true,
        eligibleVerticals: ["pharmacy" as const],
        manualPaused: true,
        profileReady: true,
      },
    ]) {
      const serialized = JSON.stringify(
        evaluateStoreConversationAvailability({
          ...input,
          customerWording: "temporarily_unavailable",
          now: new Date("2026-08-14T09:00:00.000Z"),
          timezone: "Africa/Lagos",
          weeklyHours: DEFAULT_STORE_CONVERSATION_WEEKLY_HOURS,
        }),
      )
      expect(serialized).not.toContain("membership")
      expect(serialized).not.toContain("licence")
      expect(serialized).not.toContain("policy")
      expect(serialized).not.toContain("incident")
      expect(JSON.parse(serialized)).toMatchObject({
        available: false,
        reopensAt: null,
        state: "unavailable_indefinitely",
      })
    }
  })

  test("does not mislabel a manual pause as scheduled outside hours", () => {
    expect(
      evaluateStoreConversationAvailability({
        chatEnabled: true,
        customerWording: "outside_service_hours",
        eligibleAttendant: true,
        eligibleVerticals: ["service"],
        manualPaused: true,
        now: new Date("2026-08-14T09:00:00.000Z"),
        profileReady: true,
        timezone: "Africa/Lagos",
        weeklyHours: DEFAULT_STORE_CONVERSATION_WEEKLY_HOURS,
      }),
    ).toMatchObject({
      customerMessage:
        "The Store is not accepting new chat messages right now.",
      reason: "store_temporarily_unavailable",
    })
  })

  test("resolves DST spring-forward and fall-back openings deterministically", () => {
    const spring = evaluateStoreConversationAvailability({
      chatEnabled: true,
      eligibleAttendant: true,
      eligibleVerticals: ["service"],
      manualPaused: false,
      now: new Date("2026-03-08T06:50:00.000Z"),
      profileReady: true,
      timezone: "America/New_York",
      weeklyHours: [{ dayOfWeek: 0, endMinute: 240, startMinute: 150 }],
    })
    expect(spring.reopensAt).toEqual(new Date("2026-03-08T07:00:00.000Z"))

    const fall = evaluateStoreConversationAvailability({
      chatEnabled: true,
      eligibleAttendant: true,
      eligibleVerticals: ["service"],
      manualPaused: false,
      now: new Date("2026-11-01T04:30:00.000Z"),
      profileReady: true,
      timezone: "America/New_York",
      weeklyHours: [{ dayOfWeek: 0, endMinute: 120, startMinute: 90 }],
    })
    expect(fall.reopensAt).toEqual(new Date("2026-11-01T05:30:00.000Z"))
  })
})
