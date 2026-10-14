import { expect, test } from "bun:test"
import { assistantMediaAvailability } from "./media-availability"

const stored = () => true

test("photos need the vision key on live data; QA uses the test reader", () => {
  expect(assistantMediaAvailability("LIVE", {}, stored)).toEqual({
    photos: false,
    files: true,
  })
  expect(
    assistantMediaAvailability("LIVE", { OPENAI_API_KEY: "sk-test" }, stored)
      .photos,
  ).toBe(true)
  expect(assistantMediaAvailability("QA", {}, stored).photos).toBe(true)
})

test("nothing is offered without storage", () => {
  expect(assistantMediaAvailability("QA", {}, () => false)).toEqual({
    photos: false,
    files: false,
  })
})

test("business-chat photo attachments need storage but no vision key", () => {
  expect(assistantMediaAvailability("LIVE", {}, () => true, true)).toEqual({
    photos: true,
    files: true,
  })
  expect(assistantMediaAvailability("LIVE", {}, () => false, true)).toEqual({
    photos: false,
    files: false,
  })
})
