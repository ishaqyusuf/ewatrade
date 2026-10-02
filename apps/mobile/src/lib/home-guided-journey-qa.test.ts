import { expect, test } from "bun:test"
import { resolveHomeGuidedJourneyQaPath } from "./home-guided-journey-qa"

test("Home scenario links are unavailable outside development", () => {
  expect(
    resolveHomeGuidedJourneyQaPath(
      "ewatrade-dev://home-guided-journey?state=first-order",
      false,
    ),
  ).toBeNull()
})
test("Home scenario links reject unrelated or invalid inputs", () => {
  expect(resolveHomeGuidedJourneyQaPath("bad-url", true)).toBeNull()
  expect(
    resolveHomeGuidedJourneyQaPath(
      "https://home-guided-journey?state=first-order",
      true,
    ),
  ).toBeNull()
  expect(
    resolveHomeGuidedJourneyQaPath(
      "ewatrade-dev://home-guided-journey?state=not-a-scene",
      true,
    ),
  ).toBeNull()
})
test("Home scenario links normalize theme and bounded preference scope", () => {
  expect(
    resolveHomeGuidedJourneyQaPath(
      "ewatrade-dev://home-guided-journey?state=first-order&theme=dark&scope=store-b",
      true,
    ),
  ).toBe(
    "/design-system/home-guided-journey?state=first-order&theme=dark&scope=store-b",
  )
  expect(
    resolveHomeGuidedJourneyQaPath(
      "ewatrade-dev://home-guided-journey?state=first-order&scope=unexpected",
      true,
    ),
  ).toBe(
    "/design-system/home-guided-journey?state=first-order&theme=light&scope=a",
  )
})
