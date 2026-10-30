import { afterAll, beforeEach, expect, test } from "bun:test"
import { PGlite } from "@electric-sql/pglite"
import type { BusinessActivityListInput } from "@ewatrade/notifications/business-events"
import { z } from "zod"
import { Prisma } from "../../../generated/prisma/client"
import { listBusinessActivityInTransaction } from "./read"

// Synthetic PostgreSQL only. Execute the production predicates, legacy union,
// scope lock, paging and presenter without connecting to an application profile.
const memory = await PGlite.create()
afterAll(() => memory.close())
await memory.exec(`
 CREATE TABLE "User" (id text PRIMARY KEY,name text,"displayName" text);
 CREATE TABLE "Tenant" (id text PRIMARY KEY,"isActive" boolean,timezone text,metadata jsonb);
 CREATE TABLE "Membership" (id text PRIMARY KEY,"tenantId" text,"userId" text,role text,status text,"staffAccessMode" text,"staffAccessRevision" integer);
 CREATE UNIQUE INDEX ON "Membership" ("tenantId","userId");
 CREATE TABLE "Store" (id text PRIMARY KEY,"tenantId" text,name text,status text,"salesRepOrderVisibility" text);
 CREATE TABLE "StaffStoreAssignment" (id text PRIMARY KEY,"tenantId" text,"membershipId" text,"storeId" text,role text,status text);
 CREATE TABLE "SubscriptionPlan" (id text PRIMARY KEY,key text);
 CREATE TABLE "TenantSubscription" (id text PRIMARY KEY,"tenantId" text,"planId" text,provider text,status text,"billingSubscriptionId" text,"currentPeriodEndsAt" timestamp(3));
 CREATE TABLE "CommercialOrder" (id text PRIMARY KEY,"tenantId" text,"storeId" text,"createdByUserId" text,"createdAt" timestamp(3),"orderNumber" text,"currencyCode" text,status text);
 CREATE TABLE "CommercialOrderPayment" (id text PRIMARY KEY,"tenantId" text,"storeId" text,"orderId" text,"recordedByUserId" text,type text,"recordedAt" timestamp(3),"createdAt" timestamp(3),"amountMinor" bigint,method text);
 CREATE TABLE "StaffInvitationCommand" (id text PRIMARY KEY,"tenantId" text);
 CREATE TABLE "FinanceJournalEntry" (id text PRIMARY KEY,"bookId" text,"reversalOfId" text,"sourceKind" text);
 CREATE TABLE "BusinessActivityEvent" (id text PRIMARY KEY,"tenantId" text,"storeId" text,"financeBookId" text,type text,category text,"schemaVersion" integer,"businessEventKey" text,"payloadHash" text,"sourceKind" text,"sourceId" text,"sourceAction" text,"actorKind" text,"originChannel" text,"actorUserId" text,"actorMembershipId" text,"subjectUserId" text,"subjectMembershipId" text,"occurredAt" timestamp(3),"recordedAt" timestamp(3),"recordingOrigin" text,payload jsonb,"amountMinor" bigint,"currencyCode" text,"correlationKey" text,"correctionOfEventKey" text);
 CREATE INDEX ON "BusinessActivityEvent" ("tenantId","occurredAt",id);
 CREATE INDEX ON "BusinessActivityEvent" ("tenantId",type,"occurredAt",id);
 CREATE INDEX ON "BusinessActivityEvent" ("tenantId","sourceKind","sourceId");
 CREATE TABLE "BusinessActivityStoreScope" ("tenantId" text,"eventId" text,"storeId" text);
`)
const viewer = { tenantId: "tenant-a", viewerUserId: "owner" }
const input = {
  from: "2026-01-01T00:00:00Z",
  to: "2026-02-01T00:00:00Z",
  limit: 2,
}
const storeQuery = z
  .object({
    where: z
      .object({
        tenantId: z.string(),
        status: z.literal("ACTIVE").optional(),
        id: z.object({ in: z.array(z.string()) }).optional(),
      })
      .strict(),
    select: z
      .object({
        id: z.literal(true),
        name: z.literal(true),
        salesRepOrderVisibility: z.literal(true),
      })
      .strict(),
    orderBy: z.tuple([
      z.object({ name: z.literal("asc") }),
      z.object({ id: z.literal("asc") }),
    ]),
  })
  .strict()

