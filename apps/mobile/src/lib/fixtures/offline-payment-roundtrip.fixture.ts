import { beforeEach, expect, mock, test } from "bun:test"
import type {
  Prisma,
  PrismaClient,
} from "../../../../../packages/db/generated/prisma/client"
import { CatalogError } from "../../../../../packages/db/src/queries/catalog-errors"
import { resolveOrderCollectionPosting } from "../../../../../packages/db/src/queries/finance/order-collection-source"
import { assertOrderPaymentAccountInTransaction } from "../../../../../packages/db/src/queries/finance/order-payment-accounts"
import { FinanceError } from "../../../../../packages/db/src/queries/finance/rules"
import { offlineReplaySchema } from "../../../../api/src/schemas/offline"
import { buildOfflineOrderCommand } from "../offline-order"

// Actual builder, API schema, replay/approval, staff/account guards and collection
// projection over inert transactions. Only the large canonical Order creation
// boundary is intercepted; this is forwarding evidence, not a DB ledger test.
const queries = new URL(
  "../../../../../packages/db/src/queries/",
  import.meta.url,
)
mock.module(new URL("catalog.ts", queries).pathname, () => ({ CatalogError }))
type CanonicalInput = ReturnType<typeof selectedCommand>["payload"] & {
  actorUserId: string
  storeId: string
  tenantId: string
  clientOrderId: string
}
type Account = {
  id: string
  bookId: string
  kind: string
  purpose: string
  name: string
  archivedAt: Date | null
  paymentsPausedAt: Date | null
  paymentMethods: string[]
}
type AccountWhere = {
  id: string
  bookId: string
  kind: string
  purpose: { in: string[] }
  archivedAt: null
}
type StoredCommand = {
  id: string
  tenantId: string
  storeId: string
  offlineDeviceId: string
  clientCommandId: string
  createdAtClient: Date
  eventVersion: number
  payloadHash: string
  attemptedState: unknown
  payload: CanonicalInput
  status: string
  conflictCode: string | null
  result: unknown
  authoritativeState: unknown
  processedAt: Date | null
  conflictMessage: string | null
  dependencyClientIds: string[]
}
const canonicalInputs: CanonicalInput[] = []
let account: Account | null
let paymentEffects = 0
let canonicalFailure: Error | undefined
mock.module(new URL("commercial-orders.ts", queries).pathname, () => ({
  createCommercialOrderInTransaction: async (
    tx: Prisma.TransactionClient,
    input: CanonicalInput,
  ) => {
    canonicalInputs.push(structuredClone(input))
    if (canonicalFailure) throw canonicalFailure
    if (input.initialPayment?.moneyAccountId) {
      await assertOrderPaymentAccountInTransaction(tx, {
        accountId: input.initialPayment.moneyAccountId,
        bookId: "book-current",
        method: input.initialPayment.method,
        refund: false,
      })
      paymentEffects++
    }
    return {
      id: "canonical-order",
      amountPaidMinor: input.initialPayment?.amountMinor ?? 0,
    }
  },
}))
const { replayOfflineCommands, reviewOfflineConflict } = await import(
  "../../../../../packages/db/src/queries/offline-commands"
)

