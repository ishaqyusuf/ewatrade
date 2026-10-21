import { afterAll, beforeAll, expect, test } from "bun:test"
import { generalActionSchema } from "@ewatrade/assistant/general/contracts"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralTransactionContext } from "./general-actions"
import type { GeneralContext } from "./general-context"
import type { CurrentGeneralDraft } from "./general-current-draft"
import { createGeneralDraftCorrection } from "./general-draft-correction"

type Dependencies = NonNullable<
  Parameters<typeof createGeneralDraftCorrection>[1]
>
const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "correction-test-key-at-least-thirty-two-bytes"
})
afterAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
})
const turn = {
  conversationId: "current-conversation",
  runId: "current-running-turn",
}
const payload = generalActionSchema.parse({
  action: "product_create",
  name: "Egg",
  canonicalUnitName: "Egg",
  priceMinor: 15000,
  openingStock: "750",
})
if (payload.action !== "product_create") throw Error("Product fixture required")
const product = payload
function fixture() {
  const ctx = {
    db: {},
    session: { user: { id: "actor" }, session: { id: "browser-session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "business",
        dataClassification: "QA",
        retailOpsPlanId: "pro",
        currencyCode: "NGN",
      },
      membership: { id: "membership", role: "OWNER" },
      activeStore: { id: "store", name: "Main", currencyCode: "NGN" },
      stores: [{ id: "store" }],
      staffAccess: {
        businessRole: "OWNER",
        status: "ACTIVE",
        mode: "LEGACY",
        catalogEditor: false,
        assignments: [],
      },
    },
  } as unknown as GeneralContext
  const fresh = ctx as unknown as GeneralTransactionContext
  let current: CurrentGeneralDraft = {
    status: "available",
    payload: product,
    source: {
      kind: "committed_reference",
      conversationId: turn.conversationId,
      runId: turn.runId,
      proposalId: "server-selected-product",
      revision: 4,
      payloadHash: "a".repeat(64),
    },
  }
  const reads: Array<{ conversationId: string; runId: string }> = []
  const edits: Array<{
    proposalId: string
    revision: number
    payload: GeneralAction
  }> = []
  const dependencies: Dependencies = {
    transaction: async <T>(
      _ctx: GeneralContext,
      operation: (value: GeneralTransactionContext) => Promise<T>,
    ) => operation(fresh),
    read: async (_fresh, input) => {
      reads.push(input)
      return current
    },
    edit: async (_fresh, input) => {
      edits.push(input)
      return {
        id: input.proposalId,
        revision: input.revision + 1,
        payload: input.payload,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        receipt: null,
        approvalToken: "private-canonical-approval",
      }
    },
  }
  const correction = createGeneralDraftCorrection(turn, dependencies)
  return {
    ctx,
    correction,
    reads,
    edits,
    current: () => current,
    setCurrent: (value: CurrentGeneralDraft) => {
      current = value
    },
  }
}

test("correction requires a server current-draft read; the model cannot select IDs", async () => {
  const f = fixture()
  await expect(f.correction.edit(f.ctx, product)).rejects.toMatchObject({
    code: "CONFLICT",
  })
  expect(f.edits).toEqual([])
  const read = await f.correction.read(f.ctx)
  expect(read).toEqual({ status: "editing", payload: product })
  expect(read).not.toHaveProperty("source")
  expect(read).not.toHaveProperty("proposalId")
  expect(read).not.toHaveProperty("revision")
  expect(f.reads).toEqual([turn])
  expect(
    generalActionSchema.safeParse({
      ...product,
      proposalId: "model-selected-id",
    }).success,
  ).toBe(false)
})

test("canonical correction updates the server-selected same ID/revision and returns no approval", async () => {
  const f = fixture()
  await f.correction.read(f.ctx)
  const revised = { ...product, openingStock: "900" }
  const result = await f.correction.edit(f.ctx, revised)
  expect(f.edits).toEqual([
    { proposalId: "server-selected-product", revision: 4, payload: revised },
  ])
  expect(f.reads).toEqual([turn, turn])
  expect(result).toEqual({
    proposalId: "server-selected-product",
    revision: 5,
    payload: revised,
    status: "needs_user_confirmation",
  })
  expect(result).not.toHaveProperty("approvalToken")
  expect(result).not.toHaveProperty("receipt")
  await expect(f.correction.edit(f.ctx, revised)).rejects.toMatchObject({
    code: "CONFLICT",
  })
  expect(f.edits.length).toBe(1)
})

