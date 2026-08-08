import { describe, expect, test } from "bun:test"

import {
  averageDurationMs,
  prescriptionReviewDurationPairs,
} from "./prescription-reporting"

describe("prescription reporting definitions", () => {
  test("uses only completed non-negative lifecycle durations", () => {
    expect(
      averageDurationMs([
        {
          endedAt: new Date("2026-08-08T10:05:00Z"),
          startedAt: new Date("2026-08-08T10:00:00Z"),
        },
        {
          endedAt: null,
          startedAt: new Date("2026-08-08T10:00:00Z"),
        },
      ]),
    ).toBe(300_000)
  })

  test("uses canonical received and pharmacist-review audit timestamps", () => {
    expect(
      averageDurationMs(
        prescriptionReviewDurationPairs([
          {
            auditEvents: [
              {
                effectiveAt: new Date("2026-08-08T10:00:00Z"),
                type: "RECEIVED",
              },
              {
                effectiveAt: new Date("2026-08-08T10:07:00Z"),
                type: "PHARMACIST_REVIEWED",
              },
            ],
            createdAt: new Date("2026-08-08T09:59:00Z"),
          },
        ]),
      ),
    ).toBe(420_000)
  })
})
