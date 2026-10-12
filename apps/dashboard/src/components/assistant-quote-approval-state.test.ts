import { expect, test } from "bun:test"
import {
  assistantQuoteApprovalCloseParams,
  assistantQuoteApprovalOpenParams,
  assistantQuoteApprovalReadState,
  parseAssistantQuoteApproval,
} from "./assistant-quote-approval-state"

const target = {
  kind: "commerce_quote_approval" as const,
  approvalId: "decision-1",
  quoteId: "quote-1",
  quoteVersionId: "version-1",
}
const ready = {
  isPending: false,
  isFetching: false,
  isPaused: false,
  isError: false,
  isSuccess: true,
  isFetchedAfterMount: true,
  data: {
    id: target.approvalId,
    quoteId: target.quoteId,
    quoteVersionId: target.quoteVersionId,
  },
}

test("URL preserves the exact saved tuple; close only clears its owning parameter", () => {
  const opened = assistantQuoteApprovalOpenParams(target)
  expect(parseAssistantQuoteApproval(opened.assistantQuoteApproval)).toEqual(
    target,
  )
  for (const raw of [
    null,
    "",
    "not-json",
    "{}",
    JSON.stringify({ ...target, quoteVersionId: "" }),
    JSON.stringify({ ...target, tenantId: "spoofed" }),
  ]) {
    expect(parseAssistantQuoteApproval(raw)).toBeNull()
  }
  const workspace = {
    conversationId: "saved-chat",
    assistantDraft: "unsent",
    staffMember: "other",
    ...opened,
  }
  expect({ ...workspace, ...assistantQuoteApprovalCloseParams }).toEqual({
    ...workspace,
    assistantQuoteApproval: null,
  })
  expect(Object.keys(assistantQuoteApprovalCloseParams)).toEqual([
    "assistantQuoteApproval",
  ])
})

test("fetching, paused and pre-mount cached authority cannot reveal quote content", () => {
  expect(assistantQuoteApprovalReadState(target, ready)).toBe("ready")
  for (const field of ["isPending", "isFetching", "isPaused"] as const)
    expect(
      assistantQuoteApprovalReadState(target, { ...ready, [field]: true }),
    ).toBe("loading")
  expect(
    assistantQuoteApprovalReadState(target, {
      ...ready,
      isFetchedAfterMount: false,
    }),
  ).toBe("loading")
  expect(
    assistantQuoteApprovalReadState(target, { ...ready, isError: true }),
  ).toBe("unavailable")
})

test("a successful response must still match all original IDs before content is shown", () => {
  for (const field of ["id", "quoteId", "quoteVersionId"] as const)
    expect(
      assistantQuoteApprovalReadState(target, {
        ...ready,
        data: { ...ready.data, [field]: "later-or-foreign" },
      }),
    ).toBe("unavailable")
  expect(
    assistantQuoteApprovalReadState(target, { ...ready, data: undefined }),
  ).toBe("unavailable")
})
