import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { listStaffActivityPage, readStaffActivityShown } from "./staff-activity"

// Synthetic records shaped like the canonical rows each stream selects.
const day = {
  from: "2026-10-12T00:00:00+01:00",
  to: "2026-10-13T00:00:00+01:00",
}
const at = (iso: string) => new Date(iso)
const noon = at("2026-10-12T11:00:00.000Z")
const order = (storeId = "store-a") => ({ storeId, orderNumber: "ORD-1042" })
const fixtures = () => ({
  commercialOrder: [
    {
      id: "o-amina",
      tenantId: "tenant-a",
      storeId: "store-a",
      createdByUserId: "amina-u",
      createdAt: noon,
      orderNumber: "ORD-1042",
      totalMinor: 520_000,
      currencyCode: "NGN",
    },
    {
      id: "o-musa",
      tenantId: "tenant-a",
      storeId: "store-b",
      createdByUserId: "musa-u",
      createdAt: noon,
      orderNumber: "ORD-1043",
      totalMinor: 100,
      currencyCode: "NGN",
    },
    // Exactly at the exclusive end of the local day.
    {
      id: "o-next-day",
      tenantId: "tenant-a",
      storeId: "store-a",
      createdByUserId: "amina-u",
      createdAt: at("2026-10-12T23:00:00.000Z"),
      orderNumber: "ORD-1044",
      totalMinor: 100,
      currencyCode: "NGN",
    },
    // Exactly at the inclusive start.
    {
      id: "o-start",
      tenantId: "tenant-a",
      storeId: "store-a",
      createdByUserId: "amina-u",
      createdAt: at("2026-10-11T23:00:00.000Z"),
      orderNumber: "ORD-1041",
      totalMinor: 100,
      currencyCode: "NGN",
    },
    {
      id: "o-foreign",
      tenantId: "tenant-b",
      storeId: "store-x",
      createdByUserId: "amina-u",
      createdAt: noon,
      orderNumber: "X-1",
      totalMinor: 1,
      currencyCode: "NGN",
    },
  ],
  commercialOrderPayment: [
    {
      id: "p-amina",
      tenantId: "tenant-a",
      storeId: "store-a",
      orderId: "o-amina",
      recordedByUserId: "amina-u",
      recordedAt: noon,
      type: "PAYMENT",
      method: "BANK_TRANSFER",
      amountMinor: 520_000,
      order: { orderNumber: "ORD-1042", currencyCode: "NGN" },
    },
  ],
  stockOperation: [
    {
      id: "s-amina",
      tenantId: "tenant-a",
      storeId: "store-a",
      actorUserId: "amina-u",
      createdAt: at("2026-10-12T09:00:00.000Z"),
      effectiveAt: at("2026-10-11T09:00:00.000Z"),
      type: "ADJUSTMENT",
      reason: "Damaged bag",
      correctionOfOperationId: null,
    },
  ],
  stockCount: [],
  commercialOrderAmendment: [],
  productReturn: [],
  commercialServiceFulfillment: [],
  commercialServiceAuthorization: [
    {
      id: "auth-amina",
      tenantId: "tenant-a",
      orderId: "o-musa",
      actorUserId: "amina-u",
      authorizedAt: at("2026-10-12T10:00:00.000Z"),
      quantity: { toString: () => "1" },
      order: order("store-b"),
    },
  ],
  serviceWorkEvent: [],
  serviceWorkAssignment: [
    {
      id: "as-amina",
      serviceJobId: "job-1",
      assignedUserId: "amina-u",
      assignedAt: at("2026-10-12T08:00:00.000Z"),
      endedAt: null,
      serviceJob: {
        tenantId: "tenant-a",
        storeId: "store-a",
        commercialOrderId: "o-amina",
        commercialOrder: { orderNumber: "ORD-1042" },
      },
    },
  ],
  financeJournalEntry: [
    {
      id: "fj-expense",
      bookId: "book-ngn",
      book: { tenantId: "tenant-a" },
      storeId: "store-a",
      actorUserId: "amina-u",
      recordedAt: at("2026-10-12T15:00:00.000Z"),
      effectiveAt: at("2026-10-12T15:00:00.000Z"),
      sequence: 41n,
      sourceKind: "EXPENSE_BILL",
      description: "Generator diesel",
      reversalOfId: null,
    },
    {
      id: "fj-transfer-reversal",
      bookId: "book-ngn",
      book: { tenantId: "tenant-a" },
      storeId: null,
      actorUserId: "amina-u",
      recordedAt: at("2026-10-12T14:00:00.000Z"),
      effectiveAt: at("2026-10-11T14:00:00.000Z"),
      sequence: 40n,
      sourceKind: "MONEY_REVERSAL",
      description: "Reverse duplicate till transfer",
      reversalOfId: "fj-old",
    },
    // Mirrors a sale already shown as ORDER; never shown again as finance.
    {
      id: "fj-cogs",
      bookId: "book-ngn",
      book: { tenantId: "tenant-a" },
      storeId: "store-a",
      actorUserId: "amina-u",
      recordedAt: noon,
      effectiveAt: noon,
      sequence: 39n,
      sourceKind: "COMMERCIAL_ORDER_COGS",
      description: "Cost of ORD-1042",
      reversalOfId: null,
    },
    // Another business's Book.
    {
      id: "fj-foreign",
      bookId: "book-ngn",
      book: { tenantId: "tenant-b" },
      storeId: "store-x",
      actorUserId: "amina-u",
      recordedAt: noon,
      effectiveAt: noon,
      sequence: 1n,
      sourceKind: "EXPENSE_BILL",
      description: "Foreign",
      reversalOfId: null,
    },
  ],
  catalogPriceChange: [
    {
      id: "pc-legacy",
      tenantId: "tenant-a",
      offeringId: "off-rice",
      changedByUserId: null,
      createdAt: at("2026-10-12T07:00:00.000Z"),
      previousPriceMinor: 5_000_000,
      priceMinor: 5_200_000,
      currencyCode: "NGN",
      reason: null,
      offering: { name: "Rice 50kg", catalogItemId: "item-rice" },
    },
    {
      id: "pc-departed",
      tenantId: "tenant-a",
      offeringId: "off-rice",
      changedByUserId: "departed-u",
      createdAt: at("2026-10-12T06:00:00.000Z"),
      previousPriceMinor: 4_900_000,
      priceMinor: 5_000_000,
      currencyCode: "NGN",
      reason: "Supplier",
      offering: { name: "Rice 50kg", catalogItemId: "item-rice" },
    },
  ],
})

