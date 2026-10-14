import { describe, expect, test } from "bun:test"
import type { BusinessActivityView } from "@ewatrade/notifications/business-events"

import {
  activityAuthor,
  activityStatusTone,
  activityTitle,
  formatActivityAmount,
  groupActivityByDay,
  recordedThroughAssistant,
  showActivityStore,
  splitActivitySummary,
  wasRecordedLater,
} from "./activity-format"

const tz = "Africa/Lagos"
const now = new Date("2026-10-14T11:30:00+01:00")

function event(patch: Partial<BusinessActivityView>): BusinessActivityView {
  return {
    key: "evt",
    type: "order.recorded",
    category: "orders",
    occurredAt: "2026-10-14T10:42:00+01:00",
    recordedAt: "2026-10-14T10:42:00+01:00",
    actor: {
      kind: "staff",
      membershipId: "m-1",
      name: "Ishaq Yusuf",
      coverage: "recorded",
    },
    subject: null,
    store: { id: "s-1", name: "Main Store" },
    summary: "Ishaq Yusuf recorded order ORD-009",
    detail: "Walk-in",
    amount: { minor: "90000", currencyCode: "NGN" },
    statusAtEvent: { domain: "order", value: "CONFIRMED" },
    currentStatus: null,
    target: { kind: "order", id: "o-9" },
    canOpen: true,
    coverage: "snapshot",
    origin: null,
    ...patch,
  }
}

describe("Activity presentation helpers", () => {
  test("groups by Business day with Today and Yesterday headings", () => {
    const groups = groupActivityByDay(
      [
        event({ key: "a" }),
        // 23:30 UTC on the 12th is already the 13th in Lagos.
        event({ key: "b", occurredAt: "2026-10-12T23:30:00Z" }),
        event({ key: "c", occurredAt: "2026-10-12T10:00:00+01:00" }),
      ],
      tz,
      now,
    )
    expect(groups.map((g) => [g.title, g.items.map((i) => i.key)])).toEqual([
      ["Today", ["a"]],
      ["Yesterday", ["b"]],
      ["Mon 12 Oct", ["c"]],
    ])
  })

  test("emphasises only a recorded actor that leads the summary", () => {
    expect(splitActivitySummary(event({}))).toEqual({
      actor: "Ishaq Yusuf",
      rest: " recorded order ORD-009",
    })
    expect(
      splitActivitySummary(
        event({
          actor: {
            kind: "unknown",
            membershipId: null,
            name: null,
            coverage: "unavailable",
          },
          summary: "Stock receipt recorded",
        }),
      ),
    ).toEqual({ actor: null, rest: "Stock receipt recorded" })
  })

  test("formats exact minor units in the event currency", () => {
    expect(formatActivityAmount(event({}))).toBe("₦900.00")
    expect(
      formatActivityAmount(
        event({ amount: { minor: "-250000", currencyCode: "ZAR" } }),
      ),
    ).toContain("2,500.00")
  })

  test("flags backdated facts and negative current statuses", () => {
    expect(
      wasRecordedLater(
        event({
          occurredAt: "2026-10-12T18:30:00+01:00",
          recordedAt: "2026-10-13T09:12:00+01:00",
        }),
        tz,
      ),
    ).toBe(true)
    expect(wasRecordedLater(event({}), tz)).toBe(false)
    expect(activityStatusTone("REVERSED")).toBe("negative")
    expect(activityStatusTone("CONFIRMED")).toBe("neutral")
  })

  test("shows the Assistant flag only from a recorded origin", () => {
    expect(recordedThroughAssistant(event({}))).toBe(false)
    expect(
      recordedThroughAssistant(event({ origin: { channel: "assistant" } })),
    ).toBe(true)
    expect(
      recordedThroughAssistant(event({ origin: { channel: "pos" } })),
    ).toBe(false)
  })

  test("titles drop the author, who moves to the subtitle", () => {
    expect(activityTitle(event({}))).toBe("Order ORD-009")
    expect(
      activityTitle(
        event({ summary: "Ishaq Yusuf recorded payment for ORD-031" }),
      ),
    ).toBe("Payment for ORD-031")
    expect(
      activityTitle(event({ summary: "Ishaq Yusuf accepted an invitation" })),
    ).toBe("Accepted an invitation")
    expect(activityAuthor(event({}))).toBe("Ishaq Yusuf")
    const unknown = event({
      actor: {
        kind: "unknown",
        membershipId: null,
        name: null,
        coverage: "unavailable",
      },
      summary: "stock receipt recorded",
    })
    expect(activityTitle(unknown)).toBe("Stock receipt recorded")
    expect(activityAuthor(unknown)).toBe("Unknown person")
  })

  test("rows name the Store only with several Stores and no single-Store filter", () => {
    expect(showActivityStore(1, 0)).toBe(false)
    expect(showActivityStore(3, 0)).toBe(true)
    expect(showActivityStore(3, 1)).toBe(false)
    expect(showActivityStore(3, 2)).toBe(true)
    expect(showActivityStore(null, 0)).toBe(true)
  })

  test("the viewer's own actions read You", () => {
    expect(activityAuthor(event({}), "m-1")).toBe("You")
    expect(activityAuthor(event({}), "m-2")).toBe("Ishaq Yusuf")
    expect(activityAuthor(event({}), null)).toBe("Ishaq Yusuf")
  })
})
