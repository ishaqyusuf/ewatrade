import { afterAll, beforeAll, expect, test } from "bun:test"
import {
  type GeneralAction,
  type SimpleSale,
  generalActionSchema,
  simpleSaleAction,
  simpleSaleStep,
} from "@ewatrade/assistant/general/contracts"
import type { Prisma } from "@ewatrade/db/types"
import { TRPCError } from "@trpc/server"
import type { AssistantActionProposal } from "../../../../../packages/db/generated/prisma/client"
import { normalizeCatalogFreeLine } from "../../../../../packages/db/src/queries/catalog-free-lines"
import {
  type GeneralActionAdapter,
  type GeneralTransactionContext,
  executeSimpleSaleOrder,
  orderCreate,
} from "../general-actions"
import {
  decideGeneralProposalInTransaction,
  generalProposalForApp,
} from "../general-proposals"
import { simpleSaleRecord } from "../general-simple-sale"
import { proposalApprovalToken, proposalDigest } from "../proposal-security"

// No module/function mocks. Real parsers, signer, proposal DTO and adapters run
// over typed inert DB ports. Unexpected canonical admission and actual create
// calls throw distinct sentinels; neither can open a database connection.
// This proves readiness/forwarding boundaries, not persisted Order/payment
// results, HTTP middleware, provider conversation, browser or native behavior.
const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
if (
  !target.hostname.endsWith(".invalid") ||
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
)
  throw Error("Description readiness fixture requires an inert .invalid URL")
const syntheticKey = "synthetic-description-readiness-signing-key-2026"
const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = syntheticKey
})
afterAll(() => {
  if (previousKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
})

class InertCanonicalBoundary extends Error {}
class InertWriteBoundary extends Error {}

function context(savedProposal?: AssistantActionProposal) {
  const canonicalPorts: string[] = []
  const writes: string[] = []
  const bookLocks: string[] = []
  const proposalReads: Prisma.AssistantActionProposalFindFirstArgs[] = []
  const write = (port: string): never => {
    writes.push(port)
    throw new InertWriteBoundary(`Inert write ${port} was reached`)
  }
  const ports = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?").replace(/\s+/g, " ").trim()
      // Only the real shared Book coordination query is admitted. It is not
      // a canonical Order admission or a customer write, and cannot query PG.
      if (
        sql !==
          'SELECT id FROM "FinanceBook" WHERE "tenantId" = ? AND "currencyCode" = ? FOR UPDATE' ||
        values.length !== 2 ||
        values[0] !== "tenant" ||
        values[1] !== "NGN"
      ) {
        canonicalPorts.push("unrecognized raw query")
        throw new InertCanonicalBoundary("Unrecognized inert raw query")
      }
      bookLocks.push("FinanceBook:tenant:NGN")
      return [{ id: "book" }]
    },
    financeBook: {
      findUnique: async (_args: Prisma.FinanceBookFindUniqueArgs) => ({
        id: "book",
        currencyCode: "NGN",
      }),
    },
    financeAccount: {
      findMany: async (_args: Prisma.FinanceAccountFindManyArgs) => [
        {
          id: "cash",
          name: "Cash",
          purpose: "CASH" as const,
          paymentMethods: ["cash"],
          paymentsPausedAt: null,
        },
      ],
    },
    customer: {
      findMany: async (_args: Prisma.CustomerFindManyArgs) => [],
      findFirst: async (_args: Prisma.CustomerFindFirstArgs) => null,
      create: async (_args: Prisma.CustomerCreateArgs) => {
        return write("customer.create")
      },
    },
    assistantActionProposal: {
      findFirst: async (args: Prisma.AssistantActionProposalFindFirstArgs) => {
        if (!savedProposal) {
          canonicalPorts.push("unexpected proposal read")
          throw new InertCanonicalBoundary("Unexpected proposal read")
        }
        proposalReads.push(args)
        expect(args.where).toMatchObject({
          id: savedProposal.id,
          tenantId: "tenant",
          storeId: "store",
          actorUserId: "actor",
          conversation: {
            tenantId: "tenant",
            storeId: "store",
            ownerUserId: "actor",
            purpose: "GENERAL",
            status: "ACTIVE",
          },
        })
        return savedProposal
      },
      create: async (_args: Prisma.AssistantActionProposalCreateArgs) =>
        write("assistantActionProposal.create"),
      update: async (_args: Prisma.AssistantActionProposalUpdateArgs) =>
        write("assistantActionProposal.update"),
      updateMany: async (_args: Prisma.AssistantActionProposalUpdateManyArgs) =>
        write("assistantActionProposal.updateMany"),
    },
  }
  const db = new Proxy(ports, {
    get(object, key, receiver) {
      if (Reflect.has(object, key)) return Reflect.get(object, key, receiver)
      canonicalPorts.push(String(key))
      throw new InertCanonicalBoundary("Inert canonical admission reached")
    },
  }) as unknown as Prisma.TransactionClient
  const ctx = {
    session: { user: { id: "actor" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "tenant",
        name: "Synthetic description QA",
        currencyCode: "NGN",
        timezone: "Africa/Lagos",
        dataClassification: "QA",
        retailOpsPlanId: "pro",
      },
      membership: { id: "member", role: "OWNER" },
      activeStore: { id: "store", currencyCode: "NGN", name: "Original" },
      stores: [{ id: "store" }],
      staffAccess: {
        status: "ACTIVE",
        mode: "LEGACY",
        businessRole: "OWNER",
        assignments: [],
      },
    },
    db,
  } as unknown as GeneralTransactionContext
  return { ctx, canonicalPorts, writes, bookLocks, proposalReads }
}

