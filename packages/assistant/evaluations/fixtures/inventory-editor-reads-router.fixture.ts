import { beforeEach, expect, mock, test } from "bun:test"
import type { EwaTradeRole } from "@ewatrade/auth/roles"
import type { StaffAccess, StoreStaffRole } from "@ewatrade/auth/store-access"
import { TRPCError, initTRPC } from "@trpc/server"
import {
  inventoryBalanceSourceSchema,
  inventoryCustodyAssigneesSchema,
} from "../../../../apps/api/src/schemas/inventory"
import { scopeStaffRequest } from "../../../../apps/api/src/utils/staff-request-access"
import { CatalogError } from "../../../db/src/queries/catalog-errors"
import { FinanceError } from "../../../db/src/queries/finance/rules"
import { getInventoryBalanceSource } from "../../../db/src/queries/inventory-reporting"
import { listServiceAssignees } from "../../../db/src/queries/service-work"

// Isolated source fixture: actual router, strict schemas, central Store guard,
// canonical balance serializer and canonical Store-assignee predicate/query.
// Authentication/tenant resolution and Prisma transport are inert stand-ins.
// This does not prove HTTP authentication, current real membership or SQL.
// Run separately: --env-file=/dev/null, with an unreachable DB initializer.
const scope = { tenantId: "business", storeId: "store-a", actorUserId: "actor" }
const secondStore = "store-b"
const calls: Array<{ delegate: string; args: unknown }> = []
let forbiddenCalls = 0
let failure: Error | null = null
function forbidden() {
  forbiddenCalls++
  throw Error("No writes, providers, transactions, scans or unrelated reads")
}
mock.module("@ewatrade/jobs", () => ({
  enqueueServiceNotificationIntent: forbidden,
  customerMessagingProviderStatus: forbidden,
}))
mock.module("@ewatrade/db/queries", () => ({
  CatalogError,
  FinanceError,
  getInventoryBalanceSource,
  listServiceAssignees,
  commitCatalogStockReservation: forbidden,
  correctStockOperation: forbidden,
  createAndDispatchStockTransfer: forbidden,
  createInventoryCloseout: forbidden,
  createStockCount: forbidden,
  exportInventoryAuditRows: forbidden,
  finalizeInventoryCloseout: forbidden,
  finalizeStockCount: forbidden,
  getCatalogOfferingAvailability: forbidden,
  getConfiguredCatalogOfferingAvailability: forbidden,
  getInventoryReconciliationSummary: forbidden,
  getStockOperationAudit: forbidden,
  getStockCountReview: forbidden,
  getStockTransferReview: forbidden,
  getInventoryCloseoutReview: forbidden,
  listInventoryCloseouts: forbidden,
  listCatalogLowStockPage: forbidden,
  listInventoryBalanceReport: forbidden,
  listInventoryBalancePage: forbidden,
  listInventoryCompatibleTotalsPage: forbidden,
  listInventoryOperationHistory: forbidden,
  listStockOperationCategoryNames: forbidden,
  listStockTransfers: forbidden,
  moveInventoryCustody: forbidden,
  postSingleBalanceStockOperation: forbidden,
  receiveOrCancelStockTransfer: forbidden,
  releaseCatalogStockReservation: forbidden,
  reserveCatalogOfferingStock: forbidden,
  transformPackagedStock: forbidden,
}))