const operators = new Set(["in", "lt", "lte", "gte", "gt"])
function matches(where: any, row: any): boolean {
  return Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (value === undefined) return true
    if (key === "AND") return value.every((item: any) => matches(item, row))
    if (key === "OR") return value.some((item: any) => matches(item, row))
    const actual = row?.[key]
    if (value instanceof Date)
      return actual instanceof Date && actual.getTime() === value.getTime()
    if (value && typeof value === "object") {
      if (Object.keys(value).every((op) => operators.has(op)))
        return Object.entries(value).every(([op, expected]: [string, any]) =>
          op === "in"
            ? expected.includes(actual)
            : op === "lt"
              ? actual < expected
              : op === "lte"
                ? actual <= expected
                : op === "gt"
                  ? actual > expected
                  : actual >= expected,
        )
      return matches(value, actual)
    }
    return actual === value
  })
}
function database(
  options: { role?: string; rows?: ReturnType<typeof fixtures> } = {},
) {
  const rows = options.rows ?? fixtures()
  const calls: string[] = []
  const time: Record<string, string> = {
    commercialOrder: "createdAt",
    commercialOrderPayment: "recordedAt",
    stockOperation: "createdAt",
    stockCount: "createdAt",
    commercialOrderAmendment: "createdAt",
    productReturn: "createdAt",
    commercialServiceFulfillment: "performedAt",
    commercialServiceAuthorization: "authorizedAt",
    serviceWorkEvent: "createdAt",
    serviceWorkAssignment: "assignedAt",
    catalogPriceChange: "createdAt",
    financeJournalEntry: "recordedAt",
  }
  const delegate = (name: keyof typeof rows) => ({
    findMany: async (args: any) => {
      calls.push(`${name}.findMany`)
      const field = time[name]!
      return (rows[name] as any[])
        .filter((row) => matches(args.where, row))
        .sort(
          (a, b) =>
            b[field].getTime() - a[field].getTime() || (a.id > b.id ? -1 : 1),
        )
        .slice(0, args.take)
    },
    count: async (args: any) =>
      (rows[name] as any[]).filter((row) => matches(args.where, row)).length,
  })
  const members = [
    {
      id: "amina-m",
      userId: "amina-u",
      user: { name: "Amina", displayName: null },
    },
    {
      id: "musa-m",
      userId: "musa-u",
      user: { name: "Musa", displayName: "Musa B" },
    },
  ]
  const tx: any = {
    membership: {
      findFirst: async (args: any) =>
        args.where.userId
          ? options.role === "NONE"
            ? null
            : { role: options.role ?? "OWNER" }
          : (members.find(
              (m) =>
                m.id === args.where.id && args.where.tenantId === "tenant-a",
            ) ?? null),
      findMany: async (args: any) =>
        members.filter((m) => args.where.userId.in.includes(m.userId)),
    },
    retailOpsStaffProfile: { findMany: async () => [] },
    store: {
      count: async (args: any) =>
        args.where.id.in.filter((id: string) =>
          ["store-a", "store-b"].includes(id),
        ).length,
      findMany: async () => [
        { id: "store-a", name: "Wuse" },
        { id: "store-b", name: "Garki" },
      ],
    },
  }
  for (const name of Object.keys(rows)) tx[name] = delegate(name as never)
  const db = {
    $transaction: async (
      operation: (client: Prisma.TransactionClient) => unknown,
    ) => operation(tx),
  } as unknown as PrismaClient
  return { db, calls }
}
const owner = {
  tenantId: "tenant-a",
  viewerUserId: "owner-u",
  storeIds: null,
  financeBookIds: null,
}
const financeOwner = { ...owner, financeBookIds: ["book-ngn"] }