beforeEach(() => {
  canonicalInputs.length = 0
  paymentEffects = 0
  canonicalFailure = undefined
  account = {
    id: "selected-bank-account",
    bookId: "book-current",
    kind: "ASSET",
    purpose: "BANK",
    name: "Selected bank",
    archivedAt: null,
    paymentMethods: ["bank_transfer", "pos"],
    paymentsPausedAt: null,
  }
})
function selectedCommand() {
  const command = buildOfflineOrderCommand({
    clientCommandId: "selected-offline-order",
    lines: [
      { custom: "quick_sale", amountMinor: 5_000, description: "Packed lunch" },
    ],
    payment: {
      clientPaymentId: "selected-offline-payment",
      amountMinor: 2_000,
      moneyAccountId: "selected-bank-account",
      method: "bank_transfer",
    },
  })
  const parsed = offlineReplaySchema.parse(
    JSON.parse(
      JSON.stringify({
        deviceId: "registered-device",
        storeId: "store-current",
        commands: [
          { ...command, createdAtClient: new Date("2026-10-17T06:00:00Z") },
        ],
      }),
    ),
  ).commands[0]
  if (!parsed?.payload.initialPayment) throw Error("Expected selected payment")
  return {
    ...parsed,
    payload: {
      ...parsed.payload,
      initialPayment: parsed.payload.initialPayment,
    },
  }
}
function accountFor(where: AccountWhere) {
  if (
    !account ||
    account.id !== where.id ||
    account.bookId !== where.bookId ||
    account.archivedAt !== null ||
    account.kind !== where.kind ||
    !where.purpose.in.includes(account.purpose)
  )
    return null
  return account
}
function database() {
  let commands = new Map<string, StoredCommand>()
  let reviews: Record<string, unknown>[] = []
  const tx = {
    $queryRaw: async (query: unknown, ...values: unknown[]) => {
      const sql = Array.isArray(query)
        ? query.join("")
        : ((query as { sql?: string }).sql ?? "")
      if (sql.includes('FROM "Membership"'))
        return [
          {
            role: values[1] === "reviewing-owner" ? "OWNER" : "CASHIER",
            status: "ACTIVE",
            staffAccessMode: "LEGACY",
            isActive: true,
          },
        ]
      if (sql.includes('FROM "Tenant"'))
        return [{ id: "tenant-current", metadata: null }]
      if (sql.includes('FROM "Store"'))
        return [{ id: "store-current", currencyCode: "NGN" }]
      if (sql.includes('FROM "FinanceBook"')) return [{ id: "book-current" }]
      if (sql.includes('FROM "OfflineDevice"')) return [{ id: "stored-device" }]
      if (sql.includes('FROM "OfflineCommand"'))
        return [{ id: "stored-command" }]
      throw Error(`Unsupported inert SQL port: ${sql}`)
    },
    $executeRaw: async () => 1,
    store: { findFirst: async () => ({ currencyCode: "NGN" }) },
    financeAccount: {
      findFirst: async ({ where }: { where: AccountWhere }) =>
        accountFor(where),
    },
    sellableOffering: { findMany: async () => [] },
    offlineDevice: {
      findFirst: async () => ({ id: "stored-device" }),
      findUnique: async () => ({ status: "ACTIVE" }),
    },
    offlineDeviceRevocation: { findFirst: async () => null },
    tenant: { findFirstOrThrow: async () => ({ metadata: null }) },
    offlineCommand: {
      findUnique: async ({
        where,
      }: {
        where: {
          tenantId_clientCommandId: {
            tenantId: string
            clientCommandId: string
          }
        }
      }) =>
        [...commands.values()].find(
          (row) =>
            row.tenantId === where.tenantId_clientCommandId.tenantId &&
            row.clientCommandId ===
              where.tenantId_clientCommandId.clientCommandId,
        ) ?? null,
      findFirst: async ({
        where,
      }: {
        where: {
          id: string
          tenantId: string
          conflictCode?: unknown
          status?: string | { in: string[] }
        }
      }) => {
        const command = [...commands.values()].find(
          (row) =>
            row.id === where.id &&
            row.tenantId === where.tenantId &&
            (where.conflictCode !== null || row.conflictCode === null) &&
            (where.status === undefined ||
              (typeof where.status === "string"
                ? row.status === where.status
                : where.status.in.includes(row.status))),
        )
        return command
          ? { ...command, offlineDevice: { deviceId: "registered-device" } }
          : null
      },
      findMany: async ({
        where,
      }: { where: { tenantId: string; clientCommandId?: { in: string[] } } }) =>
        [...commands.values()].filter(
          (row) =>
            row.tenantId === where.tenantId &&
            (!where.clientCommandId ||
              where.clientCommandId.in.includes(row.clientCommandId)),
        ),
      create: async ({
        data,
      }: {
        data: Partial<StoredCommand> &
          Pick<
            StoredCommand,
            | "payload"
            | "tenantId"
            | "storeId"
            | "offlineDeviceId"
            | "clientCommandId"
            | "payloadHash"
            | "createdAtClient"
            | "eventVersion"
          >
      }) => {
        const command = {
          id: "stored-command",
          authoritativeState: null,
          result: null,
          conflictCode: null,
          conflictMessage: null,
          processedAt: null,
          status: "PENDING",
          dependencyClientIds: [],
          attemptedState: null,
          ...structuredClone(data),
        }
        commands.set(command.id, command)
        return command
      },
      update: async ({
        where,
        data,
      }: { where: { id: string }; data: Partial<StoredCommand> }) => {
        const previous = commands.get(where.id)
        if (!previous) throw Error("Missing inert command")
        const command = { ...previous, ...structuredClone(data) }
        commands.set(command.id, command)
        return command
      },
    },
    offlineConflictReview: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        reviews.push(structuredClone(data))
        return data
      },
    },
  }
  const db = {
    ...tx,
    $transaction: async (
      operation: (transaction: typeof tx) => Promise<unknown>,
    ) => {
      const savedCommands = structuredClone(commands)
      const savedReviews = structuredClone(reviews)
      const savedEffects = paymentEffects
      try {
        // Prisma supplies a distinct transaction client identity each time.
        return await operation(new Proxy(tx, {}))
      } catch (error) {
        commands = savedCommands
        reviews = savedReviews
        paymentEffects = savedEffects
        throw error
      }
    },
  } as unknown as PrismaClient
  return { db, commands: () => [...commands.values()], reviews: () => reviews }
}
function replay(
  db: PrismaClient,
  requiresApproval = false,
  command = selectedCommand(),
) {
  return replayOfflineCommands(db, {
    actorUserId: "original-cashier",
    tenantId: "tenant-current",
    storeId: "store-current",
    deviceId: "registered-device",
    acceptNewCommands: true,
    requiresApproval,
    capabilities: { operateOrders: true },
    commands: [command],
  })
}
const approve = (db: PrismaClient) =>
  reviewOfflineConflict(db, {
    commandId: "stored-command",
    actorUserId: "reviewing-owner",
    tenantId: "tenant-current",
    decision: "approve",
  })

