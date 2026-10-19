import { expect, mock, test } from "bun:test"
import type { GeneralContext } from "./general-context"

const scope = { tenantId: "tenant", storeId: "store", userId: "user" }
mock.module("./general-context", () => ({
  assertGeneralAction: () => {},
  requireGeneralScope: () => scope,
}))
let pending: {
  id: string
  revision: number
  status: string
  action: string
  payload: unknown
} | null = null
mock.module("./general-proposals", () => ({
  decideGeneralProposal: async () => {
    throw Error("Confirmation must not run")
  },
  generalProposalForApp: () => {
    throw Error("Confirmation must not run")
  },
  draftGeneralProposal: async (
    _ctx: unknown,
    _conversation: string,
    payload: unknown,
  ) => ({ proposalId: "new-proposal", payload }),
  editGeneralProposal: async (
    _ctx: unknown,
    input: { proposalId: string; payload: unknown },
  ) => ({ id: input.proposalId, payload: input.payload }),
}))
const { handleSimpleExpenseChat } = await import(
  "./general-simple-expense-chat"
)
const { handleSimpleMoneyInChat } = await import(
  "./general-simple-money-in-chat"
)
const ctx = {
  tenantContext: { tenant: { currencyCode: "NGN" } },
  db: { assistantActionProposal: { findFirst: async () => pending } },
} as unknown as GeneralContext

for (const flow of [
  {
    action: "expense_record_simple",
    handle: handleSimpleExpenseChat,
    start: "spent 100",
    payload: {
      action: "expense_record_simple",
      amountMinor: 100,
      attachmentIds: [],
    },
  },
  {
    action: "money_in_record",
    handle: handleSimpleMoneyInChat,
    start: "put 100 into cash",
    payload: { action: "money_in_record", amountMinor: 100, attachmentIds: [] },
  },
]) {
  test(`${flow.action} retains the proposal identity after a draft edit`, async () => {
    pending = {
      id: "existing-proposal",
      revision: 2,
      status: "PENDING",
      action: flow.action,
      payload: flow.payload,
    }
    const result = await flow.handle(ctx, {
      conversationId: "conversation",
      messageId: "edit-message",
      text: "200",
      imageIds: [],
      history: [],
    })
    expect(result?.proposalId).toBe("existing-proposal")
  })
  test(`${flow.action} retains the identity returned by new draft creation`, async () => {
    pending = null
    const result = await flow.handle(ctx, {
      conversationId: "conversation",
      messageId: "new-message",
      text: flow.start,
      imageIds: [],
      history: [],
    })
    expect(result?.proposalId).toBe("new-proposal")
  })
}
