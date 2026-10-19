import { afterAll, expect, mock, test } from "bun:test"
import { simpleSaleAction } from "@ewatrade/assistant/general/contracts"
import type { Prisma } from "@ewatrade/db/types"
import { TRPCError } from "@trpc/server"
import { lockCommerceFinancialContext } from "../../../../../packages/db/src/queries/customer-ledger/commerce-locks"
import type { GeneralTransactionContext } from "../general-actions"

// Child-only import boundary. No production query/helper is replaced. Any
// accidental global-client or provider operation must fail before transport.
const unexpected = (name: string): never => {
  throw Error(`Unexpected inert port: ${name}`)
}
mock.module("@ewatrade/db/client", () => ({
  prisma: new Proxy({}, { get: () => unexpected("global client") }),
}))
const originalFetch = globalThis.fetch
globalThis.fetch = Object.assign(async () => unexpected("network"), {
  preconnect: () => unexpected("network preconnect"),
})
afterAll(() => {
  globalThis.fetch = originalFetch
})
process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "inert-sale-lock-order-key".repeat(
  2,
)
const { simpleSaleRecord } = await import("../general-simple-sale")

const customerSentinel = Error("Inert Customer insertion boundary")
const canonicalSentinel = Error("Inert canonical history-read boundary")
type Options = {
  lockedBook?: string | null
  paused?: boolean
  methods?: string[]
  role?: string
  status?: string
}
function harness(options: Options = {}) {
  const events: string[] = []
  let customerCreates = 0
  let canonicalReads = 0
  const ports = {
    $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      const statement = sql.join("?").replace(/\s+/g, " ").trim()
      expect(statement).toMatch(/SELECT id FROM "FinanceBook"/)
      expect(statement).toContain('"tenantId" = ?')
      expect(statement).toContain('"currencyCode" = ?')
      expect(statement).toContain("FOR UPDATE")
      expect(values).toEqual(["tenant-a", "NGN"])
      events.push("Book scoped lock")
      const id =
        options.lockedBook === undefined ? "book-a" : options.lockedBook
      return id === null ? [] : [{ id }]
    },
    financeBook: {
      findUnique: async (
        input: Parameters<
          Prisma.TransactionClient["financeBook"]["findUnique"]
        >[0],
      ) => {
        expect(input.where).toEqual({
          tenantId_currencyCode: { tenantId: "tenant-a", currencyCode: "NGN" },
        })
        events.push("current Book read")
        return { id: "book-a", currencyCode: "NGN" }
      },
    },
    financeAccount: {
      findMany: async (
        input: Parameters<
          Prisma.TransactionClient["financeAccount"]["findMany"]
        >[0],
      ) => {
        expect(input?.where).toMatchObject({
          bookId: "book-a",
          archivedAt: null,
        })
        return [
          {
            id: "bank-a",
            name: "Selected bank",
            purpose: "BANK",
            paymentMethods: options.methods ?? [],
            paymentsPausedAt: options.paused ? new Date() : null,
          },
        ]
      },
    },
    customer: {
      findMany: async () => [],
      findFirst: async (
        input: Parameters<Prisma.TransactionClient["customer"]["findFirst"]>[0],
      ) => {
        expect(input?.where).toMatchObject({
          id: "customer-a",
          tenantId: "tenant-a",
        })
        return {
          id: "customer-a",
          name: "Existing customer",
          phone: null,
          email: null,
        }
      },
      create: async (
        input: Parameters<Prisma.TransactionClient["customer"]["create"]>[0],
      ) => {
        customerCreates++
        events.push("Customer create")
        expect(input.data).toMatchObject({
          tenantId: "tenant-a",
          name: "New customer",
        })
        throw customerSentinel
      },
    },
    commercialOrder: {
      findUnique: async () => {
        canonicalReads++
        throw canonicalSentinel
      },
    },
  }
  // Prisma delegates are generic, selection-dependent PrismaPromises. This
  // single boundary assertion supplies only the explicitly typed inert ports;
  // every other transaction property is denied. No lock evidence is fabricated.
  const db = new Proxy({} as Prisma.TransactionClient, {
    get(_target, key) {
      if (Object.hasOwn(ports, key)) return Reflect.get(ports, key)
      return unexpected(String(key))
    },
  })
  const ctx = {
    db,
    session: { user: { id: "actor-a" }, session: { id: "session-a" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "tenant-a",
        currencyCode: "NGN",
        dataClassification: "QA",
        retailOpsPlanId: "pro",
      },
      membership: { id: "membership-a", role: options.role ?? "OWNER" },
      activeStore: { id: "store-a", currencyCode: "NGN" },
      stores: [{ id: "store-a" }],
      staffAccess: {
        status: options.status ?? "ACTIVE",
        mode: "LEGACY",
        businessRole: options.role ?? "OWNER",
        assignments: [],
      },
    },
    // Request/session projection only: unused middleware fields are intentionally
    // absent. This fixture calls the adapter, not the outer authorization wrapper.
  } as unknown as GeneralTransactionContext
  const sale = simpleSaleAction.parse({
    action: "sale_record",
    moneyAccountId: "bank-a",
    method: "bank_transfer",
    receivedMinor: 1000,
    customerChoice: "new",
    customerName: "New customer",
    description: "Rice sold",
    attachmentIds: [],
  })
  return {
    db,
    ctx,
    sale,
    events,
    customerCreates: () => customerCreates,
    canonicalReads: () => canonicalReads,
  }
}
async function failure(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    return error
  }
  throw Error("Expected inert execution to stop")
}

