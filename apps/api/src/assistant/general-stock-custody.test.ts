import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralTransactionContext } from "./general-actions"

// Only the canonical in-transaction command and its lock helper are stood in
// for; the adapter, policy, eligibility filter and signing digest are real.
const commands: Array<Record<string, unknown>> = []
const locks: string[][] = []
const actual = await import("@ewatrade/db/queries")
mock.module("@ewatrade/db/queries", () => ({
  ...actual,
  lockInventorySourcesForReview: async (
    _tx: unknown,
    input: { balanceSourceIds: string[] },
  ) => {
    locks.push([...input.balanceSourceIds])
  },
  moveInventoryCustodyInTransaction: async (
    _tx: unknown,
    input: Record<string, unknown>,
  ) => {
    commands.push(input)
    return { id: `op-${commands.length}` }
  },
}))
const { custodyMoveKind, stockCustodyMove } = await import(
  "./general-stock-custody"
)

const savedKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "c".repeat(32)
})
afterAll(() => {
  if (savedKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = savedKey
})

type Move = Extract<GeneralAction, { action: "stock_custody_move" }>
const decimal = (value: string) => ({ toFixed: () => value })
const unit = {
  id: "unit-crate",
  name: "crate",
  factor: decimal("30"),
  transactionScale: 0,
  configurationVersionId: "config-1",
}
function balance(
  id: string,
  custodyType: "STORE" | "STAFF" | "SESSION",
  custodyReferenceId: string,
  options: { onHand?: string; reserved?: string; revision?: number } = {},
) {
  return {
    id,
    tenantId: "tenant-a",
    storeId: "store-a",
    variantId: "var-eggs",
    inventoryUnitId: "unit-crate",
    custodyType,
    custodyReferenceId,
    revision: options.revision ?? 4,
    onHandQuantity: decimal(options.onHand ?? "10"),
    reservedQuantity: decimal(options.reserved ?? "3"),
    inventoryUnit: unit,
    product: {
      catalogItemId: "item-eggs",
      catalogItem: { name: "Eggs", tenantId: "tenant-a" },
    },
    variant: { id: "var-eggs", name: "Large", catalogItemId: "item-eggs" },
  }
}
type Options = {
  role?: string
  activeStoreId?: string
  staffAccess?: Record<string, unknown> | null
  eligible?: string[]
  members?: string[]
  balances?: ReturnType<typeof balance>[]
}
function context(options: Options = {}) {
  const balances = options.balances ?? [
    balance("store-eggs", "STORE", ""),
    balance("amina-eggs", "STAFF", "amina-u", { onHand: "4", reserved: "0" }),
  ]
  const eligible = options.eligible ?? ["amina-u", "bola-u"]
  const members = options.members ?? ["amina-u", "bola-u", "gone-u"]
  const db = {
    stockBalanceSource: {
      findFirst: async (args: {
        where: { id: string; tenantId: string; storeId: string }
      }) =>
        balances.find(
          (row) =>
            row.id === args.where.id &&
            row.tenantId === args.where.tenantId &&
            row.storeId === args.where.storeId,
        ) ?? null,
      findUnique: async (args: {
        where: {
          storeId_variantId_inventoryUnitId_custodyType_custodyReferenceId: {
            custodyType: string
            custodyReferenceId: string
          }
        }
      }) => {
        const key =
          args.where
            .storeId_variantId_inventoryUnitId_custodyType_custodyReferenceId
        return (
          balances.find(
            (row) =>
              row.custodyType === key.custodyType &&
              row.custodyReferenceId === key.custodyReferenceId,
          ) ?? null
        )
      },
    },
    membership: {
      // Assignment uses the canonical eligibility filter (it carries `OR`);
      // a return only looks the holder up in this business.
      findFirst: async (args: {
        where: { userId: string; tenantId: string; OR?: unknown }
      }) => {
        if (args.where.tenantId !== "tenant-a") return null
        const pool = args.where.OR ? eligible : members
        return pool.includes(args.where.userId)
          ? {
              id: `${args.where.userId}-m`,
              userId: args.where.userId,
              status: "ACTIVE",
              user: {
                name: args.where.userId.split("-")[0],
                displayName: null,
              },
            }
          : null
      },
    },
  }
  const ctx = {
    session: { user: { id: "manager-u" }, session: { id: "session" } },
    tenantContext: {
      tenant: { id: "tenant-a", dataClassification: "QA" },
      membership: { role: options.role ?? "MANAGER" },
      activeStore: { id: options.activeStoreId ?? "store-a", name: "Wuse" },
      stores: [{ id: "store-a" }, { id: "store-b" }],
      staffAccess:
        options.staffAccess === null
          ? null
          : (options.staffAccess ?? {
              status: "ACTIVE",
              mode: "LEGACY",
              businessRole: "MANAGER",
              assignments: [],
            }),
    },
    db,
  } as unknown as GeneralTransactionContext
  return { ctx, balances }
}
const assign: Move = {
  action: "stock_custody_move",
  sourceBalanceSourceId: "store-eggs",
  target: { type: "staff", userId: "amina-u" },
  quantity: "5",
  reason: "Delivery round",
}
const giveBack: Move = {
  ...assign,
  sourceBalanceSourceId: "amina-eggs",
  target: { type: "store" },
  quantity: "4",
}

test("only Store → staff assignment and staff → Store return are supported", () => {
  const store = { custodyType: "STORE" as const, custodyReferenceId: "" }
  const amina = { custodyType: "STAFF" as const, custodyReferenceId: "amina-u" }
  expect(custodyMoveKind(store, { type: "staff", userId: "amina-u" })).toEqual({
    kind: "assignment",
    staffUserId: "amina-u",
  })
  expect(custodyMoveKind(amina, { type: "store" })).toEqual({
    kind: "return",
    staffUserId: "amina-u",
  })
  for (const [source, target] of [
    [store, { type: "store" }],
    [amina, { type: "staff", userId: "amina-u" }],
    [amina, { type: "staff", userId: "bola-u" }],
    [{ custodyType: "SESSION", custodyReferenceId: "s-1" }, { type: "store" }],
    [{ custodyType: "TRANSIT", custodyReferenceId: "t-1" }, { type: "store" }],
  ] as const)
    expect(custodyMoveKind(source, target)).toHaveProperty("refused")
})

test("review shows on hand, reserved and movable stock for both holders", async () => {
  const review = await stockCustodyMove.review?.(context().ctx, assign)
  expect(review?.lines).toEqual([
    "Give 5 crate to amina at Wuse.",
    "Eggs · Large · factor 30 · canonical quantity 150.",
    "Wuse Store stock 10 → 5; reserved 3; could move 7.",
    "amina's stock 4 → 9.",
    "Stock stays in this Store; only who holds it changes. Carrying value follows the saved records.",
    "Reason: Delivery round",
  ])
  const back = await stockCustodyMove.review?.(context().ctx, giveBack)
  expect(back?.lines.slice(0, 4)).toEqual([
    "Return 4 crate from amina to Wuse.",
    "Eggs · Large · factor 30 · canonical quantity 120.",
    "amina's stock 4 → 0; reserved 0; could move 4.",
    "Wuse Store stock 10 → 14.",
  ])
})

test("a new custody balance is named, and returns work after the holder left", async () => {
  const review = await stockCustodyMove.review?.(context().ctx, {
    ...assign,
    target: { type: "staff", userId: "bola-u" },
  })
  expect(review?.lines[3]).toBe("bola's stock 0 → 5 (new custody balance).")
  const left = context({
    eligible: ["bola-u"],
    members: ["bola-u"],
  })
  const back = await stockCustodyMove.review?.(left.ctx, giveBack)
  expect(back?.lines[0]).toBe(
    "Return 4 crate from a former staff member to Wuse.",
  )
})

test("quantity never exceeds on hand minus reserved", async () => {
  await expect(
    stockCustodyMove.validate(
      context().ctx,
      { ...assign, quantity: "8" },
      false,
    ),
  ).rejects.toThrow("Only 7 crate can move: on hand 10, reserved 3.")
  await expect(
    stockCustodyMove.validate(
      context().ctx,
      { ...assign, quantity: "1.5" },
      false,
    ),
  ).rejects.toThrow()
})

test("ineligible, revoked and foreign targets refuse without disclosure", async () => {
  await expect(
    stockCustodyMove.validate(
      context({ eligible: ["bola-u"] }).ctx,
      assign,
      false,
    ),
  ).rejects.toThrow("That staff member can't hold stock for this Store.")
  await expect(
    stockCustodyMove.validate(
      context().ctx,
      { ...assign, sourceBalanceSourceId: "foreign-balance" },
      false,
    ),
  ).rejects.toThrow("This custody move is unavailable.")
  const otherStore = balance("store-b-eggs", "STORE", "")
  otherStore.storeId = "store-b"
  await expect(
    stockCustodyMove.validate(
      context({ balances: [otherStore] }).ctx,
      { ...assign, sourceBalanceSourceId: "store-b-eggs" },
      false,
    ),
  ).rejects.toThrow("This custody move is unavailable.")
  for (const move of [
    { ...giveBack, target: { type: "staff" as const, userId: "bola-u" } },
    { ...assign, target: { type: "store" as const } },
  ])
    await expect(
      stockCustodyMove.validate(context().ctx, move, false),
    ).rejects.toThrow()
  const session = context({
    balances: [balance("session-eggs", "SESSION", "s-1")],
  })
  await expect(
    stockCustodyMove.validate(
      session.ctx,
      { ...giveBack, sourceBalanceSourceId: "session-eggs" },
      false,
    ),
  ).rejects.toThrow("Session and transit stock move through their own")
})

test("current inventory authority in this Store is required at every stage", async () => {
  const scopedCashier = {
    status: "ACTIVE",
    mode: "SCOPED",
    businessRole: "MANAGER",
    assignments: [{ storeId: "store-a", status: "ACTIVE", role: "CASHIER" }],
  }
  for (const options of [
    { role: "CASHIER" },
    { activeStoreId: "store-b" },
    { staffAccess: scopedCashier },
  ]) {
    const { ctx } = context(options)
    for (const lock of [false, true])
      await expect(
        stockCustodyMove.validate(ctx, assign, lock),
      ).rejects.toThrow()
    await expect(
      stockCustodyMove.prepareExecution?.(ctx, assign, {
        clientOperationId: "key",
        expectedReviewDigest: "x",
      }),
    ).rejects.toThrow()
  }
})

test("source, reserved and target drift change the signed review", async () => {
  const base = await stockCustodyMove.validate(context().ctx, assign, false)
  const drifted = [
    context({
      balances: [
        balance("store-eggs", "STORE", "", { revision: 5 }),
        balance("amina-eggs", "STAFF", "amina-u"),
      ],
    }),
    context({
      balances: [
        balance("store-eggs", "STORE", "", { reserved: "4" }),
        balance("amina-eggs", "STAFF", "amina-u"),
      ],
    }),
    context({
      balances: [
        balance("store-eggs", "STORE", ""),
        balance("amina-eggs", "STAFF", "amina-u", { revision: 9 }),
      ],
    }),
    // The target did not exist at review and was created since.
    context({ balances: [balance("store-eggs", "STORE", "")] }),
  ]
  for (const { ctx } of drifted) {
    const target = await stockCustodyMove.validate(ctx, assign, false)
    expect(target?.id).toBe(base?.id)
    expect(target?.revision).not.toBe(base?.revision)
  }
})

test("confirmation locks source and target, then calls the canonical command exactly", async () => {
  commands.length = 0
  locks.length = 0
  const { ctx } = context()
  const prepared = await stockCustodyMove.prepareExecution?.(ctx, assign, {
    clientOperationId: "proposal-key",
    expectedReviewDigest: "x",
  })
  expect(locks.at(-1)?.sort()).toEqual(["amina-eggs", "store-eggs"])
  const receipt = await prepared?.execute("proposal-key")
  expect(commands).toEqual([
    {
      clientOperationId: "proposal-key",
      expectedSourceRevision: 4,
      expectedTargetRevision: 4,
      quantity: "5",
      reason: "Delivery round",
      schemaVersion: 1,
      source: "assistant",
      sourceBalanceSourceId: "store-eggs",
      targetCustodyReferenceId: "amina-u",
      targetCustodyType: "staff",
      tenantId: "tenant-a",
      actorUserId: "manager-u",
    },
  ])
  expect(receipt).toMatchObject({
    kind: "inventory",
    recordId: "op-1",
    catalogItemId: "item-eggs",
    title: "Stock assigned",
  })
  // A replay of the same proposal sends identical input, so the command's
  // idempotency returns the original operation instead of moving again.
  await prepared?.execute("proposal-key")
  expect(commands[1]).toEqual(commands[0])
})

test("an absent target is pinned at revision 0; a return targets Store custody", async () => {
  commands.length = 0
  const fresh = context({ balances: [balance("store-eggs", "STORE", "")] })
  await stockCustodyMove.execute(fresh.ctx, assign, "proposal-key-1")
  expect(commands[0]).toMatchObject({
    expectedTargetRevision: 0,
    targetCustodyType: "staff",
  })
  await stockCustodyMove.execute(context().ctx, giveBack, "proposal-key-2")
  expect(commands[1]).toMatchObject({
    sourceBalanceSourceId: "amina-eggs",
    targetCustodyType: "store",
    targetCustodyReferenceId: "",
    expectedTargetRevision: 4,
  })
})

test("central authority: inventory managers and stock-scoped staff only, dashboard only", async () => {
  const { assertGeneralAction, assertGeneralActionAuthority } = await import(
    "./general-context"
  )
  const scoped = (role: string, status = "ACTIVE") => ({
    status: "ACTIVE",
    mode: "SCOPED",
    businessRole: "MANAGER",
    catalogEditor: false,
    assignments: [{ storeId: "store-a", status, role }],
  })
  const central = (
    role: string,
    staffAccess: Record<string, unknown>,
    client = "dashboard",
  ) =>
    ({
      session: { user: { id: "manager-u" }, session: { id: "session" } },
      requestHeaders: new Headers({ "x-assistant-client": client }),
      tenantContext: {
        tenant: { id: "tenant-a", dataClassification: "QA" },
        membership: { role },
        activeStore: { id: "store-a", name: "Wuse" },
        stores: [{ id: "store-a" }],
        staffAccess,
      },
    }) as unknown as GeneralTransactionContext
  const legacy = (role: string) => ({
    status: "ACTIVE",
    mode: "LEGACY",
    businessRole: role,
    assignments: [],
  })
  for (const role of ["OWNER", "ADMIN", "MANAGER"])
    expect(
      assertGeneralActionAuthority(
        central(role, legacy(role)),
        "stock_custody_move",
      ),
    ).toMatchObject({ tenantId: "tenant-a", storeId: "store-a" })
  for (const storeRole of ["MANAGER", "OPERATOR"])
    expect(() =>
      assertGeneralActionAuthority(
        central("MANAGER", scoped(storeRole)),
        "stock_custody_move",
      ),
    ).not.toThrow()
  for (const ctx of [
    central("CASHIER", legacy("CASHIER")),
    central("OPERATOR", legacy("OPERATOR")),
    central("MANAGER", scoped("CASHIER")),
    central("MANAGER", scoped("MANAGER", "REVOKED")),
    central("MANAGER", { ...scoped("MANAGER"), assignments: [] }),
    central("MANAGER", { ...legacy("MANAGER"), status: "SUSPENDED" }),
    central("OWNER", legacy("OWNER"), "mobile"),
  ])
    expect(() =>
      assertGeneralActionAuthority(ctx, "stock_custody_move"),
    ).toThrow()
  // Still planned: authority passes, but no new effect may start.
  expect(() =>
    assertGeneralAction(
      central("OWNER", legacy("OWNER")),
      "stock_custody_move",
    ),
  ).toThrow()
})
