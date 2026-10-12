import { expect, test } from "bun:test"
import { preserveReviewedTimestamp } from "./posting-date"

test("native date normalization does not silently change a reviewed posting instant", () => {
  const original = "2026-10-10T12:00:00.123Z"
  expect(
    preserveReviewedTimestamp(new Date("2026-10-10T12:00Z"), original),
  ).toBe(original)
  expect(
    preserveReviewedTimestamp(new Date("2026-10-10T12:00:00Z"), original),
  ).toBe(original)
  const seconds = "2026-10-10T12:00:45.987Z"
  expect(
    preserveReviewedTimestamp(new Date("2026-10-10T12:00:45Z"), seconds),
  ).toBe(seconds)
})
test("changed date or second uses the selected UTC instant", () => {
  const original = "2026-10-10T12:00:00.123Z"
  expect(
    preserveReviewedTimestamp(new Date("2026-10-10T12:00:01Z"), original),
  ).toBe("2026-10-10T12:00:01.000Z")
  expect(
    preserveReviewedTimestamp(new Date("2026-10-11T12:00Z"), original),
  ).toBe("2026-10-11T12:00:00.000Z")
})