function balance(
  id: string,
  storeId = scope.storeId,
  tenantId = scope.tenantId,
) {
  return {
    id,
    tenantId,
    storeId,
    productId: "product",
    variantId: "variant",
    inventoryUnitId: "unit",
    revision: 7,
    custodyType: "STORE",
    custodyReferenceId: "",
    kind: "SHARED_POOL",
    onHandQuantity: "9007199254740993.125",
    reservedQuantity: "0.125",
    product: { catalogItem: { id: "catalog-item", name: "Eggs" } },
    variant: { name: "Large" },
    store: { name: storeId },
    inventoryUnit: {
      name: "Piece",
      factor: "1",
      transactionScale: 3,
      configurationVersionId: "configuration",
    },
    privateSecret: "must not project",
  }
}
const balances = [
  balance("balance-a"),
  balance("balance-b", secondStore),
  balance("foreign-balance", scope.storeId, "foreign-business"),
]
type Assignment = { tenantId: string; storeId: string; status: string }
function member(
  userId: string,
  options: {
    tenantId?: string
    role?: string
    status?: string
    mode?: string
    assignments?: Assignment[]
    name?: string | null
    displayName?: string | null
  } = {},
) {
  return {
    id: `member-${userId}`,
    userId,
    tenantId: options.tenantId ?? scope.tenantId,
    role: options.role ?? "CASHIER",
    status: options.status ?? "ACTIVE",
    staffAccessMode: options.mode ?? "SCOPED",
    staffStoreAssignments: options.assignments ?? [],
    user: {
      name: options.name === undefined ? "Same name" : options.name,
      displayName: options.displayName ?? null,
      email: `${userId}@private.invalid`,
      privateSecret: "not a label",
    },
  }
}
const assignment = (
  storeId = scope.storeId,
  status = "ACTIVE",
  tenantId = scope.tenantId,
): Assignment => ({ tenantId, storeId, status })
const members = [
  member("owner", { role: "OWNER" }),
  member("admin", { role: "ADMIN" }),
  member("legacy", { mode: "LEGACY" }),
  member("same-a", { assignments: [assignment()] }),
  member("same-b", { assignments: [assignment()] }),
  member("unnamed", { name: null, assignments: [assignment()] }),
  member("blank", { displayName: "   ", assignments: [assignment()] }),
  member("contact-label", {
    name: "contact-label@private.invalid",
    assignments: [assignment()],
  }),
  member("other-store", { assignments: [assignment(secondStore)] }),
  member("suspended", { status: "SUSPENDED", assignments: [assignment()] }),
  member("inactive-assignment", {
    assignments: [assignment(scope.storeId, "SUSPENDED")],
  }),
  member("foreign-assignment", {
    assignments: [assignment(scope.storeId, "ACTIVE", "foreign-business")],
  }),
  member("foreign-member", {
    tenantId: "foreign-business",
    assignments: [assignment()],
  }),
  member("support", { role: "SUPPORT", mode: "LEGACY" }),
  member("customer", { role: "MEMBER", assignments: [assignment()] }),
  member("unassigned"),
]

// Bounded Prisma predicate interpreter for controlled rows. It deliberately
// applies the actual canonical WHERE, rather than returning a canned success.
function matches(row: unknown, where: unknown): boolean {
  if (!where || typeof where !== "object" || Array.isArray(where)) return false
  if (!row || typeof row !== "object") return false
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true
    if (key === "OR")
      return (
        Array.isArray(expected) &&
        expected.some((branch) => matches(row, branch))
      )
    const actual: unknown = Reflect.get(row, key)
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("in" in expected)
        return Array.isArray(expected.in) && expected.in.includes(actual)
      if ("some" in expected)
        return (
          Array.isArray(actual) &&
          actual.some((child) => matches(child, expected.some))
        )
      return matches(actual, expected)
    }
    return actual === expected
  })
}
const db = new Proxy(
  {
    stockBalanceSource: new Proxy(
      {
        async findFirst(args: {
          where: unknown
          include?: unknown
          select?: unknown
        }) {
          calls.push({
            delegate: args.include ? "balance.exact" : "balance.scope",
            args,
          })
          if (failure) throw failure
          return balances.find((row) => matches(row, args.where)) ?? null
        },
      },
      {
        get(target, key) {
          return key === "findFirst" ? target.findFirst : forbidden()
        },
      },
    ),
    membership: new Proxy(
      {
        async findMany(args: {
          where: unknown
          include: unknown
          orderBy: unknown
        }) {
          calls.push({ delegate: "membership", args })
          if (failure) throw failure
          return members.filter((row) => matches(row, args.where))
        },
      },
      {
        get(target, key) {
          return key === "findMany" ? target.findMany : forbidden()
        },
      },
    ),
  },
  {
    get(target, key) {
      if (key === "stockBalanceSource") return target.stockBalanceSource
      if (key === "membership") return target.membership
      return forbidden()
    },
  },
)
type FixtureContext = {
  session: { user: { id: string } } | null
  tenantContext: {
    tenant: { id: string }
    membership: { role: EwaTradeRole }
    activeStore: { id: string } | null
    stores: Array<{ id: string }>
    staffAccess: StaffAccess
  }
  db: typeof db
}
function context(
  options: {
    role?: EwaTradeRole
    mode?: "LEGACY" | "SCOPED"
    assignments?: StaffAccess["assignments"]
    status?: string
    activeStore?: string | null
    authenticated?: boolean
  } = {},
): FixtureContext {
  const role = options.role ?? "OWNER"
  return {
    session:
      options.authenticated === false
        ? null
        : { user: { id: scope.actorUserId } },
    tenantContext: {
      tenant: { id: scope.tenantId },
      membership: { role },
      activeStore:
        options.activeStore === null
          ? null
          : { id: options.activeStore ?? scope.storeId },
      stores: [{ id: scope.storeId }, { id: secondStore }],
      staffAccess: {
        businessRole: role,
        status: options.status ?? "ACTIVE",
        mode: options.mode ?? "LEGACY",
        catalogEditor: false,
        assignments: options.assignments ?? [],
      },
    },
    db,
  }
}
const scoped = (
  role: StoreStaffRole,
  storeId = scope.storeId,
  status = "ACTIVE",
) =>
  context({
    role: "CASHIER",
    mode: "SCOPED",
    assignments: [{ storeId, role, status }],
  })