function sale(description?: string): SimpleSale {
  return simpleSaleAction.parse({
    action: "sale_record",
    receivedMinor: 500,
    moneyAccountId: "cash",
    method: "cash",
    customerChoice: "walk_in",
    ...(description === undefined ? {} : { description }),
  })
}
function order(description?: string, custom = "quick_sale") {
  const action = generalActionSchema.parse({
    action: "order_create",
    lines: [
      {
        custom,
        amountMinor: 500,
        ...(description === undefined ? {} : { description }),
      },
    ],
  })
  if (action.action !== "order_create") throw Error("Expected Order action")
  return action
}
function composite(description?: string) {
  return {
    ...order(description),
    initialPayment: {
      amountMinor: 500,
      moneyAccountId: "cash",
      method: "cash" as const,
    },
  }
}
// Use the adapter's actual public confirmation contract (lock=true). An
// incomplete non-lock draft may remain editable; it must not get approval or
// execute. No production function is replaced by this type annotation.
const genericOrder: GeneralActionAdapter<
  Extract<GeneralAction, { action: "order_create" }>
> = orderCreate
const receipt = {
  kind: "order" as const,
  recordId: "historical-order",
  orderId: "historical-order",
  title: "Sale saved",
  detail: "Historical saved result; unchanged",
}
function proposal(payload: GeneralAction, completed = false) {
  const row: AssistantActionProposal = {
    id: "description-proposal",
    conversationId: "conversation",
    tenantId: "tenant",
    storeId: "store",
    actorUserId: "actor",
    action: payload.action,
    actionVersion: 1,
    payload: JSON.parse(JSON.stringify(payload)),
    payloadHash: proposalDigest(payload),
    revision: 1,
    targetRecordId: null,
    targetRevision: null,
    roleSnapshot: "OWNER",
    approvalTokenHash: "pending",
    expiresAt: new Date(Date.now() + 60_000),
    idempotencyKey: "immutable-historical-key",
    status: completed ? "COMPLETED" : "PENDING",
    executedResult: completed ? receipt : null,
    errorCode: null,
    decidedAt: completed ? new Date("2026-10-01T12:00:00Z") : null,
    createdAt: new Date("2026-10-01T11:59:00Z"),
    updatedAt: new Date("2026-10-01T12:00:00Z"),
  }
  row.approvalTokenHash = proposalDigest(
    proposalApprovalToken(row, syntheticKey),
  )
  return row
}
async function descriptionRefusal(run: () => Promise<unknown>) {
  let error: unknown
  try {
    await run()
  } catch (failure) {
    error = failure
  }
  expect(error).toBeInstanceOf(TRPCError)
  if (!(error instanceof TRPCError)) return
  expect(["BAD_REQUEST", "CONFLICT"]).toContain(error.code)
}

