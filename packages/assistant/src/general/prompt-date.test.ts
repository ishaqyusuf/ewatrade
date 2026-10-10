import { expect, test } from "bun:test"
import { generalInstructions, generalLocalNow } from "./prompt"

// Production 10 Oct 2026: "How much did we sell today?" got a question back
// asking for the date and time zone. The prompt now carries both.
test("the prompt states the local date and time zone", () => {
  const instant = new Date("2026-10-10T18:15:00Z")
  const local = generalLocalNow("Africa/Lagos", instant)
  expect(local).toEqual({
    now: "Sat 10 Oct 2026, 19:15",
    timeZone: "Africa/Lagos",
  })
  const prompt = generalInstructions({
    businessName: "Shop",
    storeName: "Main",
    currencyCode: "NGN",
    role: "OWNER",
    ...local,
  })
  expect(prompt).toContain("It is now Sat 10 Oct 2026, 19:15 in Africa/Lagos.")
  expect(prompt).toContain("never ask the user for the date or time zone")
})

test("an invalid time zone falls back to UTC", () => {
  expect(
    generalLocalNow("Not/AZone", new Date("2026-10-10T23:30:00Z")),
  ).toEqual({ now: "Sat 10 Oct 2026, 23:30", timeZone: "UTC" })
})
