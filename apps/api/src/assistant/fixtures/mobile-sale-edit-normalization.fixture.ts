import { afterAll, beforeAll, expect, test } from "bun:test"
import { simpleSaleAction } from "@ewatrade/assistant/general/contracts"
import type { Prisma, PrismaClient } from "@ewatrade/db/types"
import { TRPCError } from "@trpc/server"
import type { AssistantActionProposal } from "../../../../../packages/db/generated/prisma/client"
import { getActiveTenantForUser } from "../../../../../packages/db/src/queries/tenants"
import { assistantRouter } from "../../trpc/routers/assistant"
import type { GeneralContext } from "../general-context"
import {
  decideGeneralProposal,
  editGeneralProposal,
  generalProposalForApp,
} from "../general-proposals"
import { handleSimpleSaleChat } from "../general-simple-sale-chat"
import { proposalDigest } from "../proposal-security"

// Actual chat + edit/draft + fresh-context transaction + tenant derivation.
// Only typed, inert database ports; no module or production-function mocks,
// parser copies, real connections, provider calls or finalized business rows.
if (
  !new URL(process.env.EWATRADE_DATABASE_URL ?? "").hostname.endsWith(
    ".invalid",
  ) ||
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
)
  throw Error("Chat fixture requires an inert .invalid database URL")