test("a staff member's day shows performed, approved and assigned work with exact counts", async () => {
  const { db } = database()
  const result = await listStaffActivityPage(db, {
    ...owner,
    ...day,
    membershipId: "amina-m",
  })
  expect(result.data.map((e) => [e.id, e.relation])).toEqual([
    ["o-amina", "PERFORMED"],
    ["p-amina", "PERFORMED"],
    ["auth-amina", "APPROVED"],
    ["s-amina", "PERFORMED"],
    ["as-amina", "ASSIGNED"],
    ["o-start", "PERFORMED"],
  ])
  expect(result.total).toBe(6)
  expect(result.byStream).toMatchObject({
    ORDER: 2,
    PAYMENT: 1,
    SERVICE_AUTHORIZATION: 1,
    SERVICE_ASSIGNMENT: 1,
    PRICE_CHANGE: 0,
  })
  const payment = result.data[1]!
  expect(payment).toMatchObject({
    store: { id: "store-a", name: "Wuse" },
    actor: { coverage: "available", membershipId: "amina-m", name: "Amina" },
    record: { kind: "payment", id: "p-amina", orderId: "o-amina" },
    outcome: "Payment recorded · bank transfer",
    amount: { minor: 520_000, currencyCode: "NGN" },
  })
  // A backdated stock operation counts on the day it was recorded.
  expect(result.data[3]!.outcome).toContain(
    "effective 2026-10-11T09:00:00.000Z",
  )
  // Unknown historical price changes never count toward a person.
  expect(result.coverage.unknownActors).toBe(false)
})

