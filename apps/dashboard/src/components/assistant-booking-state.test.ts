import { expect, test } from "bun:test"
import {
  assistantBookingCloseParams,
  assistantBookingOpenParams,
  assistantBookingReadState,
  parseAssistantBooking,
} from "./assistant-booking-state"

const target = {
  kind: "service_booking" as const,
  bookingId: "booking-1",
  sourceId: "source-1",
  offeringId: "offering-1",
}
const ready = {
  isPending: false,
  isFetching: false,
  isPaused: false,
  isError: false,
  isSuccess: true,
  isFetchedAfterMount: true,
  data: {
    id: target.bookingId,
    sourceId: target.sourceId,
    offeringId: target.offeringId,
  },
}

test("URL preserves the exact saved tuple; close only clears its owning parameter", () => {
  const opened = assistantBookingOpenParams(target)
  expect(parseAssistantBooking(opened.assistantBooking)).toEqual(target)
  for (const raw of [
    null,
    "",
    "not-json",
    "{}",
    JSON.stringify({ ...target, offeringId: "" }),
    JSON.stringify({ ...target, tenantId: "spoofed" }),
  ]) {
    expect(parseAssistantBooking(raw)).toBeNull()
  }
  const workspace = {
    conversationId: "saved-chat",
    assistantDraft: "unsent",
    staffMember: "other",
    ...opened,
  }
  expect({ ...workspace, ...assistantBookingCloseParams }).toEqual({
    ...workspace,
    assistantBooking: null,
  })
  expect(Object.keys(assistantBookingCloseParams)).toEqual(["assistantBooking"])
})

test("fetching, paused and pre-mount cached authority cannot reveal booking content", () => {
  expect(assistantBookingReadState(target, ready)).toBe("ready")
  for (const field of ["isPending", "isFetching", "isPaused"] as const)
    expect(assistantBookingReadState(target, { ...ready, [field]: true })).toBe(
      "loading",
    )
  expect(
    assistantBookingReadState(target, {
      ...ready,
      isFetchedAfterMount: false,
    }),
  ).toBe("loading")
  expect(assistantBookingReadState(target, { ...ready, isError: true })).toBe(
    "unavailable",
  )
})

test("a successful response must still match all original IDs before content is shown", () => {
  for (const field of ["id", "sourceId", "offeringId"] as const)
    expect(
      assistantBookingReadState(target, {
        ...ready,
        data: { ...ready.data, [field]: "later-or-foreign" },
      }),
    ).toBe("unavailable")
  expect(assistantBookingReadState(target, { ...ready, data: undefined })).toBe(
    "unavailable",
  )
})
