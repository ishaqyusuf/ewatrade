import { afterAll, expect, mock, test } from "bun:test"

type Payload = { action: string }
type StreamEvent = { type: string; delta?: string }
let drafts: Payload[] = []
let edits: Payload[] = []
let modelReached = false
let events: StreamEvent[] = []

// Keep executeGeneralTurn and all four actual deterministic handlers/classifiers.
// Only side-effect boundaries are replaced; no model, provider or DB is invoked.
mock.module("./general-context", () => ({
  requireGeneralScope: () => ({
    tenantId: "tenant",
    storeId: "store",
    userId: "owner",
  }),
  assertGeneralAction: () => {},
  canUseCapability: () => true,
}))
mock.module("./general-proposals", () => ({
  draftGeneralProposal: async (
    _ctx: unknown,
    _conversation: unknown,
    payload: Payload,
  ) => {
    drafts.push(payload)
    return { proposalId: "synthetic-proposal", payload, revision: 1 }
  },
  editGeneralProposal: async (
    _ctx: unknown,
    input: { proposalId: string; payload: Payload },
  ) => {
    edits.push(input.payload)
    return { id: input.proposalId, payload: input.payload, revision: 2 }
  },
  decideGeneralProposal: async () => {
    throw Error("A payment-link request cannot confirm a business write")
  },
  generalProposalForApp: () => {
    throw Error("No confirmation is expected")
  },
}))
mock.module("./general-simple-sale", () => ({
  simpleSaleOptions: async () => ({
    accounts: [
      { id: "bank", name: "Main bank", purpose: "BANK", paused: false },
    ],
    customers: [],
  }),
}))
mock.module("./general-simple-transfer", () => ({
  simpleTransferOptions: async () => ({ accounts: [] }),
}))
mock.module("./general-simple-money-in", () => ({
  moneyInOptions: async () => ({ accounts: [] }),
}))
mock.module("./general-simple-expense", () => ({
  simpleExpenseOptions: async () => ({ accounts: [], categories: [] }),
}))
mock.module("./channel-principal", () => ({
  isLinkedAssistantIdentity: () => false,
}))
mock.module("./channel-proposal-edit", () => ({
  hasCurrentWhatsAppEdit: async () => false,
}))
mock.module("./general-tools", () => ({
  createGeneralTools: () => ({ prepareOrder: {} }),
}))
mock.module("./general-persistence", () => ({
  generalProposalReferencePart: () => undefined,
}))
mock.module("./general-announced-action", () => ({
  streamGeneralReply: async () => {
    modelReached = true
  },
}))
mock.module("ai", () => ({
  ToolLoopAgent: class {},
  stepCountIs: () => () => false,
}))

const { executeGeneralTurn } = await import("./general-turn-execution")
type Input = Parameters<typeof executeGeneralTurn>[0]

type Pending = {
  id: string
  revision: number
  status: string
  action: string
  payload: Payload
}
const pendingSale: Pending = {
  id: "pending-sale",
  revision: 1,
  status: "PENDING",
  action: "sale_record",
  payload: {
    action: "sale_record",
    receivedMinor: 10000,
    moneyAccountId: "bank",
    accountName: "Main bank",
    customerChoice: "walk_in",
    description: "Inspection visit",
  } as Payload,
}

afterAll(() => mock.restore())

async function route(
  text: string,
  options: {
    pending?: Pending
    choice?: { proposalId: string; revision: number; text: string }
  } = {},
) {
  drafts = []
  edits = []
  events = []
  modelReached = false
  await executeGeneralTurn({
    ctx: {
      session: {},
      tenantContext: {
        tenant: { name: "QA", currencyCode: "NGN", timezone: "Africa/Lagos" },
        membership: { role: "OWNER" },
        activeStore: { name: "Main", currencyCode: "NGN" },
      },
      db: {
        assistantActionProposal: {
          findFirst: async ({ where }: { where: Record<string, unknown> }) => {
            const pending = options.pending
            if (!pending) return null
            if (where.action && where.action !== pending.action) return null
            if (where.id && where.id !== pending.id) return null
            if (where.revision && where.revision !== pending.revision)
              return null
            return pending
          },
        },
      },
    },
    body: { message: { id: "new-message" }, saleChoice: options.choice },
    model: { model: {} },
    conversationId: "synthetic-chat",
    runId: "run",
    budget: { remainingRequests: 10 },
    textParts: [{ type: "text", text }],
    attachments: [],
    stored: [],
    messages: [],
    writer: { write: (event: StreamEvent) => events.push(event) },
    signal: new AbortController().signal,
    onUsage: () => {},
  } as unknown as Input)
  return {
    modelReached,
    draftActions: drafts.map((payload) => payload.action),
    editActions: edits.map((payload) => payload.action),
    deterministicReply: events
      .filter((event) => event.type === "text-delta")
      .map((event) => event.delta ?? "")
      .join(""),
  }
}

const requests = [
  {
    name: "exact named service payment-link request",
    text: "Prepare one new payment link for service FCA-20261026 Inspection visit on order ORD-059, using Manual payment QA 26 Oct. Allow partial payments, valid for 24 hours. Nothing should be sent.",
  },
  {
    name: "minimal existing-Order payment-link request",
    text: "Create a payment link for order ORD-059",
  },
  {
    name: "unpaid-today payment-link baseline",
    text: "Create payment links for unpaid orders created today, using Manual payment QA 26 Oct.",
  },
] as const

for (const request of requests)
  test(`${request.name} reaches model/tools without creating a simple money draft`, async () => {
    expect(await route(request.text)).toEqual({
      modelReached: true,
      draftActions: [],
      editActions: [],
      deterministicReply: "",
    })
  })

for (const action of [
  "sale_record",
  "money_transfer_simple",
  "expense_record_simple",
  "money_in_record",
])
  test(`a payment-link request leaves an unrelated pending ${action} untouched`, async () => {
    const pending: Pending =
      action === "sale_record"
        ? pendingSale
        : {
            id: `pending-${action}`,
            revision: 1,
            status: "PENDING",
            action,
            payload: { action },
          }
    expect(await route(requests[0].text, { pending })).toEqual({
      modelReached: true,
      draftActions: [],
      editActions: [],
      deterministicReply: "",
    })
  })

test("an ordinary new sale still uses its real deterministic collector", async () => {
  expect(await route("Record a sale")).toEqual({
    modelReached: false,
    draftActions: ["sale_record"],
    editActions: [],
    deterministicReply: "How much?",
  })
})

test("a structured choice retains ownership even when raw message text mentions a payment link", async () => {
  expect(
    await route(requests[0].text, {
      pending: pendingSale,
      choice: {
        proposalId: pendingSale.id,
        revision: 1,
        text: "Use account: bank",
      },
    }),
  ).toEqual({
    modelReached: false,
    draftActions: [],
    editActions: ["sale_record"],
    deterministicReply: "Review the sale, then save it.",
  })
})

test("an explicitly directed sale description containing payment link retains its owner", async () => {
  expect(
    await route(
      "Continue sale pending-sale: description: Payment link printing service",
      { pending: pendingSale },
    ),
  ).toEqual({
    modelReached: false,
    draftActions: [],
    editActions: ["sale_record"],
    deterministicReply: "Review the sale, then save it.",
  })
})