test("incomplete simple-sale drafts remain parsable and readable without approval", () => {
  const draft = simpleSaleAction.parse({ action: "sale_record" })
  expect(simpleSaleStep(draft)).not.toBe("review")
  const row = proposal(draft)
  const before = structuredClone(row)
  const dto = generalProposalForApp(row)
  expect(dto.payload).toEqual(draft)
  expect(dto.approvalToken).toBeUndefined()
  expect(dto.receipt).toBeNull()
  expect(row).toEqual(before)
})

for (const [name, description] of [
  ["missing", undefined],
  ["whitespace", "   "],
] as const) {
  test(`${name} simple-sale words remain a draft, never approval-ready`, () => {
    const payload = sale(description)
    expect(simpleSaleStep(payload)).not.toBe("review")
  })
  test(`${name} simple sale never receives a fresh approval token`, () => {
    expect(
      Boolean(generalProposalForApp(proposal(sale(description))).approvalToken),
    ).toBe(false)
  })
  test(`${name} generic Quick sale never receives a fresh approval token`, () => {
    expect(
      Boolean(
        generalProposalForApp(proposal(order(description))).approvalToken,
      ),
    ).toBe(false)
  })
  test(`${name} simple-sale locked validation refuses before writes`, async () => {
    const fixture = context()
    await descriptionRefusal(() =>
      simpleSaleRecord.validate(fixture.ctx, sale(description), true),
    )
    expect(fixture.writes).toEqual([])
    expect(fixture.canonicalPorts).toEqual([])
  })
  test(`${name} generic Quick sale locked validation refuses confirmation`, async () => {
    const fixture = context()
    await descriptionRefusal(() =>
      genericOrder.validate(fixture.ctx, order(description), true),
    )
    expect(fixture.writes).toEqual([])
    expect(fixture.canonicalPorts).toEqual([])
  })
  test(`${name} simple-sale execution refuses before provisioning a new customer`, async () => {
    const fixture = context()
    await descriptionRefusal(() =>
      simpleSaleRecord.execute(
        fixture.ctx,
        {
          ...sale(description),
          customerChoice: "new",
          customerName: "Synthetic customer",
        },
        "description-execute",
      ),
    )
    expect(fixture.writes).toEqual([])
    expect(fixture.canonicalPorts).toEqual([])
  })
  test(`${name} exact simple-sale composition refuses before canonical admission`, async () => {
    const fixture = context()
    await descriptionRefusal(() =>
      executeSimpleSaleOrder(
        fixture.ctx,
        composite(description),
        "description-composite",
      ),
    )
    expect(fixture.canonicalPorts).toEqual([])
    expect(fixture.writes).toEqual([])
  })
  test(`${name} standalone Order execution refuses before canonical admission`, async () => {
    const fixture = context()
    await descriptionRefusal(() =>
      orderCreate.execute(fixture.ctx, order(description), "blank-order"),
    )
    expect(fixture.canonicalPorts).toEqual([])
    expect(fixture.writes).toEqual([])
  })
  for (const payload of [sale(description), order(description)]) {
    test(`historical COMPLETED ${payload.action} with ${name} words preserves its receipt`, () => {
      // The actual parser must keep these old payloads readable. A global
      // required description schema would break this path before receipt read.
      const row = proposal(payload, true)
      const before = structuredClone(row)
      const dto = generalProposalForApp(row)
      expect(dto.status).toBe("COMPLETED")
      expect(dto.receipt).toEqual(receipt)
      expect(dto.approvalToken).toBeUndefined()
      expect(dto.payload).toEqual(payload)
      expect(row).toEqual(before)
    })
    test(`actual COMPLETED ${payload.action} with ${name} words re-reads its saved receipt without execution`, async () => {
      // Actual internal decision seam, whose caller supplies a fresh context.
      // This does not replace/test HTTP/session refresh middleware.
      const row = proposal(payload, true)
      const before = structuredClone(row)
      const fixture = context(row)
      const dto = await decideGeneralProposalInTransaction(fixture.ctx, {
        proposalId: row.id,
        revision: row.revision,
        decision: "confirm",
      })
      expect(dto.status).toBe("COMPLETED")
      expect(dto.receipt).toEqual(receipt)
      expect(dto.approvalToken).toBeUndefined()
      expect(row).toEqual(before)
      expect(fixture.proposalReads).toHaveLength(1)
      expect(fixture.writes).toEqual([])
      expect(fixture.canonicalPorts).toEqual([])
      expect(fixture.bookLocks).toEqual([])
    })
  }
}