beforeEach(async () => {
  await memory.exec(`TRUNCATE "BusinessActivityStoreScope","BusinessActivityEvent","CommercialOrderPayment","CommercialOrder","FinanceJournalEntry","StaffInvitationCommand","StaffStoreAssignment","TenantSubscription","SubscriptionPlan","Store","Membership","Tenant","User";
  INSERT INTO "User" VALUES ('owner','Owner',NULL),('cashier','Cashier',NULL),('other','Other',NULL);
  INSERT INTO "Tenant" VALUES ('tenant-a',true,'UTC','{}'),('tenant-b',true,'UTC','{}');
  INSERT INTO "Membership" VALUES ('member-owner','tenant-a','owner','OWNER','ACTIVE','LEGACY',1),('member-cashier','tenant-a','cashier','CASHIER','ACTIVE','SCOPED',1),('member-other','tenant-a','other','MANAGER','ACTIVE','LEGACY',1),('foreign-member','tenant-b','owner','OWNER','ACTIVE','LEGACY',1);
  INSERT INTO "Store" VALUES ('store-a','tenant-a','First','ACTIVE','OWN_SALES'),('store-all','tenant-a','Second','ACTIVE','ALL_STORE_ORDERS'),('foreign-store','tenant-b','Foreign','ACTIVE','ALL_STORE_ORDERS');
  INSERT INTO "StaffStoreAssignment" VALUES ('grant-a','tenant-a','member-cashier','store-a','CASHIER','ACTIVE'),('grant-all','tenant-a','member-cashier','store-all','CASHIER','ACTIVE');
  INSERT INTO "SubscriptionPlan" VALUES ('plan','starter');
  INSERT INTO "TenantSubscription" VALUES ('sub','tenant-a','plan','NONE','ACTIVE',NULL,NULL);
  INSERT INTO "CommercialOrder" VALUES ('own','tenant-a','store-a','cashier','2026-01-10','OWN-1','NGN','CONFIRMED'),('hidden','tenant-a','store-a','owner','2026-01-11','HIDDEN','NGN','CONFIRMED'),('shared','tenant-a','store-all','owner','2026-01-12','SHARED','NGN','CONFIRMED'),('foreign','tenant-b','foreign-store','owner','2026-01-13','FOREIGN','USD','CONFIRMED');
  INSERT INTO "CommercialOrderPayment" VALUES ('payment','tenant-a','store-a','own','cashier','PAYMENT','2026-01-14','2026-01-14',9007199254740993,'CASH'),('refund','tenant-a','store-a','own','cashier','REFUND','2026-01-14','2026-01-14',12500,'CASH');
  `)
})
async function record(
  id: string,
  extra: {
    tenant?: string
    type?: string
    category?: string
    actor?: string | null
    payload?: object
    at?: string
    recorded?: string
  } = {},
) {
  const actor = extra.actor === undefined ? "member-owner" : extra.actor
  await memory.query(
    `INSERT INTO "BusinessActivityEvent" (id,"tenantId","storeId",type,category,"schemaVersion","businessEventKey","payloadHash","sourceKind","sourceId","sourceAction","actorKind","originChannel","actorMembershipId","occurredAt","recordedAt","recordingOrigin",payload) VALUES ($1,$2,'store-a',$3,$4,1,$1,'hash','commercial_order',$1,'created',$5,'dashboard',$6,$7,$8,'snapshot',$9)`,
    [
      id,
      extra.tenant ?? "tenant-a",
      extra.type ?? "order.recorded",
      extra.category ?? "orders",
      actor ? "staff" : "unknown",
      actor,
      extra.at ?? "2026-01-15",
      extra.recorded ?? "2026-01-15",
      JSON.stringify(
        extra.payload ?? {
          orderId: "own",
          orderNumber: "SNAPSHOT",
          customerLabel: null,
          amount: { minor: "12345", currencyCode: "NGN" },
          status: "CONFIRMED",
        },
      ),
    ],
  )
  await memory.query(
    `INSERT INTO "BusinessActivityStoreScope" VALUES ($1,$2,'store-a')`,
    [extra.tenant ?? "tenant-a", id],
  )
}
async function read(raw: BusinessActivityListInput = input, who = viewer) {
  const statements: Prisma.Sql[] = []
  const rowCounts: number[] = []
  const value = await memory.transaction(async (pg) => {
    await pg.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
    const tx = {
      $queryRaw: async (
        query: Prisma.Sql | TemplateStringsArray,
        ...values: unknown[]
      ) => {
        const sql = "text" in query ? query : Prisma.sql(query, ...values)
        statements.push(sql)
        const rows = (await pg.query(sql.text, sql.values)).rows
        rowCounts.push(rows.length)
        return rows
      },
      store: {
        findMany: async (args: unknown) => {
          const spec = storeQuery.parse(args)
          const clauses = [Prisma.sql`"tenantId"=${spec.where.tenantId}`]
          if (spec.where.status) clauses.push(Prisma.sql`status='ACTIVE'`)
          if (spec.where.id)
            clauses.push(Prisma.sql`id=ANY(${spec.where.id.in}::text[])`)
          const sql = Prisma.sql`SELECT id,name,"salesRepOrderVisibility" FROM "Store" WHERE ${Prisma.join(clauses, " AND ")} ORDER BY name ASC,id ASC`
          statements.push(sql)
          const rows = (await pg.query(sql.text, sql.values)).rows
          rowCounts.push(rows.length)
          return rows
        },
      },
    } as unknown as Prisma.TransactionClient
    return listBusinessActivityInTransaction(tx, who, raw)
  })
  return { value, statements, rowCounts }
}

