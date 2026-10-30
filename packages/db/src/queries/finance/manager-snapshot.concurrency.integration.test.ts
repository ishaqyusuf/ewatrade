import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"
import { Client } from "pg"
import { Prisma, PrismaClient } from "../../../generated/prisma/client"
import {
  FinanceBillKind,
  FinanceExpenseReceiptAttachmentState,
  MembershipRole,
  MembershipStatus,
} from "../../../generated/prisma/enums"
import { getActivityScopeMember } from "../business-activity/scope-member"
import { assertFinanceManager } from "./access"
import { listFinanceBills } from "./bill-reads"
import {
  assertFinanceManagerSnapshot,
  getFinanceManagerBookSnapshot,
} from "./manager-snapshot"
import {
  type FinanceReadBookScope,
  financeReadBookWhere,
} from "./read-book-scope"
import { FinanceError } from "./rules"

// Explicit disposable fixture only; never reads an app URL/profile or grants.
const socket = process.env.EWATRADE_INERT_POSTGRES_SOCKET
if (socket && !/^\/(?:private\/)?tmp\/ewatrade-[\w/-]+\/socket$/.test(socket))
  throw Error("An explicitly isolated temporary PostgreSQL socket is required.")
const check = socket ? test : test.skip
const database = `ewatrade_scope_fixture_${randomUUID().replaceAll("-", "")}`
const config = { host: socket, user: "fixture", port: 5432 }
const actor = { tenantId: "tenant-a", actorUserId: "actor-a" }
let admin: Client
let writer: Client
let observer: Client
const makeDb = () =>
  new PrismaClient({
    adapter: new PrismaPg({ ...config, database, max: 2 }),
    log: [{ emit: "event", level: "query" }],
  })
let db: ReturnType<typeof makeDb>
let reads = 0
beforeAll(async () => {
  if (!socket) return
  admin = new Client({ ...config, database: "postgres" })
  await admin.connect()
  await admin.query(`CREATE DATABASE "${database}"`)
  writer = new Client({ ...config, database })
  observer = new Client({ ...config, database })
  await Promise.all([writer.connect(), observer.connect()])
  db = makeDb()
  db.$on("query", (event) => {
    if (/^\s*(SELECT|WITH)\b/i.test(event.query)) reads++
  })
  for (const [name, values] of Object.entries({
    MembershipRole,
    MembershipStatus,
    FinanceBillKind,
    FinanceExpenseReceiptAttachmentState,
  }))
    await writer.query(
      `CREATE TYPE "${name}" AS ENUM (${Object.values(values)
        .map((value) => `'${value}'`)
        .join(",")})`,
    )
  await writer.query(`
    CREATE TABLE "Tenant" (id text PRIMARY KEY,"isActive" boolean,"currencyCode" text,timezone text,metadata jsonb);
    CREATE TABLE "Membership" (id text PRIMARY KEY,"tenantId" text REFERENCES "Tenant","userId" text,role "MembershipRole",status "MembershipStatus","staffAccessMode" text,"staffAccessRevision" integer,UNIQUE("tenantId","userId"));
    CREATE TABLE "SubscriptionPlan" (id text PRIMARY KEY,key text);
    CREATE TABLE "TenantSubscription" (id text PRIMARY KEY,"tenantId" text REFERENCES "Tenant","planId" text REFERENCES "SubscriptionPlan",provider text,status text,"billingSubscriptionId" text,"currentPeriodEndsAt" timestamp(3));
    CREATE TABLE "Store" (id text PRIMARY KEY,"tenantId" text,status text,name text,"salesRepOrderVisibility" text);
    CREATE TABLE "StaffStoreAssignment" (id text PRIMARY KEY,"membershipId" text,"tenantId" text,"storeId" text,status text,role text);
    CREATE TABLE "FinanceBook" (id text PRIMARY KEY,"tenantId" text REFERENCES "Tenant","currencyCode" text,"lastSequence" bigint,"startsAt" timestamp(3),UNIQUE("tenantId","currencyCode"));
    CREATE TABLE "FinanceBill" (id text PRIMARY KEY,"bookId" text REFERENCES "FinanceBook","supplierId" text,kind "FinanceBillKind","payeeName" text,reference text,description text,"incurredAt" timestamp(3),"dueAt" timestamp(3),"storeId" text,"totalMinor" bigint,"paidMinor" bigint,"voidedAt" timestamp(3),"voidEffectiveAt" timestamp(3),"voidedById" text,"voidReason" text,"actorUserId" text,"createdAt" timestamp(3));
    CREATE TABLE "FinanceExpenseReceiptAsset" (id text PRIMARY KEY,"bookId" text REFERENCES "FinanceBook","billId" text REFERENCES "FinanceBill","attachmentState" "FinanceExpenseReceiptAttachmentState");
  `)
})
afterAll(async () => {
  if (!socket) return
  await db?.$disconnect()
  await Promise.allSettled([writer?.end(), observer?.end()])
  if (admin) {
    await admin.query(`DROP DATABASE "${database}"`)
    await admin.end()
  }
})
async function seed() {
  await writer.query(`TRUNCATE "FinanceExpenseReceiptAsset","FinanceBill","FinanceBook","StaffStoreAssignment","Store","TenantSubscription","SubscriptionPlan","Membership","Tenant";
    INSERT INTO "Tenant" VALUES ('tenant-a',true,'NGN','Africa/Lagos','{}'),('tenant-b',true,'USD','UTC','{}');
    INSERT INTO "Membership" VALUES ('member-a','tenant-a','actor-a','OWNER','ACTIVE','LEGACY',1),('member-b','tenant-b','actor-a','OWNER','ACTIVE','LEGACY',1),('other','tenant-a','actor-b','OWNER','ACTIVE','LEGACY',1);
    INSERT INTO "SubscriptionPlan" VALUES ('plan','starter');
    INSERT INTO "TenantSubscription" VALUES ('sub','tenant-a','plan','NONE','ACTIVE',NULL,NULL);
    INSERT INTO "FinanceBook" VALUES ('book-a','tenant-a','NGN',9007199254740993,'2030-01-01'),('book-usd','tenant-a','USD',7,'2029-01-01'),('book-b','tenant-b','NGN',9,'2028-01-01');
  `)
}
const options = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 10_000,
  timeout: 30_000,
}
const next = () =>
  db.$transaction((tx) => assertFinanceManagerSnapshot(tx, actor), options)