test("actual financial helper uses scoped Book row lock and no Customer ledger for null Customer", async () => {
  const h = harness()
  expect(
    await lockCommerceFinancialContext(h.db, {
      tenantId: "tenant-a",
      currencyCode: "NGN",
      customerId: null,
    }),
  ).toEqual({ bookId: "book-a", accountId: null })
  expect(h.events).toEqual(["Book scoped lock"])
})
test("selected existing bank locks Book before actual new Customer insertion", async () => {
  const h = harness()
  expect(
    await failure(() => simpleSaleRecord.execute(h.ctx, h.sale, "inert-sale")),
  ).toBe(customerSentinel)
  expect(h.events).toEqual([
    "current Book read",
    "Book scoped lock",
    "Customer create",
  ])
  expect(h.customerCreates()).toBe(1)
  expect(h.canonicalReads()).toBe(0)
})
for (const lockedBook of [null, "book-changed"]) {
  test(`missing/changed locked Book (${lockedBook}) refuses before Customer insertion`, async () => {
    const h = harness({ lockedBook })
    const error = await failure(() =>
      simpleSaleRecord.execute(h.ctx, h.sale, "inert-sale"),
    )
    expect(error).not.toBe(customerSentinel)
    expect(error).toBeInstanceOf(TRPCError)
    expect(h.customerCreates()).toBe(0)
    expect(h.canonicalReads()).toBe(0)
  })
}
for (const [label, options] of [
  ["paused account", { paused: true }],
  ["unsupported method", { methods: ["POS"] }],
  ["unauthorized parent role", { role: "CASHIER" }],
  ["suspended access", { status: "SUSPENDED" }],
] satisfies Array<[string, Options]>) {
  test(`${label} refuses with zero Customer/canonical writes`, async () => {
    const h = harness(options)
    const error = await failure(() =>
      simpleSaleRecord.execute(h.ctx, h.sale, "inert-sale"),
    )
    expect(error).not.toBe(customerSentinel)
    expect(error).toBeInstanceOf(TRPCError)
    expect(h.customerCreates()).toBe(0)
    expect(h.canonicalReads()).toBe(0)
    expect(h.events).not.toContain("Book scoped lock")
  })
}
test("foreign selected account refuses before Customer insertion", async () => {
  const h = harness()
  const error = await failure(() =>
    simpleSaleRecord.execute(
      h.ctx,
      { ...h.sale, moneyAccountId: "foreign-bank" },
      "inert-sale",
    ),
  )
  expect(error).not.toBe(customerSentinel)
  expect(error).toBeInstanceOf(TRPCError)
  expect(h.customerCreates()).toBe(0)
  expect(h.canonicalReads()).toBe(0)
})
for (const mode of ["existing", "walk-in"]) {
  test(`${mode} Customer choice never calls Customer.create`, async () => {
    const h = harness()
    const sale =
      mode === "existing"
        ? { ...h.sale, customerId: "customer-a" }
        : {
            ...h.sale,
            customerChoice: "walk_in" as const,
            customerName: undefined,
          }
    expect(
      await failure(() => simpleSaleRecord.execute(h.ctx, sale, "inert-sale")),
    ).toBe(canonicalSentinel)
    expect(h.customerCreates()).toBe(0)
    expect(h.canonicalReads()).toBe(1)
  })
}