test("list plus exact count uses one projection statement after the unchanged scope reads", async () => {
  const { value, statements } = await read()
  expect(value.total).toBe(5)
  expect(value.items).toHaveLength(2)
  expect(value.nextCursor).not.toBeNull()
  expect(statements).toHaveLength(3)
})

test("both sort directions traverse tied legacy payments without duplicates and retain exact money", async () => {
  for (const sort of ["newest", "oldest"] as const) {
    let cursor: string | undefined
    const keys: string[] = []
    const items = []
    do {
      const { value } = await read({ ...input, sort, cursor })
      expect(value.total).toBe(5)
      keys.push(...value.items.map((row) => row.key))
      items.push(...value.items)
      cursor = value.nextCursor ?? undefined
    } while (cursor)
    expect(new Set(keys).size).toBe(5)
    expect(keys).toHaveLength(5)
    expect(
      items.find((row) => row.type === "payment.recorded")?.amount?.minor,
    ).toBe("9007199254740993")
    expect(
      items.find((row) => row.type === "payment.refund_recorded")?.amount
        ?.minor,
    ).toBe("-12500")
  }
})

test("zero rows and exhausted cursors retain exact totals without a fake event", async () => {
  const first = await read()
  if (!first.value.nextCursor) throw Error("Missing fixture cursor")
  const position = JSON.parse(
    Buffer.from(first.value.nextCursor, "base64url").toString(),
  )
  position.at = "2000-01-01T00:00:00.000Z"
  const empty = await read({
    ...input,
    cursor: Buffer.from(JSON.stringify(position)).toString("base64url"),
  })
  expect(empty.value.items).toEqual([])
  expect(empty.value.total).toBe(5)
  expect(empty.value.nextCursor).toBeNull()
  const none = await read({ ...input, q: "no-such-event" })
  expect(none.value.total).toBe(0)
  expect(none.value.items).toEqual([])
})

test("snapshot/legacy deduplication and recorded cutoff preserve a cursor's original universe", async () => {
  const first = await read({ ...input, limit: 1 })
  if (!first.value.nextCursor) throw Error("Missing snapshot cursor")
  await record("late", { recorded: "2099-01-01" })
  const second = await read({
    ...input,
    limit: 1,
    cursor: first.value.nextCursor,
  })
  expect(second.value.total).toBe(5)
  expect(second.value.snapshotAt).toBe(first.value.snapshotAt)
  expect(second.value.items.some((row) => row.key === "late")).toBe(false)
  await memory.exec(
    `DELETE FROM "BusinessActivityStoreScope"; DELETE FROM "BusinessActivityEvent"`,
  )
  await record("snapshot")
  const result = await read({ ...input, limit: 100 })
  expect(result.value.total).toBe(5)
  expect(
    result.value.items.find((row) => row.key === "snapshot")?.amount?.minor,
  ).toBe("12345")
  expect(
    result.value.items.filter((row) => row.type === "order.recorded"),
  ).toHaveLength(3)
})