for (const staged of [false, true]) {
  test(`${staged ? "approval" : "direct replay"} preserves the selected account and original payment author`, async () => {
    const { db, commands, reviews } = database()
    const result = await replay(db, staged)
    expect(commands()[0].payload.initialPayment.moneyAccountId).toBe(
      "selected-bank-account",
    )
    if (staged) {
      expect(result[0].status).toBe("REVIEW_REQUIRED")
      expect(paymentEffects).toBe(0)
      expect(canonicalInputs).toHaveLength(0)
      expect((await approve(db)).status).toBe("APPLIED")
      expect(reviews()[0].reviewedByUserId).toBe("reviewing-owner")
    } else expect(result[0].status).toBe("APPLIED")
    expect(canonicalInputs).toHaveLength(1)
    expect(canonicalInputs[0]).toMatchObject({
      actorUserId: "original-cashier",
      storeId: "store-current",
      tenantId: "tenant-current",
      clientOrderId: "selected-offline-order",
      initialPayment: {
        moneyAccountId: "selected-bank-account",
        amountMinor: 2_000,
        clientPaymentId: "selected-offline-payment",
        method: "bank_transfer",
      },
    })
    expect(paymentEffects).toBe(1)
    await replay(db)
    expect(canonicalInputs).toHaveLength(1)
    expect(paymentEffects).toBe(1)
    const changed = selectedCommand()
    if (!changed.payload.initialPayment) throw Error("Expected payment")
    changed.payload.initialPayment.moneyAccountId = "unrelated-account"
    await expect(replay(db, false, changed)).rejects.toMatchObject({
      code: "IDEMPOTENCY_MISMATCH",
    })
    expect(paymentEffects).toBe(1)
  })
}

test("strict replay schema rejects misplaced account and forged author rather than silently stripping them", () => {
  const command = selectedCommand()
  for (const payload of [
    { ...command.payload, moneyAccountId: "unrelated-account" },
    { ...command.payload, actorUserId: "forged-owner" },
    {
      ...command.payload,
      initialPayment: {
        ...command.payload.initialPayment,
        actorUserId: "forged-owner",
      },
    },
  ])
    expect(
      offlineReplaySchema.safeParse({
        deviceId: "registered-device",
        commands: [{ ...command, payload }],
      }).success,
    ).toBe(false)
})

for (const [label, invalidate] of [
  [
    "paused",
    () => {
      if (account) account.paymentsPausedAt = new Date()
    },
  ],
  [
    "archived",
    () => {
      if (account) account.archivedAt = new Date()
    },
  ],
  [
    "foreign Book/currency",
    () => {
      if (account) account.bookId = "foreign-book"
    },
  ],
  [
    "changed payment method",
    () => {
      if (account) account.paymentMethods = ["cash"]
    },
  ],
  [
    "removed",
    () => {
      account = null
    },
  ],
] as const) {
  for (const staged of [false, true]) {
    test(`${staged ? "approval" : "replay"} retains ${label} account as a review conflict without substituting`, async () => {
      const { db, commands } = database()
      if (staged) await replay(db, true)
      invalidate()
      const result = staged ? await approve(db) : (await replay(db))[0]
      expect(result.status).toBe("REVIEW_REQUIRED")
      expect(result.conflictCode).not.toBeNull()
      expect(result.result).toBeNull()
      expect(commands()[0].status).toBe("REVIEW_REQUIRED")
      expect(commands()[0].payload.initialPayment.moneyAccountId).toBe(
        "selected-bank-account",
      )
      expect(canonicalInputs[0].initialPayment.moneyAccountId).toBe(
        "selected-bank-account",
      )
      expect(paymentEffects).toBe(0)
    })
  }
}

