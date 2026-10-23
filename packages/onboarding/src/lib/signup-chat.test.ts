import { expect, test } from "bun:test"
import {
  isSignupChatCompletion,
  signupChatDetails,
  signupChatProgress,
} from "./signup-chat"
const details = {
  businessName: "Sample bakery",
  name: "Sample owner",
  email: "owner@example.test",
  requestedSlug: "sample-bakery",
  ageBand: "ADULT",
}
test("registration requires eligible age and valid exact business details", () => {
  expect(signupChatDetails.safeParse(details).success).toBe(true)
  for (const patch of [
    { ageBand: "UNDER_13" },
    { email: "invalid" },
    { requestedSlug: "dashboard" },
    { requestedSlug: "customer-pos" },
    { businessName: "" },
    { token: "private" },
  ])
    expect(signupChatDetails.safeParse({ ...details, ...patch }).success).toBe(
      false,
    )
})
test("completion messages are presentation-only and require exact frame source and origin", () => {
  const source = {}
  const event = {
    origin: "https://dash.ewatrade.com",
    source,
    data: { type: "ewatrade.signup-chat.completed" },
  }
  expect(isSignupChatCompletion(event, event.origin, source)).toBe(true)
  expect(
    isSignupChatCompletion(
      { ...event, origin: "https://foreign.example" },
      event.origin,
      source,
    ),
  ).toBe(false)
  expect(
    isSignupChatCompletion({ ...event, source: {} }, event.origin, source),
  ).toBe(false)
  expect(
    isSignupChatCompletion(
      { ...event, data: { ...event.data, token: "private" } },
      event.origin,
      source,
    ),
  ).toBe(false)
  expect(
    signupChatProgress.safeParse({
      type: "ewatrade.signup-chat.progress",
      action: "confirm",
      email: "private@example.test",
      code: "123456",
    }).success,
  ).toBe(false)
})
