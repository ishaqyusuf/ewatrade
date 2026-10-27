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

  test("offers every bookable Service request for the selected offering, as the server allows", () => {
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
          {
            customerName: "Dayo",
            id: "withdrawn",
            lines: [{ offeringId: "service-a", offeringName: "Cut" }],
            status: "WITHDRAWN",
          },
          {
            customerName: "Efe",
            id: "converted",
            lines: [{ offeringId: "service-a", offeringName: "Cut" }],
            status: "CONVERTED",
          },
          {
            customerName: "Femi",
            id: "quoted",
            lines: [{ offeringId: "service-a", offeringName: "Cut" }],
            status: "QUOTED",
          },
        ],
        "service-a",
      ).map((request) => request.id),
    ).toEqual(["eligible", "converted", "quoted"])
  })
})