const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "synthetic-description-chat-signing-key-2026"
})
afterAll(() => {
  if (previousKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
})

async function harness() {
  const now = new Date()
  const tenant = {
    id: "tenant",
    slug: "qa",
    name: "Inert description QA",
    type: "MERCHANT" as const,
    enabledModes: ["MERCHANT" as const],
    currencyCode: "NGN",
    dataClassification: "QA" as const,
    timezone: "Africa/Lagos",
    qaPurgeStartedAt: null,
    metadata: {
      retailOps: { subscription: { planId: "growth", status: "active" } },
    },
    subscription: null,
    stores: [
      {
        id: "store",
        slug: "original",
        name: "Original",
        currencyCode: "NGN",
        status: "ACTIVE" as const,
        metadata: null,
      },
    ],
  }
  const membership = {
    id: "member",
    tenantId: tenant.id,
    role: "OWNER" as const,
    staffAccessMode: "LEGACY" as const,
    catalogEditor: false,
    staffStoreAssignments: [],
    retailOpsStaffProfile: null,
    tenant,
  }
  const initial = simpleSaleAction.parse({
    action: "sale_record",
    receivedMinor: 300,
    totalMinor: 900,
    partial: true,
    moneyAccountId: "bank",
    accountName: "Original bank",
    method: "bank_transfer",
    customerChoice: "new",
    customerName: "Caller part customer",
  })
  const rows: AssistantActionProposal[] = [
    {
      id: "pending-sale",
      conversationId: "chat",
      tenantId: "tenant",
      storeId: "store",
      actorUserId: "actor",
      action: "sale_record",
      actionVersion: 1,
      payload: initial,
      payloadHash: proposalDigest(initial),
      revision: 1,
      targetRecordId: null,
      targetRevision: null,
      roleSnapshot: "OWNER",
      approvalTokenHash: "pending",
      expiresAt: new Date(now.getTime() + 60_000),
      idempotencyKey: "original-immutable-key",
      status: "PENDING",
      executedResult: null,
      errorCode: null,
      decidedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ]
  const txEvents: string[] = []
  const unexpectedPorts: string[] = []
  const approvalAdmission = Error(
    "Inert approval claim boundary; no canonical writes",
  )
  let admittedClaims = 0
  const original = () => {
    const row = rows.find((entry) => entry.id === "pending-sale")
    if (!row) throw Error("Missing original proposal")
    return row
  }
  const find = (where: Prisma.AssistantActionProposalWhereInput | undefined) =>
    rows.find(
      (row) =>
        (!where?.id || where.id === row.id) &&
        (!where?.revision || where.revision === row.revision) &&
        (!where?.status || where.status === row.status),
    ) ?? null
  const ports = {
    $transaction: async <T>(
      run: (tx: Prisma.TransactionClient) => Promise<T>,
      options: { maxWait: number; timeout: number; isolationLevel: string },
    ) => {
      expect(options).toEqual({
        maxWait: 10000,
        timeout: 30000,
        isolationLevel: "Serializable",
      })
      txEvents.push("fresh transaction")
      return run(db as unknown as Prisma.TransactionClient)
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?").replace(/\s+/g, " ").trim()
      if (sql.startsWith('SELECT "id" FROM "Membership"'))
        expect(values).toEqual(["member", "tenant", "actor"])
      else if (sql.startsWith('SELECT "id" FROM "Store"'))
        expect(values).toEqual(["store", "tenant"])
      else throw Error("Unexpected inert raw query")
      expect(sql).toContain("FOR SHARE")
      return []
    },
    session: {
      findFirst: async (args: Prisma.SessionFindFirstArgs) => {
        expect(args.where).toMatchObject({ id: "session", userId: "actor" })
        txEvents.push("fresh session")
        return { id: "session" }
      },
    },
    membership: {
      findFirst: async (args: Prisma.MembershipFindFirstArgs) => {
        expect(args.where).toMatchObject({ userId: "actor", status: "ACTIVE" })
        return membership
      },
    },
    user: {
      findUnique: async (args: Prisma.UserFindUniqueArgs) => {
        expect(args.where).toEqual({ id: "actor" })
        return { ageBand: "ADULT" }
      },
    },
    accountPrivacyRequest: {
      findUnique: async (args: Prisma.AccountPrivacyRequestFindUniqueArgs) => {
        expect(args.where).toEqual({ requestKey: "account-deletion:actor" })
        return null
      },
    },
    financeBook: {
      findUnique: async (args: Prisma.FinanceBookFindUniqueArgs) => {
        expect(args.where).toEqual({
          tenantId_currencyCode: { tenantId: "tenant", currencyCode: "NGN" },
        })
        return { id: "book", currencyCode: "NGN" }
      },
    },
    financeAccount: {
      findMany: async (args: Prisma.FinanceAccountFindManyArgs) => {
        expect(args.where).toMatchObject({ bookId: "book", archivedAt: null })
        return [
          {
            id: "bank",
            name: "Original bank",
            purpose: "BANK",
            paymentMethods: ["bank_transfer"],
            paymentsPausedAt: null,
          },
        ]
      },
    },
    customer: { findMany: async (_args: Prisma.CustomerFindManyArgs) => [] },
    assistantConversation: {
      findFirst: async (args: Prisma.AssistantConversationFindFirstArgs) => {
        expect(args.where).toMatchObject({
          id: "chat",
          tenantId: "tenant",
          storeId: "store",
          ownerUserId: "actor",
        })
        return {
          id: "chat",
          tenantId: "tenant",
          storeId: "store",
          ownerUserId: "actor",
          purpose: "GENERAL",
          status: "ACTIVE",
          updatedAt: now,
          messages: [],
        }
      },
    },
    assistantActionProposal: {
      findFirst: async (args: Prisma.AssistantActionProposalFindFirstArgs) => {
        expect(args.where).toMatchObject({
          tenantId: "tenant",
          storeId: "store",
          actorUserId: "actor",
        })
        const row = find(args.where)
        return row ? structuredClone(row) : null
      },
      updateMany: async (
        args: Prisma.AssistantActionProposalUpdateManyArgs,
      ) => {
        if (args.data.status === "EXECUTING") {
          admittedClaims++
          throw approvalAdmission
        }
        const row = find(args.where)
        if (!row) return { count: 0 }
        // Ordinary inert delegate write only. Actual production functions
        // derive the payload, revision, target, digest and approval binding.
        Object.assign(row, structuredClone(args.data))
        return { count: 1 }
      },
      create: async (args: Prisma.AssistantActionProposalCreateArgs) => {
        const row = Object.assign(
          structuredClone(original()),
          {
            revision: 1,
            status: "PENDING",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          structuredClone(args.data),
        )
        rows.push(row)
        return structuredClone(row)
      },
      update: async (args: Prisma.AssistantActionProposalUpdateArgs) => {
        const row = find(args.where)
        if (!row) throw Error("Unknown inert proposal")
        Object.assign(row, structuredClone(args.data))
        return structuredClone(row)
      },
    },
  }
  const db = new Proxy(ports, {
    get(object, key, receiver) {
      if (Reflect.has(object, key)) return Reflect.get(object, key, receiver)
      unexpectedPorts.push(String(key))
      throw Error("Unexpected inert domain port")
    },
  }) as unknown as PrismaClient
  const tenantContext = await getActiveTenantForUser(db, {
    userId: "actor",
    tenantSlug: "qa",
    storeId: "store",
  })
  if (!tenantContext) throw Error("Missing derived inert context")
  const ctx = {
    db,
    tenantContext,
    tenantSlug: "qa",
    session: { user: { id: "actor" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
  } as unknown as GeneralContext
  return {
    rows,
    ctx,
    approvalAdmission,
    admittedClaims: () => admittedClaims,
    original,
    txEvents,
    unexpectedPorts,
    send: (text: string) =>
      handleSimpleSaleChat(ctx, {
        conversationId: "chat",
        messageId: "message",
        text,
        imageIds: [],
        history: [],
      }),
  }
}

// The exact public procedure parser, not a locally rebuilt schema. The public
// tRPC middleware is source-reviewed here; only its attached input projection
// and the actual fresh-context edit/decide functions execute in this fixture.
function publicEditInput(input: Parameters<typeof editGeneralProposal>[1]) {
  const parser = assistantRouter.editProposal._def.inputs[0]
  if (
    !parser ||
    typeof parser !== "object" ||
    !("parse" in parser) ||
    typeof parser.parse !== "function"
  )
    throw Error("Public edit parser unavailable")
  return parser.parse(input) as Parameters<typeof editGeneralProposal>[1]
}
const padded = "  Part-paid supplies  "
async function edited(
  h: Awaited<ReturnType<typeof harness>>,
  throughPublicParser: boolean,
) {
  const before = structuredClone(h.original())
  const input = {
    proposalId: before.id,
    revision: before.revision,
    payload: { ...simpleSaleAction.parse(before.payload), description: padded },
  }
  const app = await editGeneralProposal(
    h.ctx,
    throughPublicParser ? publicEditInput(input) : input,
  )
  expect(app.id).toBe(before.id)
  expect(app.revision).toBe(before.revision + 1)
  expect(app.payload).toMatchObject({
    action: "sale_record",
    description: "Part-paid supplies",
    receivedMinor: 300,
    totalMinor: 900,
    partial: true,
    moneyAccountId: "bank",
    method: "bank_transfer",
    customerChoice: "new",
    customerName: "Caller part customer",
  })
  expect(h.original().idempotencyKey).toBe(before.idempotencyKey)
  expect(Boolean(app.approvalToken)).toBe(true)
  return app
}
const decision = (app: Awaited<ReturnType<typeof edited>>) => ({
  proposalId: app.id,
  revision: app.revision,
  decision: "confirm" as const,
  approvalToken: app.approvalToken,
})

test("official edit procedure parser trims padded description without changing other facts", async () => {
  const h = await harness()
  const row = h.original()
  const input = {
    proposalId: row.id,
    revision: row.revision,
    payload: { ...simpleSaleAction.parse(row.payload), description: padded },
  }
  const parsed = publicEditInput(input)
  expect(input.payload.description).toBe(padded)
  expect(parsed).toEqual({
    ...input,
    payload: { ...input.payload, description: "Part-paid supplies" },
  })
  expect(h.admittedClaims()).toBe(0)
  expect(h.unexpectedPorts).toEqual([])
})

test("raw typed internal edit bypass preserves padding and actual confirm refuses changed digest before effects", async () => {
  const h = await harness()
  const app = await edited(h, false)
  expect(simpleSaleAction.parse(h.original().payload).description).toBe(
    "Part-paid supplies",
  )
  expect(Reflect.get(h.original().payload as object, "description")).toBe(
    padded,
  )
  expect(proposalDigest(simpleSaleAction.parse(h.original().payload))).not.toBe(
    h.original().payloadHash,
  )
  let failure: unknown
  try {
    await decideGeneralProposal(h.ctx, decision(app))
  } catch (error) {
    failure = error
  }
  expect(failure).toBeInstanceOf(TRPCError)
  if (!(failure instanceof TRPCError))
    throw Error("Missing typed approval refusal")
  expect(failure.code).toBe("CONFLICT")
  expect(failure.message).toBe(
    "Approval expired or changed. Review and save the draft again.",
  )
  expect(h.original().status).toBe("PENDING")
  expect(h.admittedClaims()).toBe(0)
  expect(h.unexpectedPorts).toEqual([])
})

test("official parsed edit stores the trimmed digest and actual confirm reaches its claim boundary", async () => {
  const h = await harness()
  const app = await edited(h, true)
  expect(Reflect.get(h.original().payload as object, "description")).toBe(
    "Part-paid supplies",
  )
  expect(proposalDigest(simpleSaleAction.parse(h.original().payload))).toBe(
    h.original().payloadHash,
  )
  await expect(decideGeneralProposal(h.ctx, decision(app))).rejects.toBe(
    h.approvalAdmission,
  )
  expect(h.admittedClaims()).toBe(1)
  expect(h.original().status).toBe("PENDING")
  expect(h.unexpectedPorts).toEqual([])
})

test("actual description chat parses padded owner words before its internal edit and remains confirmable", async () => {
  const h = await harness()
  const before = structuredClone(h.original())
  const reply = await h.send(padded)
  expect(reply?.proposalId).toBe(before.id)
  const app = generalProposalForApp(h.original())
  expect(app.payload).toMatchObject({
    action: "sale_record",
    description: "Part-paid supplies",
    receivedMinor: 300,
    totalMinor: 900,
    partial: true,
    moneyAccountId: "bank",
    customerName: "Caller part customer",
    customerChoice: "new",
  })
  expect(h.original().revision).toBe(before.revision + 1)
  expect(h.original().idempotencyKey).toBe(before.idempotencyKey)
  expect(proposalDigest(simpleSaleAction.parse(h.original().payload))).toBe(
    h.original().payloadHash,
  )
  await expect(decideGeneralProposal(h.ctx, decision(app))).rejects.toBe(
    h.approvalAdmission,
  )
  expect(h.admittedClaims()).toBe(1)
  expect(h.unexpectedPorts).toEqual([])
})