test("a web edit between model read and correction refuses before canonical edit and consumes the stale read", async () => {
  const f = fixture()
  await f.correction.read(f.ctx)
  const original = f.current()
  if (original.status !== "available") throw Error("Current source required")
  f.setCurrent({
    ...original,
    source: { ...original.source, revision: 5, payloadHash: "b".repeat(64) },
  })
  await expect(
    f.correction.edit(f.ctx, { ...product, openingStock: "900" }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(f.edits).toEqual([])
  f.setCurrent(original)
  await expect(f.correction.edit(f.ctx, product)).rejects.toMatchObject({
    code: "CONFLICT",
  })
  expect(f.edits).toEqual([])
})

test("changed current conversation/run/proposal or unavailable scope never reaches canonical edit", async () => {
  for (const field of ["conversationId", "runId", "proposalId"] as const) {
    const f = fixture()
    await f.correction.read(f.ctx)
    const original = f.current()
    if (original.status !== "available") throw Error("Current source required")
    f.setCurrent({
      ...original,
      source: { ...original.source, [field]: "different-server-source" },
    })
    await expect(f.correction.edit(f.ctx, product)).rejects.toMatchObject({
      code: "CONFLICT",
    })
    expect(f.edits.length).toBe(0)
  }
  for (const status of ["none", "ambiguous", "unavailable"] as const) {
    const f = fixture()
    await f.correction.read(f.ctx)
    f.setCurrent({ status })
    await expect(f.correction.edit(f.ctx, product)).rejects.toMatchObject({
      code: "CONFLICT",
    })
    expect(f.edits.length).toBe(0)
  }
})

test("ordinary browser Catalog authority is checked again before correction", async () => {
  const f = fixture()
  await f.correction.read(f.ctx)
  f.ctx.tenantContext.membership.role = "CASHIER"
  await expect(f.correction.edit(f.ctx, product)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  expect(f.edits).toEqual([])
  const blocked = fixture()
  blocked.ctx.tenantContext.membership.role = "CASHIER"
  await expect(blocked.correction.read(blocked.ctx)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  expect(blocked.edits).toEqual([])
})

test("a subsequent empty read clears the prior target and changing action cannot reuse it", async () => {
  const f = fixture()
  await f.correction.read(f.ctx)
  f.setCurrent({ status: "none" })
  expect(await f.correction.read(f.ctx)).toEqual({ status: "none" })
  await expect(f.correction.edit(f.ctx, product)).rejects.toMatchObject({
    code: "CONFLICT",
  })
  expect(f.edits).toEqual([])
  const switched = fixture()
  await switched.correction.read(switched.ctx)
  await expect(
    switched.correction.edit(switched.ctx, {
      action: "customer_create",
      name: "Other",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(switched.edits).toEqual([])
})

test("source kind or committed anchor drift invalidates the retained correction before canonical edit", async () => {
  for (const changed of ["kind", "anchor"] as const) {
    const f = fixture()
    const current = f.current()
    if (current.status !== "available") throw Error("Current source required")
    const original = {
      ...current,
      source: {
        ...current.source,
        anchor: {
          messageId: "committed-assistant-message",
          messageSequence: 3,
          runId: "prior-completed-run",
          revision: 3,
          payloadHash: "b".repeat(64),
        },
      },
    }
    f.setCurrent(original)
    await f.correction.read(f.ctx)
    f.setCurrent({
      ...original,
      source:
        changed === "kind"
          ? { ...original.source, kind: "legacy_unique" }
          : {
              ...original.source,
              anchor: {
                ...original.source.anchor,
                messageId: "different-committed-message",
              },
            },
    })
    await expect(f.correction.edit(f.ctx, product)).rejects.toMatchObject({
      code: "CONFLICT",
    })
    expect(f.edits).toEqual([])
  }
})