for (const length of [1, 200]) {
  test(`trimmed ${length}-character words make simple and generic Quick sales ready`, async () => {
    const words = "x".repeat(length)
    const simple = sale(`  ${words}  `)
    const generic = order(`  ${words}  `)
    expect(simple.description).toBe(words)
    expect(simpleSaleStep(simple)).toBe("review")
    expect(generalProposalForApp(proposal(simple)).approvalToken).toBeTruthy()
    expect(generalProposalForApp(proposal(generic)).approvalToken).toBeTruthy()
    expect(generic.lines[0]).toMatchObject({ description: words })
    const fixture = context()
    await expect(
      simpleSaleRecord.validate(fixture.ctx, simple, true),
    ).resolves.toMatchObject({ id: "store" })
    await expect(
      genericOrder.validate(fixture.ctx, generic, true),
    ).resolves.toBeNull()
    expect(fixture.writes).toEqual([])
    expect(fixture.canonicalPorts).toEqual([])
  })
}

test("201-character descriptions are rejected without changing historical parsers", () => {
  const description = "x".repeat(201)
  expect(
    simpleSaleAction.safeParse({ action: "sale_record", description }).success,
  ).toBe(false)
  expect(
    generalActionSchema.safeParse({
      action: "order_create",
      lines: [{ custom: "quick_sale", amountMinor: 500, description }],
    }).success,
  ).toBe(false)
})

test("Additional cost descriptions remain optional through real validation", async () => {
  const payload = order(undefined, "additional_cost")
  expect(generalProposalForApp(proposal(payload)).approvalToken).toBeTruthy()
  const fixture = context()
  await expect(
    genericOrder.validate(fixture.ctx, payload, true),
  ).resolves.toBeNull()
  expect(
    normalizeCatalogFreeLine({ custom: "additional_cost", amountMinor: 500 }),
  ).toMatchObject({ description: null, kind: "additional_cost" })
  expect(fixture.writes).toEqual([])
})

test("a valid exact composition still reaches the real canonical admission seam", async () => {
  const fixture = context()
  await expect(
    executeSimpleSaleOrder(fixture.ctx, composite("Rice"), "valid-composite"),
  ).rejects.toBeInstanceOf(InertCanonicalBoundary)
  expect(fixture.canonicalPorts.length).toBeGreaterThan(0)
  expect(fixture.writes).toEqual([])
})

test("a valid simple sale retains its intentional customer provisioning seam", async () => {
  const fixture = context()
  await expect(
    simpleSaleRecord.execute(
      fixture.ctx,
      {
        ...sale("Rice"),
        customerChoice: "new",
        customerName: "Synthetic customer",
      },
      "valid-customer-sale",
    ),
  ).rejects.toBeInstanceOf(InertWriteBoundary)
  expect(fixture.writes).toEqual(["customer.create"])
  expect(fixture.canonicalPorts).toEqual([])
})
