import { afterAll, beforeAll, expect, test } from "bun:test"
import { simpleSaleAction } from "@ewatrade/assistant/general/contracts"
import type { Prisma, PrismaClient } from "@ewatrade/db/types"
import type { AssistantActionProposal } from "../../../../../packages/db/generated/prisma/client"
import { getActiveTenantForUser } from "../../../../../packages/db/src/queries/tenants"
import type { GeneralContext } from "../general-context"
import { generalProposalForApp } from "../general-proposals"
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
    receivedMinor: 500,
    moneyAccountId: "bank",
    accountName: "Original bank",
    method: "bank_transfer",
    customerChoice: "walk_in",
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

for (const description of [
  "Sale of two bags of rice",
  "Phone order",
  "2 bags of rice",
  "Sale 2 bags of rice",
  "Order 2 bags of rice",
  "Order 2 to-go containers",
  "Sale 2 transfer sheets",
  "Sale 2 paid subscriptions",
  "Order 2 total stationery packs",
  "Paid 2 hours of cleaning",
]) {
  test(`description question accepts '${description}' without changing money or party`, async () => {
    const h = await harness()
    const before = structuredClone(h.original())
    const result = await h.send(description)
    expect(result?.proposalId).toBe(before.id)
    expect(h.original().payload).toEqual({
      ...(before.payload as object),
      description,
    })
    expect(h.original().revision).toBe(before.revision + 1)
    expect(h.original().idempotencyKey).toBe(before.idempotencyKey)
    expect(Boolean(generalProposalForApp(h.original()).approvalToken)).toBe(
      true,
    )
    expect(h.rows).toHaveLength(1)
    expect(h.txEvents).toEqual(["fresh transaction", "fresh session"])
    expect(h.unexpectedPorts).toEqual([])
  })
}

for (const control of ["Confirm", "Save sale", "Done", "Proceed", "Cancel"]) {
  test(`'${control}' is never adopted as a description or an execution`, async () => {
    const h = await harness()
    const payload = structuredClone(h.original().payload)
    await h.send(control)
    expect(h.original().payload).toEqual(payload)
    expect(Boolean(generalProposalForApp(h.original()).approvalToken)).toBe(
      false,
    )
    expect(h.rows).toHaveLength(1)
    expect(h.unexpectedPorts).toEqual([])
  })
}

for (const [text, receivedMinor] of [
  ["paid 7", 700],
  ["500", 50_000],
  ["sale 20k", 2_000_000],
  ["order 500", 50_000],
  ["sale 20k paid to Original bank", 2_000_000],
  ["order 500 total 800", 50_000],
] as const) {
  test(`explicit amount '${text}' remains an amount edit, never a description`, async () => {
    const h = await harness()
    await h.send(text)
    expect(h.original().payload).toMatchObject({
      receivedMinor,
      moneyAccountId: "bank",
      customerChoice: "walk_in",
    })
    expect(
      simpleSaleAction.parse(h.original().payload).description,
    ).toBeUndefined()
    expect(Boolean(generalProposalForApp(h.original()).approvalToken)).toBe(
      false,
    )
    expect(h.rows).toHaveLength(1)
    expect(h.unexpectedPorts).toEqual([])
  })
}

test("an explicit new sale opens another incomplete draft and preserves the original", async () => {
  const h = await harness()
  const before = structuredClone(h.original())
  const result = await h.send("New sale paid 8")
  expect(result?.proposalId).not.toBe(before.id)
  expect(h.rows).toHaveLength(2)
  expect(h.original()).toEqual(before)
  const next = h.rows.find((row) => row.id === result?.proposalId)
  if (!next) throw Error("Missing new sale draft")
  expect(next.payload).toMatchObject({ receivedMinor: 800 })
  expect(simpleSaleAction.parse(next.payload).description).toBeUndefined()
  expect(Boolean(generalProposalForApp(next).approvalToken)).toBe(false)
  expect(h.unexpectedPorts).toEqual([])
})
