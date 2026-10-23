import { expect, mock, test } from "bun:test"
import { simpleSaleAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralContext } from "../general-context"

const edits: Array<{ proposalId: string; revision: number; payload: unknown }> =
  []
mock.module("../general-context", () => ({
  assertGeneralAction: () => {},
  requireGeneralScope: () => ({
    tenantId: "business",
    storeId: "store",
    userId: "owner",
  }),
}))
mock.module("../general-proposals", () => ({
  draftGeneralProposal: async () => {
    throw Error("A correction cannot create another draft")
  },
  editGeneralProposal: async (_ctx: unknown, input: (typeof edits)[number]) => {
    edits.push(input)
    return {
      id: input.proposalId,
      revision: input.revision + 1,
      payload: input.payload,
    }
  },
}))
mock.module("../general-simple-sale", () => ({
  simpleSaleOptions: async () => ({ accounts: [], customers: [] }),
}))

const { handleSimpleSaleChat } = await import("../general-simple-sale-chat")
const original = simpleSaleAction.parse({
  action: "sale_record",
  moneyAccountId: "cash",
  accountName: "Shop cash",
  receivedMinor: 100000,
  customerChoice: "walk_in",
})
const ctx = {
  session: { user: { id: "owner" }, session: { id: "browser" } },
  db: {
    assistantActionProposal: {
      findFirst: async () => ({
        id: "same-draft",
        revision: 4,
        status: "PENDING",
        action: "sale_record",
        payload: original,
      }),
    },
  },
} as unknown as GeneralContext

test("bundled fields and plain descriptions retain exact pending proposal identity and quantities", async () => {
  const outcomes = []
  for (const text of [
    "1. Description: Eggs\n2. Received: 5000",
    "2 bags of rice",
  ]) {
    const result = await handleSimpleSaleChat(ctx, {
      conversationId: "chat",
      messageId: "message",
      text,
      imageIds: [],
      history: [],
    })
    outcomes.push({ result, edit: edits.at(-1) })
  }
  expect(outcomes[0]).toMatchObject({
    result: { proposalId: "same-draft", proposalSource: { revision: 5 } },
    edit: {
      proposalId: "same-draft",
      revision: 4,
      payload: {
        description: "Eggs",
        receivedMinor: 500000,
        moneyAccountId: "cash",
        customerChoice: "walk_in",
      },
    },
  })
  expect(outcomes[1]).toMatchObject({
    edit: {
      proposalId: "same-draft",
      payload: {
        description: "2 bags of rice",
        receivedMinor: 100000,
        moneyAccountId: "cash",
      },
    },
  })
})