for (const [code, expectedConflict] of [
  ["FORBIDDEN", "PERMISSION_CHANGED"],
  ["CLOSED_PERIOD", "INVALID_COMMAND"],
] as const) {
  for (const staged of [false, true]) {
    test(`${staged ? "approval" : "replay"} persists ${code} Finance failure with no applied payment`, async () => {
      const { db, commands, reviews } = database()
      if (staged) await replay(db, true)
      canonicalFailure = new FinanceError(
        code,
        "Selected account cannot accept this payment.",
      )
      const result = staged ? await approve(db) : (await replay(db))[0]
      expect(result.status).toBe("REVIEW_REQUIRED")
      expect(result.conflictCode).toBe(expectedConflict)
      expect(result.result).toBeNull()
      expect(commands()[0].payload.initialPayment.moneyAccountId).toBe(
        "selected-bank-account",
      )
      expect(paymentEffects).toBe(0)
      expect(reviews()).toHaveLength(staged ? 1 : 0)
    })
  }
}

for (const staged of [false, true]) {
  test(`${staged ? "approval" : "replay"} rethrows unexpected errors without inventing a domain conflict`, async () => {
    const { db, commands, reviews } = database()
    if (staged) await replay(db, true)
    const error = new Error("Unexpected inert repository failure")
    canonicalFailure = error
    await expect(staged ? approve(db) : replay(db)).rejects.toBe(error)
    expect(commands()[0].status).toBe(staged ? "REVIEW_REQUIRED" : "PENDING")
    expect(commands()[0].conflictCode).toBeNull()
    expect(commands()[0].result).toBeNull()
    expect(reviews()).toHaveLength(0)
    expect(paymentEffects).toBe(0)
  })
}

for (const staged of [false, true]) {
  test(`${staged ? "approval" : "replay"} retains the existing Catalog revision-conflict classification`, async () => {
    const { db } = database()
    if (staged) await replay(db, true)
    canonicalFailure = new CatalogError(
      "REVISION_CONFLICT",
      "Stock changed while offline.",
    )
    const result = staged ? await approve(db) : (await replay(db))[0]
    expect(result.status).toBe("REVIEW_REQUIRED")
    expect(result.conflictCode).toBe("BALANCE_REVISION_CHANGED")
    expect(result.result).toBeNull()
    expect(paymentEffects).toBe(0)
  })
}

test("real collection projection debits the exact selected account and credits one collection control", async () => {
  const source = {
    tenantId: "tenant-current",
    orderId: "canonical-order",
    paymentId: "canonical-payment",
  }
  const order = {
    id: source.orderId,
    currencyCode: "NGN",
    customerId: null,
    storeId: "store-current",
    orderNumber: "ORD-005",
  }
  const accountReads: AccountWhere[] = []
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) =>
      strings.join("").includes("FinanceBook")
        ? [{ id: "book-current" }]
        : [{ ...order }],
    commercialOrder: { findFirst: async () => order },
    financeBook: {
      findUniqueOrThrow: async () => ({
        id: "book-current",
        tenantId: source.tenantId,
        currencyCode: "NGN",
      }),
    },
    commercialOrderPayment: {
      findFirst: async () => ({
        id: source.paymentId,
        moneyAccountId: "selected-bank-account",
        amountMinor: 2_000,
        type: "PAYMENT",
        recordedByUserId: "original-cashier",
        recordedAt: new Date("2026-10-17T06:00:00Z"),
      }),
    },
    financeAccount: {
      findFirst: async ({ where }: { where: AccountWhere }) => {
        accountReads.push(where)
        return accountFor(where)
      },
      findUnique: async () => ({
        id: "collections-control",
        kind: "LIABILITY",
        purpose: "OTHER",
        archivedAt: null,
        name: "Order collections awaiting reconciliation",
      }),
    },
    financeJournalEntry: { findUnique: async () => null },
  }
  const result = await resolveOrderCollectionPosting(tx as never, source)
  if (result.billed) throw Error("Expected ordinary collection projection")
  expect(accountReads).toEqual([
    expect.objectContaining({
      id: "selected-bank-account",
      bookId: "book-current",
      archivedAt: null,
    }),
  ])
  expect(result.input).toMatchObject({
    tenantId: source.tenantId,
    actorUserId: "original-cashier",
    storeId: "store-current",
    sourceKind: "COMMERCIAL_ORDER_COLLECTION",
    sourceId: source.paymentId,
    lines: [
      {
        accountId: "selected-bank-account",
        side: "DEBIT",
        amountMinor: "2000",
      },
      { accountId: "collections-control", side: "CREDIT", amountMinor: "2000" },
    ],
  })
})

test("real account validator refuses an unavailable account as a Finance conflict", async () => {
  await expect(
    assertOrderPaymentAccountInTransaction(
      { financeAccount: { findFirst: async () => null } } as never,
      {
        bookId: "book-current",
        accountId: "selected-bank-account",
        method: "bank_transfer",
        refund: false,
      },
    ),
  ).rejects.toBeInstanceOf(FinanceError)
})