test("scope, filters, actor search and finance visibility precede both paging and count", async () => {
  const own = { tenantId: "tenant-a", viewerUserId: "cashier" }
  const result = await read({ ...input, limit: 100 }, own)
  expect(result.value.total).toBe(4)
  expect(
    result.value.items.some((row) => row.subject?.label === "HIDDEN"),
  ).toBe(false)
  const cases: (Partial<BusinessActivityListInput> & { total: number })[] = [
    { q: "OWN-1", total: 3 },
    { categories: ["payments"], total: 2 },
    { types: ["payment.refund_recorded"], total: 1 },
    { actorMembershipId: "member-cashier", total: 3 },
    { storeIds: ["store-all"], total: 1 },
    { target: { kind: "order", id: "hidden" }, total: 1 },
    { q: "%", total: 0 },
  ]
  for (const { total, ...filter } of cases) {
    const page = await read({ ...input, ...filter, limit: 100 })
    expect(page.value.total).toBe(total)
    expect(page.value.items).toHaveLength(total)
  }
  await record("unknown", { actor: null })
  expect(
    (await read({ ...input, actorKind: "unknown", limit: 100 })).value.total,
  ).toBe(1)
  await expect(
    read({ ...input, storeIds: ["foreign-store"] }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  const prior = await read(input, own)
  if (!prior.value.nextCursor) throw Error("Missing scope cursor")
  await memory.exec(
    `UPDATE "Membership" SET "staffAccessRevision"=2 WHERE id='member-cashier'`,
  )
  await expect(
    read({ ...input, cursor: prior.value.nextCursor }, own),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await record("finance", {
    type: "finance.movement_recorded",
    category: "finance",
  })
  expect((await read({ ...input, categories: ["finance"] })).value.total).toBe(
    1,
  )
  await memory.exec(`UPDATE "SubscriptionPlan" SET key='free'`)
  expect((await read({ ...input, categories: ["finance"] })).value.total).toBe(
    0,
  )
  expect(
    (await read({ ...input, categories: ["finance"] }, own)).value.total,
  ).toBe(0)
  await memory.exec(
    `UPDATE "Membership" SET status='REVOKED' WHERE id='member-owner'`,
  )
  await expect(read()).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("large recorded history retains bounded decoding and source predicate pushdown", async () => {
  await memory.exec(`INSERT INTO "BusinessActivityEvent" (id,"tenantId","storeId",type,category,"schemaVersion","businessEventKey","payloadHash","sourceKind","sourceId","sourceAction","actorKind","originChannel","actorMembershipId","occurredAt","recordedAt","recordingOrigin",payload)
    SELECT 'bulk-'||n,'tenant-a','store-a','order.recorded','orders',1,'bulk-'||n,'hash','commercial_order','own','created','staff','dashboard','member-owner',CASE WHEN n<=1000 THEN '2026-01-20'::timestamp ELSE '2020-01-20'::timestamp END,'2026-01-20','snapshot',jsonb_build_object('orderId','own','orderNumber','BULK','customerLabel',NULL,'amount',jsonb_build_object('minor','12345','currencyCode','NGN'),'status','CONFIRMED') FROM generate_series(1,2000) n;
    ANALYZE "BusinessActivityEvent"`)
  const result = await read()
  expect(result.value.total).toBe(1004)
  expect(result.value.items).toHaveLength(2)
  expect(result.rowCounts.at(-1)).toBe(3)
  expect(result.statements).toHaveLength(3)
  const projection = result.statements[2]
  if (!projection) throw Error("Missing page projection")
  const plan = await memory.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${projection.text}`,
    projection.values,
  )
  expect(JSON.stringify(plan.rows)).not.toContain(
    '"CTE Name":"activitySources"',
  )
})