test("cursor pages cover every record once and refuse changed filters", async () => {
  const { db } = database()
  const seen: string[] = []
  let cursor: string | undefined
  const totals = new Set<number>()
  do {
    const page = await listStaffActivityPage(db, {
      ...owner,
      ...day,
      limit: 2,
      cursor,
    })
    seen.push(...page.data.map((e) => e.id))
    totals.add(page.total)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  // Equal times keep each stream's id-descending order across pages.
  expect(seen).toEqual([
    "o-musa",
    "o-amina",
    "p-amina",
    "auth-amina",
    "s-amina",
    "as-amina",
    "pc-legacy",
    "pc-departed",
    "o-start",
  ])
  expect(totals).toEqual(new Set([9]))
  const first = await listStaffActivityPage(db, { ...owner, ...day, limit: 2 })
  await expect(
    listStaffActivityPage(db, {
      ...owner,
      ...day,
      membershipId: "amina-m",
      limit: 2,
      cursor: first.nextCursor!,
    }),
  ).rejects.toThrow(
    "Continue with the original staff activity filters and cursor.",
  )
})

test("who changed this price reads one Product's price changes only", async () => {
  const { db } = database()
  const result = await listStaffActivityPage(db, {
    ...owner,
    ...day,
    stream: "PRICE_CHANGE",
    catalogItemId: "item-rice",
  })
  expect(result.data.map((e) => e.id)).toEqual(["pc-legacy", "pc-departed"])
  const other = await listStaffActivityPage(db, {
    ...owner,
    ...day,
    stream: "PRICE_CHANGE",
    catalogItemId: "item-beans",
  })
  expect(other.total).toBe(0)
  await expect(
    listStaffActivityPage(db, { ...owner, ...day, catalogItemId: "item-rice" }),
  ).rejects.toThrow("A Product filter applies to price changes only.")
})

test("stock adjustments by staff filter rows and counts by operation type", async () => {
  const rows = fixtures()
  rows.stockOperation.push({
    ...rows.stockOperation[0]!,
    id: "s-receipt",
    type: "RECEIPT",
    reason: "Delivery",
  })
  const { db } = database({ rows })
  const adjustments = await listStaffActivityPage(db, {
    ...owner,
    ...day,
    stream: "STOCK_OPERATION",
    stockOperationType: "ADJUSTMENT",
  })
  expect(adjustments.data.map((e) => e.id)).toEqual(["s-amina"])
  expect(adjustments.total).toBe(1)
  const all = await listStaffActivityPage(db, {
    ...owner,
    ...day,
    stream: "STOCK_OPERATION",
  })
  expect(all.total).toBe(2)
  await expect(
    listStaffActivityPage(db, {
      ...owner,
      ...day,
      stockOperationType: "ADJUSTMENT",
    }),
  ).rejects.toThrow(
    "An operation type filter applies to stock operations only.",
  )
})

test("unknown and departed actors stay unattributed", async () => {
  const { db } = database()
  const result = await listStaffActivityPage(db, {
    ...owner,
    ...day,
    stream: "PRICE_CHANGE",
  })
  expect(result.data.map((e) => [e.id, e.actor.coverage])).toEqual([
    ["pc-legacy", "unknown"],
    ["pc-departed", "unavailable"],
  ])
  expect(result.data[0]!.record).toEqual({
    kind: "product",
    id: "item-rice",
    offeringId: "off-rice",
    label: "Rice 50kg",
  })
  expect(result.coverage.unknownActors).toBe(true)
})

test("Store views exclude tenant-wide records and Managers stay in their Stores", async () => {
  const { db } = database({ role: "MANAGER" })
  const manager = {
    tenantId: "tenant-a",
    viewerUserId: "manager-u",
    storeIds: ["store-a"],
    financeBookIds: null,
  }
  const result = await listStaffActivityPage(db, { ...manager, ...day })
  expect(result.data.map((e) => e.id)).toEqual([
    "o-amina",
    "p-amina",
    "s-amina",
    "as-amina",
    "o-start",
  ])
  expect(result.coverage.excluded).toEqual([
    { stream: "PRICE_CHANGE", reason: "not_store_attributed" },
  ])
  expect(result.scope).toBe("stores")
  await expect(
    listStaffActivityPage(db, { ...manager, ...day, storeId: "store-b" }),
  ).rejects.toThrow("Staff activity is limited to Stores you can access.")
  await expect(
    listStaffActivityPage(db, { ...manager, storeIds: null, ...day }),
  ).rejects.toThrow("Choose a Store you manage to read staff activity.")
})

test("viewer authority, subject scope and period bounds are enforced", async () => {
  await expect(
    listStaffActivityPage(database({ role: "CASHIER" }).db, {
      ...owner,
      ...day,
    }),
  ).rejects.toThrow(
    "Owner, Admin or Manager access is required for staff activity.",
  )
  await expect(
    listStaffActivityPage(database({ role: "NONE" }).db, { ...owner, ...day }),
  ).rejects.toThrow("Owner, Admin or Manager access is required")
  const { db } = database()
  await expect(
    listStaffActivityPage(db, { ...owner, ...day, membershipId: "foreign-m" }),
  ).rejects.toThrow("Staff membership not found for this business.")
  await expect(
    listStaffActivityPage(db, {
      ...owner,
      from: "2026-01-01T00:00:00Z",
      to: "2026-10-12T00:00:00Z",
    }),
  ).rejects.toThrow("Choose a period of 92 days or less.")
  await expect(
    listStaffActivityPage(db, {
      ...owner,
      ...day,
      stream: "SERVICE_AUTHORIZATION",
      relation: "PERFORMED",
    }),
  ).rejects.toThrow("Choose a relation the selected activity type records.")
})

test("the current assignee is never reported as assigned history", async () => {
  const rows = fixtures()
  rows.serviceWorkAssignment = []
  const { db } = database({ rows })
  const result = await listStaffActivityPage(db, {
    ...owner,
    ...day,
    membershipId: "amina-m",
    relation: "ASSIGNED",
  })
  expect(result.data).toEqual([])
  expect(result.total).toBe(0)
})

test("finance postings need finance Books and show only finance-originated work", async () => {
  const { db } = database()
  const hidden = await listStaffActivityPage(db, {
    ...owner,
    ...day,
    stream: "FINANCE_POSTING",
  })
  expect(hidden.data).toEqual([])
  expect(hidden.coverage.notIncluded).toContain("finance_actions")
  const finance = await listStaffActivityPage(db, {
    ...financeOwner,
    ...day,
    stream: "FINANCE_POSTING",
  })
  // Cost-of-goods mirrors a sale and a foreign Book never appears.
  expect(finance.data.map((e) => e.id)).toEqual([
    "fj-expense",
    "fj-transfer-reversal",
  ])
  expect(finance.total).toBe(2)
  expect(finance.coverage.notIncluded).not.toContain("finance_actions")
  expect(finance.data[0]).toMatchObject({
    relation: "PERFORMED",
    record: {
      kind: "finance_entry",
      id: "fj-expense",
      bookId: "book-ngn",
      label: "Journal 41",
    },
    outcome: "expense bill posted · Generator diesel",
    actor: { coverage: "available", name: "Amina" },
  })
  expect(finance.data[1]?.outcome).toBe(
    "Reversal · money reversal posted · effective 2026-10-11T14:00:00.000Z · Reverse duplicate till transfer",
  )
})

test("a Store view keeps only Store finance postings and says so", async () => {
  const { db } = database()
  const result = await listStaffActivityPage(db, {
    ...financeOwner,
    storeIds: ["store-a"],
    ...day,
    stream: "FINANCE_POSTING",
  })
  expect(result.data.map((e) => e.id)).toEqual(["fj-expense"])
  expect(result.coverage.excluded).toEqual([
    { stream: "FINANCE_POSTING", reason: "business_wide_postings_hidden" },
  ])
  // Finance access changes invalidate an old cursor.
  const first = await listStaffActivityPage(db, {
    ...financeOwner,
    ...day,
    limit: 1,
  })
  await expect(
    listStaffActivityPage(db, {
      ...owner,
      ...day,
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    }),
  ).rejects.toThrow(
    "Continue with the original staff activity filters and cursor.",
  )
})

test("shown events re-read only their own identities under current authority", async () => {
  const { db } = database()
  const events = [
    { stream: "STOCK_OPERATION" as const, id: "s-amina" },
    { stream: "ORDER" as const, id: "o-musa" },
    { stream: "ORDER" as const, id: "o-missing" },
    { stream: "ORDER" as const, id: "o-foreign" },
    { stream: "FINANCE_POSTING" as const, id: "f-1" },
  ]
  const owned = await readStaffActivityShown(db, { ...owner, ...day, events })
  // The answer's order is kept and nothing it did not show is added.
  expect(owned.data.map((e) => [e.id, e.store?.id])).toEqual([
    ["s-amina", "store-a"],
    ["o-musa", "store-b"],
  ])
  expect(owned.data[1]?.actor).toMatchObject({ name: "Musa B" })
  expect(owned.withheld).toEqual(events.slice(2))
  // A Manager narrowed to Store A no longer reads the Store B order.
  const manager = await readStaffActivityShown(
    database({ role: "MANAGER" }).db,
    {
      ...owner,
      viewerUserId: "manager-u",
      storeIds: ["store-a"],
      ...day,
      events: events.slice(0, 2),
    },
  )
  expect(manager.data.map((e) => e.id)).toEqual(["s-amina"])
  expect(manager.withheld).toEqual([events[1]!])
  // The answer's subject filter still applies on re-read.
  const subject = await readStaffActivityShown(db, {
    ...owner,
    ...day,
    membershipId: "amina-m",
    events: events.slice(0, 2),
  })
  expect(subject.withheld).toEqual([events[1]!])
  await expect(
    readStaffActivityShown(database({ role: "CASHIER" }).db, {
      ...owner,
      ...day,
      events,
    }),
  ).rejects.toThrow("Owner, Admin or Manager access is required")
  await expect(
    readStaffActivityShown(db, { ...owner, ...day, events: [] }),
  ).rejects.toThrow()
})
