import { expect, test } from "bun:test"
import {
  nextGeneralReadRequest,
  parseGeneralReadContinuation,
} from "../general/read-continuation"
import {
  parseWhatsAppReadPageIntent,
  previousWhatsAppReadRequest,
  whatsAppOrderReadContinuation,
  whatsAppReadPageButtons,
} from "./read-pagination"

function page(input: Record<string, unknown>, nextCursor: string | null) {
  const value = parseGeneralReadContinuation({
    version: 1,
    tool: "readOrders",
    input,
    nextCursor,
  })
  if (!value) throw new Error("Invalid local read fixture")
  return value
}
test("native paging accepts only exact source/reply/direction; unrelated typed input stays ordinary", () => {
  expect(
    parseWhatsAppReadPageIntent({
      quickActionId: "wa-read:wa-out_local:next",
      replyToMessageId: "wamid.saved",
    }),
  ).toEqual({
    kind: "read_page",
    direction: "next",
    sourceOutboxId: "wa-out_local",
    replyToMessageId: "wamid.saved",
  })
  expect(
    parseWhatsAppReadPageIntent({ quickActionId: "wa-read:wa-out_local:next" }),
  ).toEqual({ kind: "invalid_read_page" })
  expect(
    parseWhatsAppReadPageIntent({
      quickActionId: "wa-read:wa-out_local:confirm",
      replyToMessageId: "wamid.saved",
    }),
  ).toEqual({ kind: "invalid_read_page" })
  expect(parseWhatsAppReadPageIntent({ text: "next" })).toBeNull()
  expect(
    parseWhatsAppReadPageIntent({
      text: "transfer 5000",
      replyToMessageId: "wamid.saved",
    }),
  ).toBeNull()
  expect(
    parseWhatsAppReadPageIntent({
      text: "Previous page",
      replyToMessageId: "wamid.saved",
    }),
  ).toMatchObject({ kind: "read_page", direction: "previous" })
})
test("next preserves exact filters; previous requires an actual saved matching cursor", () => {
  const first = page({ query: "Buyer", statuses: ["CONFIRMED"] }, "order-five")
  const second = page(
    { query: "Buyer", statuses: ["CONFIRMED"], cursor: "order-five" },
    "order-ten",
  )
  const other = page(
    { query: "Other buyer", statuses: ["CONFIRMED"] },
    "order-five",
  )
  expect(nextGeneralReadRequest(first)).toEqual({
    tool: "readOrders",
    input: { query: "Buyer", statuses: ["CONFIRMED"], cursor: "order-five" },
  })
  expect(previousWhatsAppReadRequest(second, [other])).toBeUndefined()
  expect(previousWhatsAppReadRequest(second, [other, first])).toEqual({
    tool: "readOrders",
    input: { query: "Buyer", statuses: ["CONFIRMED"] },
  })
  expect(previousWhatsAppReadRequest(first, [other])).toBeUndefined()
  expect(
    whatsAppReadPageButtons("saved-outbox", second, true).map(
      (button) => button.title,
    ),
  ).toEqual(["Next page", "Previous page"])
  expect(
    whatsAppReadPageButtons("saved-outbox", page({}, null), false),
  ).toEqual([])
})
test("only one validated committed Orders answer is eligible; arbitrary tool claims cannot page", () => {
  const answer = {
    type: "data-general-answer",
    data: { continuation: page({}, "next") },
  }
  expect(whatsAppOrderReadContinuation([answer])?.tool).toBe("readOrders")
  expect(whatsAppOrderReadContinuation([answer, answer])).toBeUndefined()
  expect(
    whatsAppOrderReadContinuation([{ type: "text", data: answer.data }]),
  ).toBeUndefined()
  expect(
    whatsAppOrderReadContinuation([
      {
        type: "data-general-answer",
        data: {
          continuation: {
            version: 1,
            tool: "draftAction",
            input: { action: "sale_record" },
            nextCursor: "fake",
          },
        },
      },
    ]),
  ).toBeUndefined()
})