const bookNext = (scope: FinanceReadBookScope = { currentCurrency: "NGN" }) =>
  db.$transaction(
    (tx) => getFinanceManagerBookSnapshot(tx, { ...actor, ...scope }),
    options,
  )
async function previousBook(
  tx: Prisma.TransactionClient,
  scope: FinanceReadBookScope,
  guard: (
    tx: Prisma.TransactionClient,
    input: typeof actor,
  ) => Promise<{ currencyCode: string }> = assertFinanceManagerSnapshot,
) {
  const tenant = await guard(tx, actor)
  const book = await tx.financeBook.findFirst({
    where: financeReadBookWhere({ ...actor, ...scope }, tenant.currencyCode),
    select: {
      id: true,
      currencyCode: true,
      lastSequence: true,
      startsAt: true,
    },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  return book
}

check(
  "joined Book preserves typed snapshot/currency/tenant identity and removes one or two body statements",
  async () => {
    await seed()
    for (const scope of [
      { currentCurrency: "NGN" },
      { bookId: "book-a" },
      { bookId: "book-usd" },
    ]) {
      for (const guard of [
        assertFinanceManagerSnapshot,
        assertFinanceManager,
      ]) {
        reads = 0
        const expected = await db.$transaction(
          (tx) => previousBook(tx, scope, guard),
          options,
        )
        expect(reads).toBe(guard === assertFinanceManagerSnapshot ? 2 : 3)
        reads = 0
        expect(await bookNext(scope)).toEqual(expected)
        expect(reads).toBe(1)
      }
    }
    expect(await bookNext()).toEqual({
      id: "book-a",
      currencyCode: "NGN",
      lastSequence: 9007199254740993n,
      startsAt: new Date("2030-01-01Z"),
    })
    for (const scope of [
      { currentCurrency: "USD" },
      { currentCurrency: "NGN' OR true --" },
      { bookId: "book-b" },
      { bookId: "missing" },
    ]) {
      await expect(bookNext(scope)).rejects.toMatchObject({ code: "NOT_FOUND" })
    }
    await writer.query(`DELETE FROM "FinanceBook" WHERE id='book-a'`)
    await expect(bookNext()).rejects.toMatchObject({ code: "NOT_FOUND" })
  },
)

check(
  "joined Book retains all authority decisions before missing or foreign Book errors",
  async () => {
    await seed()
    for (const role of Object.values(MembershipRole))
      for (const status of Object.values(MembershipStatus))
        for (const active of [true, false]) {
          await writer.query(
            `UPDATE "Membership" SET role=$1,status=$2 WHERE id='member-a'`,
            [role, status],
          )
          await writer.query(
            `UPDATE "Tenant" SET "isActive"=$1 WHERE id='tenant-a'`,
            [active],
          )
          const admitted =
            ["OWNER", "ADMIN"].includes(role) && status === "ACTIVE" && active
          if (admitted)
            expect((await bookNext()).lastSequence).toBe(9007199254740993n)
          else
            await expect(bookNext()).rejects.toMatchObject({
              code: "FORBIDDEN",
            })
          await expect(bookNext({ bookId: "book-b" })).rejects.toMatchObject({
            code: admitted ? "NOT_FOUND" : "FORBIDDEN",
          })
        }
    await seed()
    await writer.query(`DELETE FROM "Membership" WHERE id='member-a'`)
    await expect(bookNext()).rejects.toMatchObject({ code: "FORBIDDEN" })
  },
)

check(
  "actual Bills reader preserves money, counts, bounds, cursor and attached receipt DTOs",
  async () => {
    await seed()
    for (const [id, book, kind, total, paid, day, voided] of [
      ["expense-a", "book-a", "EXPENSE", "9007199254740993", "3", 2, null],
      ["paid-a", "book-a", "EXPENSE", "100", "100", 1, null],
      ["void-a", "book-a", "EXPENSE", "50", "10", 3, "2030-01-03"],
      ["purchase-a", "book-a", "PURCHASE", "99999", "0", 4, null],
      ["foreign-a", "book-b", "EXPENSE", "99999", "0", 4, null],
      ["usd-a", "book-usd", "EXPENSE", "99999", "0", 4, null],
    ]) {
      await writer.query(
        `INSERT INTO "FinanceBill" (id,"bookId",kind,"payeeName",description,"incurredAt","totalMinor","paidMinor","actorUserId","createdAt","voidedAt") VALUES ($1,$2,$3,'Payee','Expense',$4,$5,$6,'actor-a','2030-01-01',$7)`,
        [id, book, kind, `2030-01-0${day}`, total, paid, voided],
      )
    }
    await writer.query(
      `INSERT INTO "FinanceExpenseReceiptAsset" VALUES ('receipt-1','book-a','expense-a','ATTACHED'),('receipt-2','book-a','expense-a','ATTACHED'),('receipt-3','book-a','paid-a','UNATTACHED')`,
    )
    const explicit = await listFinanceBills(db, {
      ...actor,
      bookId: "book-a",
      limit: 1,
    })
    expect(explicit).toMatchObject({
      currencyCode: "NGN",
      count: 2,
      nextCursor: "expense-a",
      summary: {
        incurredMinor: "9007199254741093",
        paidAgainstBillsMinor: "103",
        outstandingMinor: "9007199254740990",
      },
      items: [
        {
          id: "expense-a",
          incurredAt: new Date("2030-01-02Z"),
          totalMinor: "9007199254740993",
          paidMinor: "3",
          outstandingMinor: "9007199254740990",
          receiptCount: 2,
          status: "PARTIAL",
        },
      ],
    })
    const current = await listFinanceBills(db, {
      ...actor,
      currentCurrency: "NGN",
      limit: 1,
    })
    expect(current).toEqual({ ...explicit, resolvedBookId: "book-a" })
    const continuation = await listFinanceBills(db, {
      ...actor,
      bookId: "book-a",
      limit: 1,
      cursor: "expense-a",
    })
    expect(continuation.items.map((item) => item.id)).toEqual(["paid-a"])
    expect(continuation.items[0]).toMatchObject({
      status: "PAID",
      outstandingMinor: "0",
      receiptCount: 0,
    })
    expect(continuation.summary).toEqual(explicit.summary)
    const missingReceipt = await listFinanceBills(db, {
      ...actor,
      bookId: "book-a",
      status: "NO_RECEIPT",
    })
    expect(missingReceipt.items.map((item) => item.id)).toEqual(["paid-a"])
  },
)
async function blocked(pid: number) {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const state = await observer.query<{ wait_event_type: string | null }>(
      "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
      [pid],
    )
    if (state.rows[0]?.wait_event_type === "Lock") return
    await Bun.sleep(5)
  }
  throw Error("Fixture did not reach its held Membership lock.")
}
async function whileWaiting<T>(
  read: (tx: Prisma.TransactionClient) => Promise<T>,
  mutation: string,
  isolationLevel: Prisma.TransactionIsolationLevel = options.isolationLevel,
) {
  await writer.query("BEGIN")
  await writer.query(
    `SELECT id FROM "Membership" WHERE id='member-a' FOR UPDATE`,
  )
  let opened: (pid: number) => void = () => {
    throw Error("Fixture readiness not initialized")
  }
  const ready = new Promise<number>((resolve) => {
    opened = resolve
  })
  const result = db.$transaction(
    async (tx) => {
      const [row] = await tx.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`
      if (!row) throw Error("Missing fixture backend")
      opened(row.pid)
      return read(tx)
    },
    { ...options, isolationLevel },
  )
  // Capture rejection immediately; membership updates can serialize-fail at release.
  const settled = result.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  )
  try {
    await blocked(await ready)
    await writer.query(mutation)
    await writer.query("COMMIT")
    return await settled
  } finally {
    await writer.query("ROLLBACK")
    await settled
  }
}
check(
  "joined Book keeps the same currency/sequence snapshot across a Membership wait and refreshes next transaction",
  async () => {
    for (const read of [
      (tx: Prisma.TransactionClient) =>
        previousBook(tx, { currentCurrency: "NGN" }, assertFinanceManager),
      (tx: Prisma.TransactionClient) =>
        previousBook(tx, { currentCurrency: "NGN" }),
      (tx: Prisma.TransactionClient) =>
        getFinanceManagerBookSnapshot(tx, { ...actor, currentCurrency: "NGN" }),
    ]) {
      await seed()
      const result = await whileWaiting(
        read,
        `UPDATE "Tenant" SET "currencyCode"='USD' WHERE id='tenant-a'; UPDATE "FinanceBook" SET "lastSequence"=9007199254740994 WHERE id='book-a'`,
      )
      expect(result).toEqual({
        ok: true,
        value: {
          id: "book-a",
          currencyCode: "NGN",
          lastSequence: 9007199254740993n,
          startsAt: new Date("2030-01-01Z"),
        },
      })
      await expect(bookNext()).rejects.toMatchObject({ code: "NOT_FOUND" })
      expect(await bookNext({ currentCurrency: "USD" })).toMatchObject({
        id: "book-usd",
        currencyCode: "USD",
        lastSequence: 7n,
      })
      expect((await bookNext({ bookId: "book-a" })).lastSequence).toBe(
        9007199254740994n,
      )
    }
  },
)

check(
  "joined Book serializes a concurrent Membership revocation before returning Book facts",
  async () => {
    await seed()
    const result = await whileWaiting(
      (tx) =>
        getFinanceManagerBookSnapshot(tx, { ...actor, currentCurrency: "NGN" }),
      `UPDATE "Membership" SET status='SUSPENDED' WHERE id='member-a'`,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
      if (result.error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(result.error.code).toBe("P2010")
        expect(result.error.message).toContain("40001")
      }
    }
    await expect(bookNext()).rejects.toMatchObject({ code: "FORBIDDEN" })
  },
)
check(
  "snapshot admission preserves every canonical role/status/active-business decision and Tenant fields",
  async () => {
    await seed()
    for (const role of Object.values(MembershipRole))
      for (const status of Object.values(MembershipStatus))
        for (const active of [true, false]) {
          await writer.query(
            `UPDATE "Membership" SET role=$1,status=$2 WHERE id='member-a'`,
            [role, status],
          )
          await writer.query(
            `UPDATE "Tenant" SET "isActive"=$1 WHERE id='tenant-a'`,
            [active],
          )
          const expected = role === "OWNER" || role === "ADMIN"
          const admitted = expected && status === "ACTIVE" && active
          for (const guard of [
            assertFinanceManager,
            assertFinanceManagerSnapshot,
          ]) {
            const result = db.$transaction((tx) => guard(tx, actor), options)
            if (admitted)
              expect(await result).toEqual({
                id: "tenant-a",
                currencyCode: "NGN",
                timezone: "Africa/Lagos",
                isActive: true,
              })
            else
              await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" })
          }
        }
  },
)
check(
  "scope parameters bind and fresh transactions reject missing/foreign actors and changed authority",
  async () => {
    await seed()
    expect(await next()).toMatchObject({ id: "tenant-a", currencyCode: "NGN" })
    for (const input of [
      { ...actor, tenantId: "tenant-a' OR true --" },
      { ...actor, actorUserId: "missing" },
    ])
      await expect(
        db.$transaction(
          (tx) => assertFinanceManagerSnapshot(tx, input),
          options,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await writer.query(
      `UPDATE "Tenant" SET "currencyCode"='USD',timezone='UTC' WHERE id='tenant-a'`,
    )
    expect(await next()).toMatchObject({ currencyCode: "USD", timezone: "UTC" })
    await writer.query(
      `UPDATE "Membership" SET role='CASHIER' WHERE id='member-a'`,
    )
    await expect(next()).rejects.toMatchObject({ code: "FORBIDDEN" })
  },
)
check(
  "RepeatableRead guard keeps canonical snapshot facts across a Membership-lock wait; next transaction refreshes",
  async () => {
    for (const guard of [assertFinanceManager, assertFinanceManagerSnapshot]) {
      await seed()
      const result = await whileWaiting(
        (tx) => guard(tx, actor),
        `UPDATE "Tenant" SET "isActive"=false,"currencyCode"='USD' WHERE id='tenant-a'`,
      )
      expect(result).toEqual({
        ok: true,
        value: {
          id: "tenant-a",
          currencyCode: "NGN",
          timezone: "Africa/Lagos",
          isActive: true,
        },
      })
      await expect(next()).rejects.toMatchObject({ code: "FORBIDDEN" })
    }
  },
)
check(
  "ReadCommitted control proves why Book/commands must retain their post-lock fact read",
  async () => {
    await seed()
    const result = await whileWaiting(
      (tx) => assertFinanceManager(tx, actor),
      `UPDATE "Tenant" SET "isActive"=false WHERE id='tenant-a'`,
      Prisma.TransactionIsolationLevel.ReadCommitted,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatchObject({ code: "FORBIDDEN" })
    await seed()
    const unsupported = await whileWaiting(
      (tx) => assertFinanceManagerSnapshot(tx, actor),
      `UPDATE "Tenant" SET "isActive"=false WHERE id='tenant-a'`,
      Prisma.TransactionIsolationLevel.ReadCommitted,
    )
    expect(unsupported.ok).toBe(true) // Diagnostic control; never an allowed caller.
  },
)
check(
  "current Activity snapshot owner retains one coherent subscription/Tenant snapshot then observes the next scope",
  async () => {
    await seed()
    const viewer = { tenantId: actor.tenantId, viewerUserId: actor.actorUserId }
    const result = await whileWaiting(
      (tx) => getActivityScopeMember(tx, viewer),
      `UPDATE "SubscriptionPlan" SET key='free' WHERE id='plan'; UPDATE "Tenant" SET timezone='UTC' WHERE id='tenant-a'`,
    )
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.value?.tenant).toMatchObject({
        timezone: "Africa/Lagos",
        subscription: { plan: { key: "starter" } },
      })
    expect(
      await db.$transaction(
        (tx) => getActivityScopeMember(tx, viewer),
        options,
      ),
    ).toMatchObject({
      tenant: { timezone: "UTC", subscription: { plan: { key: "free" } } },
    })
  },
)
check(
  "concurrent Membership revocation serializes both snapshot guards instead of accepting updated authority",
  async () => {
    for (const guard of [assertFinanceManager, assertFinanceManagerSnapshot]) {
      await seed()
      const result = await whileWaiting(
        (tx) => guard(tx, actor),
        `UPDATE "Membership" SET role='CASHIER' WHERE id='member-a'`,
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(
          Prisma.PrismaClientKnownRequestError,
        )
        if (result.error instanceof Prisma.PrismaClientKnownRequestError) {
          expect(result.error.code).toBe("P2010")
          expect(result.error.message).toContain("40001")
        }
      }
      await expect(next()).rejects.toMatchObject({ code: "FORBIDDEN" })
    }
  },
)
check(
  "joined snapshot retains the Membership SHARE lock through commit and rollback without locking Tenant",
  async () => {
    for (const read of [
      (tx: Prisma.TransactionClient) => assertFinanceManagerSnapshot(tx, actor),
      (tx: Prisma.TransactionClient) =>
        getFinanceManagerBookSnapshot(tx, { ...actor, currentCurrency: "NGN" }),
    ])
      for (const rollback of [false, true]) {
        await seed()
        let finish: () => void = () => {
          throw Error("Fixture gate is not ready")
        }
        const gate = new Promise<void>((resolve) => {
          finish = resolve
        })
        let opened: () => void = () => {
          throw Error("Fixture readiness is not ready")
        }
        const ready = new Promise<void>((resolve) => {
          opened = resolve
        })
        const failure = Error("inert rollback")
        const pending = db.$transaction(async (tx) => {
          await read(tx)
          const locks = await tx.$queryRaw<{ relation: string }[]>`
          SELECT c.relname AS relation FROM pg_locks l JOIN pg_class c ON c.oid=l.relation
          WHERE l.pid=pg_backend_pid() AND l.mode='RowShareLock'
            AND c.relname IN ('Membership','Tenant','FinanceBook')
        `
          expect(locks).toEqual([{ relation: "Membership" }])
          opened()
          await gate
          if (rollback) throw failure
        }, options)
        const settled = pending.then(
          () => ({ ok: true as const }),
          (error) => ({ ok: false as const, error }),
        )
        await ready
        const pid = (
          await writer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
        ).rows[0]?.pid
        if (!pid) throw Error("Missing fixture writer")
        const update = writer.query(
          `UPDATE "Membership" SET role='CASHIER' WHERE id='member-a'`,
        )
        try {
          await blocked(pid)
        } finally {
          finish()
        }
        await update
        const result = await settled
        expect(result.ok).toBe(!rollback)
        if (!result.ok) expect(result.error).toBe(failure)
        await expect(next()).rejects.toMatchObject({ code: "FORBIDDEN" })
      }
  },
)

check(
  "Activity projected Store grants keep the existing transaction snapshot through a Member lock wait",
  async () => {
    await seed()
    await writer.query(`UPDATE "Membership" SET role='CASHIER',"staffAccessMode"='SCOPED' WHERE id='member-a';
    INSERT INTO "Store" VALUES ('first','tenant-a','ACTIVE','First','OWN_SALES'),('second','tenant-a','ACTIVE','Second','ALL_STORE_ORDERS'),('foreign','tenant-b','ACTIVE','Foreign','ALL_STORE_ORDERS');
    INSERT INTO "StaffStoreAssignment" VALUES ('first-grant','member-a','tenant-a','first','ACTIVE','CASHIER'),('second-grant','member-a','tenant-a','second','REVOKED','CASHIER')`)
    const viewer = { tenantId: actor.tenantId, viewerUserId: actor.actorUserId }
    const result = await whileWaiting(
      (tx) => getActivityScopeMember(tx, viewer),
      `UPDATE "StaffStoreAssignment" SET status='REVOKED' WHERE id='first-grant'; UPDATE "StaffStoreAssignment" SET status='ACTIVE' WHERE id='second-grant'; UPDATE "Store" SET name='Changed',"salesRepOrderVisibility"='ALL_STORE_ORDERS' WHERE id='first'`,
    )
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.value?.stores).toEqual([
        { id: "first", name: "First", salesRepOrderVisibility: "OWN_SALES" },
      ])
    expect(
      (
        await db.$transaction(
          (tx) => getActivityScopeMember(tx, viewer),
          options,
        )
      )?.stores,
    ).toEqual([
      {
        id: "second",
        name: "Second",
        salesRepOrderVisibility: "ALL_STORE_ORDERS",
      },
    ])
  },
)

check(
  "Activity Member revocation serializes the projected Store read before it can return data",
  async () => {
    await seed()
    await writer.query(
      `INSERT INTO "Store" VALUES ('first','tenant-a','ACTIVE','Private store','OWN_SALES')`,
    )
    const viewer = { tenantId: actor.tenantId, viewerUserId: actor.actorUserId }
    const result = await whileWaiting(
      (tx) => getActivityScopeMember(tx, viewer),
      `UPDATE "Membership" SET status='SUSPENDED' WHERE id='member-a'`,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
      if (result.error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(result.error.code).toBe("P2010")
        expect(result.error.message).toContain("40001")
      }
    }
    expect(
      await db.$transaction(
        (tx) => getActivityScopeMember(tx, viewer),
        options,
      ),
    ).toBeNull()
  },
)