const transport = initTRPC.context<FixtureContext>().create()
mock.module(
  new URL("../../../../apps/api/src/trpc/init.ts", import.meta.url).pathname,
  () => ({
    createTRPCRouter: transport.router,
    protectedProcedure: transport.procedure.use(async (opts) => {
      // Only an explicit transport boundary, never claimed as real authentication.
      if (!opts.ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" })
      const raw: unknown = await opts.getRawInput()
      const input: unknown = await Reflect.apply(scopeStaffRequest, undefined, [
        opts.ctx,
        `inventory.${opts.path}`,
        opts.type,
        raw,
      ])
      return opts.next({ getRawInput: async () => input })
    }),
  }),
)
const { inventoryRouter } = await import(
  "../../../../apps/api/src/trpc/routers/inventory"
)
function call(
  method: string,
  input: unknown,
  ctx = context(),
): Promise<unknown> {
  const caller = Reflect.apply(inventoryRouter.createCaller, inventoryRouter, [
    ctx,
  ])
  return Reflect.apply(Reflect.get(caller, method), caller, [input])
}
beforeEach(() => {
  calls.length = 0
  forbiddenCalls = 0
  failure = null
})

test("new methods expose query-only transport and strict explicit IDs without authority input", () => {
  for (const name of ["balanceSource", "custodyAssignees"])
    expect(Reflect.get(inventoryRouter._def.procedures, name)._def.type).toBe(
      "query",
    )
  expect(
    inventoryBalanceSourceSchema.parse({
      storeId: " store-a ",
      balanceSourceId: " balance-a ",
    }),
  ).toEqual({ storeId: "store-a", balanceSourceId: "balance-a" })
  expect(inventoryCustodyAssigneesSchema.parse({ storeId: " x " })).toEqual({
    storeId: "x",
  })
  expect(
    inventoryBalanceSourceSchema.safeParse({
      storeId: "x".repeat(128),
      balanceSourceId: "y".repeat(128),
    }).success,
  ).toBe(true)
  for (const [schema, valid] of [
    [
      inventoryBalanceSourceSchema,
      { storeId: "store-a", balanceSourceId: "balance-a" },
    ],
    [inventoryCustodyAssigneesSchema, { storeId: "store-a" }],
  ] as const) {
    for (const extra of [
      { tenantId: "foreign" },
      { actorUserId: "foreign" },
      { userId: "recipient" },
      { source: "mobile" },
      { includeEmail: true },
    ])
      expect(schema.safeParse({ ...valid, ...extra }).success).toBe(false)
    for (const storeId of [undefined, "", " ", "x".repeat(129), null])
      expect(schema.safeParse({ ...valid, storeId }).success).toBe(false)
  }
  expect(
    inventoryBalanceSourceSchema.safeParse({
      storeId: scope.storeId,
      balanceSourceId: "x".repeat(129),
    }).success,
  ).toBe(false)
})

test("Owner/Admin/legacy Manager read exactly one scoped source with allowlisted exact decimals and no writes", async () => {
  for (const role of ["OWNER", "ADMIN", "MANAGER"] as const) {
    const before = calls.length
    const result = await call(
      "balanceSource",
      { storeId: scope.storeId, balanceSourceId: "balance-a" },
      context({ role }),
    )
    expect(result).toMatchObject({
      balanceSourceId: "balance-a",
      storeId: scope.storeId,
      revision: 7,
      availableQuantity: "9007199254740993",
      onHandQuantity: "9007199254740993.125",
    })
    expect(result).not.toHaveProperty("privateSecret")
    expect(calls.slice(before)).toMatchObject([
      {
        delegate: "balance.exact",
        args: {
          where: {
            id: "balance-a",
            tenantId: scope.tenantId,
            storeId: scope.storeId,
          },
        },
      },
    ])
  }
  expect(forbiddenCalls).toBe(0)
})

test("explicit authorized Store is honored rather than replaced by active Store, including scoped stock roles", async () => {
  for (const ctx of [
    context(),
    scoped("OPERATOR", secondStore),
    scoped("MANAGER", secondStore),
  ]) {
    const before = calls.length
    expect(
      await call(
        "balanceSource",
        { storeId: secondStore, balanceSourceId: "balance-b" },
        ctx,
      ),
    ).toMatchObject({ storeId: secondStore, balanceSourceId: "balance-b" })
    expect(
      calls.slice(before).filter((entry) => entry.delegate === "balance.exact"),
    ).toMatchObject([
      {
        args: {
          where: {
            id: "balance-b",
            tenantId: scope.tenantId,
            storeId: secondStore,
          },
        },
      },
    ])
    expect(
      await call("custodyAssignees", { storeId: secondStore }, ctx),
    ).toMatchObject({ storeId: secondStore })
  }
  expect(forbiddenCalls).toBe(0)
})

test("scoped stock reads require the stock grant, not merely a generally readable Store", async () => {
  for (const ctx of [
    scoped("CASHIER"),
    scoped("OPERATOR", secondStore),
    scoped("MANAGER", scope.storeId, "SUSPENDED"),
    context({ role: "MANAGER", mode: "SCOPED" }),
    context({
      role: "OPERATOR",
      mode: "SCOPED",
      status: "SUSPENDED",
      assignments: [
        { storeId: scope.storeId, role: "OPERATOR", status: "ACTIVE" },
      ],
    }),
  ]) {
    for (const method of ["balanceSource", "custodyAssignees"]) {
      const input =
        method === "balanceSource"
          ? { storeId: scope.storeId, balanceSourceId: "balance-a" }
          : { storeId: scope.storeId }
      await expect(call(method, input, ctx)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
    }
  }
  expect(calls).toHaveLength(0)
  const readCtx = scoped("CASHIER")
  expect(
    await Reflect.apply(scopeStaffRequest, undefined, [
      readCtx,
      "tenant.current",
      "query",
      undefined,
    ]),
  ).toBeUndefined()
  expect(forbiddenCalls).toBe(0)
})

test("central guard resolves actual source identity and prevents using another granted Store to disclose a foreign source", async () => {
  const ctx = scoped("OPERATOR")
  for (const balanceSourceId of ["balance-b", "foreign-balance", "missing"])
    await expect(
      call("balanceSource", { storeId: scope.storeId, balanceSourceId }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(calls.map((entry) => entry.delegate)).toEqual([
    "balance.scope",
    "balance.scope",
    "balance.scope",
  ])
  expect(forbiddenCalls).toBe(0)
})

test("authorized missing/wrong-Store/foreign source remains null without initialization or fallback", async () => {
  for (const balanceSourceId of ["balance-b", "foreign-balance", "missing"])
    expect(
      await call("balanceSource", { storeId: scope.storeId, balanceSourceId }),
    ).toBeNull()
  expect(calls).toHaveLength(3)
  expect(calls.every((entry) => entry.delegate === "balance.exact")).toBe(true)
  expect(forbiddenCalls).toBe(0)
})

test("access to two Stores never replaces the explicitly selected Store in an exact source predicate", async () => {
  const ctx = context({
    role: "OPERATOR",
    mode: "SCOPED",
    assignments: [
      { storeId: scope.storeId, role: "OPERATOR", status: "ACTIVE" },
      { storeId: secondStore, role: "OPERATOR", status: "ACTIVE" },
    ],
  })
  expect(
    await call(
      "balanceSource",
      {
        storeId: scope.storeId,
        balanceSourceId: "balance-b",
      },
      ctx,
    ),
  ).toBeNull()
  expect(calls).toMatchObject([
    {
      delegate: "balance.scope",
      args: { where: { id: "balance-b", tenantId: scope.tenantId } },
    },
    {
      delegate: "balance.exact",
      args: {
        where: {
          id: "balance-b",
          tenantId: scope.tenantId,
          storeId: scope.storeId,
        },
      },
    },
  ])
  expect(forbiddenCalls).toBe(0)
})

test("new query policy cannot be entered as a mutation or an unregistered stock read", async () => {
  const ctx = scoped("MANAGER")
  for (const [path, type] of [
    ["inventory.balanceSource", "mutation"],
    ["inventory.custodyAssignees", "mutation"],
    ["inventory.balanceSourceUnsafe", "query"],
  ]) {
    await expect(
      Reflect.apply(scopeStaffRequest, undefined, [
        ctx,
        path,
        type,
        {
          storeId: scope.storeId,
          balanceSourceId: "balance-a",
        },
      ]),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  }
  expect(calls).toHaveLength(0)
  expect(forbiddenCalls).toBe(0)
})

test("custody recipients use current canonical Store eligibility, keep same names distinct and withhold contact-only labels", async () => {
  expect(
    await call(
      "custodyAssignees",
      { storeId: scope.storeId },
      scoped("OPERATOR"),
    ),
  ).toEqual({
    storeId: scope.storeId,
    assignees: [
      { id: "owner", name: "Same name", role: "OWNER" },
      { id: "admin", name: "Same name", role: "ADMIN" },
      { id: "legacy", name: "Same name", role: "CASHIER" },
      { id: "same-a", name: "Same name", role: "CASHIER" },
      { id: "same-b", name: "Same name", role: "CASHIER" },
      { id: "unnamed", name: null, role: "CASHIER" },
      { id: "blank", name: null, role: "CASHIER" },
      { id: "contact-label", name: null, role: "CASHIER" },
    ],
  })
  expect(calls).toEqual([
    {
      delegate: "membership",
      args: {
        include: { user: true },
        orderBy: { createdAt: "asc" },
        where: {
          tenantId: scope.tenantId,
          userId: undefined,
          status: "ACTIVE",
          role: { in: ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"] },
          OR: [
            { role: { in: ["OWNER", "ADMIN"] } },
            { staffAccessMode: "LEGACY" },
            {
              staffStoreAssignments: {
                some: {
                  tenantId: scope.tenantId,
                  storeId: scope.storeId,
                  status: "ACTIVE",
                },
              },
            },
          ],
        },
      },
    },
  ])
  expect(forbiddenCalls).toBe(0)
})

test("legacy nonmanagers, missing authentication and inaccessible Stores refuse before canonical reads", async () => {
  for (const role of ["CASHIER", "OPERATOR", "SUPPORT", "MEMBER"] as const)
    await expect(
      call("custodyAssignees", { storeId: scope.storeId }, context({ role })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    call(
      "custodyAssignees",
      { storeId: scope.storeId },
      context({ authenticated: false }),
    ),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  await expect(
    call("custodyAssignees", { storeId: "foreign-store" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(calls).toHaveLength(0)
})

test("router refuses malformed/injected input without querying and propagates actual read errors without retry", async () => {
  for (const [method, input] of [
    ["balanceSource", { storeId: scope.storeId }],
    [
      "balanceSource",
      {
        storeId: scope.storeId,
        balanceSourceId: "balance-a",
        tenantId: "foreign",
      },
    ],
    ["custodyAssignees", {}],
    ["custodyAssignees", { storeId: scope.storeId, actorUserId: "foreign" }],
  ] as const)
    await expect(call(method, input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  expect(calls).toHaveLength(0)
  failure = Error("read transport failed")
  await expect(
    call("balanceSource", {
      storeId: scope.storeId,
      balanceSourceId: "balance-a",
    }),
  ).rejects.toThrow("read transport failed")
  expect(calls).toHaveLength(1)
  expect(forbiddenCalls).toBe(0)
})
