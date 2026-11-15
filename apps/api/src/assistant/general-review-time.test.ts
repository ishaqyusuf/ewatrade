import { expect, test } from "bun:test"
import { generalReviewTime } from "./general-review-time"

test("review lines show the posting time in the book's timezone", () => {
  expect(generalReviewTime("2026-11-14T17:01:00.000Z", "Africa/Lagos")).toBe(
    "14 Nov 2026, 6:01 pm",
  )
  expect(generalReviewTime("2026-11-14T09:05:00.000Z", "Africa/Lagos")).toBe(
    "14 Nov 2026, 10:05 am",
  )
})

test("an unknown timezone falls back to UTC instead of failing", () => {
  expect(generalReviewTime("2026-11-14T17:01:00.000Z", "Not/AZone")).toBe(
    "14 Nov 2026, 5:01 pm",
  )
  expect(generalReviewTime("nope", "Africa/Lagos")).toBe("Posting date pending")
})
