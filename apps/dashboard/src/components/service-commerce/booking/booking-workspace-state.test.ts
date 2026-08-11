import { describe, expect, test } from "bun:test"

import {
  eligibleBookingSources,
  mergeBookingResources,
} from "./booking-workspace-state"

describe("booking workspace state", () => {
  test("keeps configured and newly-created resources selectable", () => {
    expect(
      mergeBookingResources(
        [{ capacity: 1, id: "room-a", label: "Room A" }],
        [
          { capacity: 2, id: "room-b", label: "Room B" },
          { capacity: 3, id: "room-a", label: "Room A updated" },
        ],
      ),
    ).toEqual([
      { capacity: 3, id: "room-a", label: "Room A updated" },
      { capacity: 2, id: "room-b", label: "Room B" },
    ])
  })

  test("offers only active Service requests containing the selected offering", () => {
    expect(
      eligibleBookingSources(
        [
          {
            customerName: "Ada",
            id: "eligible",
            lines: [{ offeringId: "service-a", offeringName: "Cut" }],
            status: "SUBMITTED",
          },
          {
            customerName: "Bisi",
            id: "wrong-offering",
            lines: [{ offeringId: "service-b", offeringName: "Colour" }],
            status: "SUBMITTED",
          },
          {
            customerName: "Chidi",
            id: "declined",
            lines: [{ offeringId: "service-a", offeringName: "Cut" }],
            status: "DECLINED",
          },
        ],
        "service-a",
      ).map((request) => request.id),
    ).toEqual(["eligible"])
  })
})
