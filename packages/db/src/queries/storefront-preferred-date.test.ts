import { expect, test } from "bun:test"
import {
  storefrontPreferredDate,
  storefrontPreferredTime,
} from "./storefront-preferred-date"

test("preorder dates use the business day rather than the customer's UTC day", () => {
  const now = new Date("2026-10-28T23:30:00Z")
  expect(() =>
    storefrontPreferredDate("2026-10-29", "Africa/Lagos", now),
  ).toThrow("after today")
  expect(
    storefrontPreferredDate(
      "2026-10-29",
      "America/Los_Angeles",
      now,
    ).toISOString(),
  ).toBe("2026-10-29T12:00:00.000Z")
})

test("service preferences preserve the business timezone and refuse DST folds/gaps", () => {
  expect(
    storefrontPreferredTime(
      "2026-10-29",
      "10:15",
      "Africa/Lagos",
      new Date("2026-10-28T10:00:00Z"),
    ).toISOString(),
  ).toBe("2026-10-29T09:15:00.000Z")
  expect(() =>
    storefrontPreferredTime(
      "2026-11-01",
      "01:30",
      "America/New_York",
      new Date("2026-10-28T10:00:00Z"),
    ),
  ).toThrow("ambiguous")
  expect(() =>
    storefrontPreferredTime(
      "2027-03-14",
      "02:30",
      "America/New_York",
      new Date("2026-10-28T10:00:00Z"),
    ),
  ).toThrow("unavailable")
})

test("invalid, normalized, past and unbounded dates refuse", () => {
  const now = new Date("2026-10-28T10:00:00Z")
  for (const date of [
    "2026-02-30",
    "2026-13-01",
    "2026-10-28",
    "tomorrow",
    "2027-10-29",
  ])
    expect(() => storefrontPreferredDate(date, "Africa/Lagos", now)).toThrow()
  expect(
    storefrontPreferredDate("2026-10-29", "Africa/Lagos", now).toISOString(),
  ).toBe("2026-10-29T12:00:00.000Z")
})
