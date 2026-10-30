import { afterAll, expect, test } from "bun:test"
import { PGlite, type PGliteInterface } from "@electric-sql/pglite"
import { pageinspect } from "@electric-sql/pglite/contrib/pageinspect"
import { z } from "zod"
import { Prisma } from "../../../generated/prisma/client"
import {
  BillingProvider,
  BillingSubscriptionStatus,
  MembershipRole,
  MembershipStatus,
  StaffAccessMode,
  StaffStoreAssignmentStatus,
  StoreStaffRole,
} from "../../../generated/prisma/enums"
import { businessActivityScope } from "./scope"
import { getActivityScopeMember } from "./scope-member"

// In-memory PostgreSQL with real lock/tuple inspection; never an app profile.
const memory = await PGlite.create({ extensions: { pageinspect } })
afterAll(() => memory.close())
await memory.exec("CREATE EXTENSION pageinspect")
for (const [name, values] of Object.entries({
  MembershipRole,
  MembershipStatus,
  StaffAccessMode,
  StoreStaffRole,
  StaffStoreAssignmentStatus,
  BillingProvider,
  BillingSubscriptionStatus,
}))
  await memory.exec(
    `CREATE TYPE "${name}" AS ENUM (${Object.values(values)
      .map((value) => `'${value}'`)
      .join(",")})`,
  )
await memory.exec(`
 CREATE TABLE "Tenant" (id text PRIMARY KEY,"isActive" boolean,timezone text,metadata jsonb);
 CREATE TABLE "Membership" (id text PRIMARY KEY,"tenantId" text REFERENCES "Tenant", "userId" text,role "MembershipRole",status "MembershipStatus","staffAccessMode" "StaffAccessMode","staffAccessRevision" integer);
 CREATE UNIQUE INDEX ON "Membership" ("tenantId","userId");
 CREATE UNIQUE INDEX ON "Membership" (id,"tenantId");
 CREATE TABLE "Store" (id text PRIMARY KEY,"tenantId" text,name text,status text,"salesRepOrderVisibility" text);
 CREATE UNIQUE INDEX ON "Store" (id,"tenantId");
 CREATE TABLE "StaffStoreAssignment" (id text PRIMARY KEY,"tenantId" text,"membershipId" text,"storeId" text,role "StoreStaffRole",status "StaffStoreAssignmentStatus");
 CREATE UNIQUE INDEX ON "StaffStoreAssignment" ("membershipId","storeId");
 CREATE TABLE "SubscriptionPlan" (id text PRIMARY KEY,key text);
 CREATE TABLE "TenantSubscription" (id text PRIMARY KEY,"tenantId" text UNIQUE REFERENCES "Tenant","planId" text REFERENCES "SubscriptionPlan",provider "BillingProvider",status "BillingSubscriptionStatus","billingSubscriptionId" text,"currentPeriodEndsAt" timestamp(3));
`)
const viewer = { tenantId: "tenant-a", viewerUserId: "actor-a" }
const grantRole = Object.values(StoreStaffRole)[0]
if (!grantRole) throw Error("Missing canonical assignment role")
const disabledGrant = Object.values(StaffStoreAssignmentStatus).find(
  (value) => value !== "ACTIVE",
)
if (!disabledGrant) throw Error("Missing non-active assignment status")
type Subscription = {
  key: string
  provider: BillingProvider
  endsAt: Date | null
  binding: string | null
  finance: boolean
}
const subscriptions: Subscription[] = [
  {
    key: "free",
    provider: "NONE",
    endsAt: null,
    binding: null,
    finance: false,
  },
  {
    key: "starter",
    provider: "NONE",
    endsAt: null,
    binding: null,
    finance: true,
  },
  {
    key: "pro",
    provider: "PLAY_STORE",
    endsAt: new Date("2099-01-01Z"),
    binding: "inert",
    finance: true,
  },
  {
    key: "pro",
    provider: "PLAY_STORE",
    endsAt: new Date("2000-01-01Z"),
    binding: "inert",
    finance: false,
  },
  {
    key: "pro",
    provider: "MANUAL",
    endsAt: new Date("2099-01-01Z"),
    binding: "play-review:inert",
    finance: true,
  },
  {
    key: "pro",
    provider: "MANUAL",
    endsAt: new Date("2000-01-01Z"),
    binding: "play-review:inert",
    finance: false,
  },
]
type Spec = {
  role?: MembershipRole
  mode?: StaffAccessMode
  memberStatus?: MembershipStatus
  tenantActive?: boolean
  missing?: boolean
  noGrants?: boolean
  sub?: Subscription | null
}
async function seed(spec: Spec = {}) {
  await memory.exec(
    'DELETE FROM "StaffStoreAssignment"; DELETE FROM "TenantSubscription"; DELETE FROM "SubscriptionPlan"; DELETE FROM "Store"; DELETE FROM "Membership"; DELETE FROM "Tenant"',
  )
  await memory.query(
    `INSERT INTO "Tenant" VALUES ('tenant-a',$1,'Africa/Lagos',$2),('tenant-b',true,'UTC','{}')`,
    [spec.tenantActive ?? true, JSON.stringify({ inert: "metadata-sentinel" })],
  )
  await memory.exec(
    `INSERT INTO "Membership" VALUES ('member-b','tenant-b','actor-a','OWNER','ACTIVE','LEGACY',1),('other-actor','tenant-a','actor-b','OWNER','ACTIVE','LEGACY',1)`,
  )
  if (!spec.missing)
    await memory.query(
      `INSERT INTO "Membership" VALUES ('member-a','tenant-a','actor-a',$1,$2,$3,7)`,
      [
        spec.role ?? "OWNER",
        spec.memberStatus ?? "ACTIVE",
        spec.mode ?? "LEGACY",
      ],
    )
  await memory.exec(
    `INSERT INTO "Store" VALUES ('a-one','tenant-a','Zulu','ACTIVE','OWN_SALES'),('a-two','tenant-a','Alpha','ACTIVE','ALL_STORE_ORDERS'),('a-closed','tenant-a','Middle','ARCHIVED','OWN_SALES'),('b-store','tenant-b','Foreign','ACTIVE','ALL_STORE_ORDERS')`,
  )
  // Deliberately invalid cross-Tenant grant tests the SQL fence; real composite
  // FKs prevent such data. No such record is written to an application database.
  for (const [id, tenant, member, store, status] of [
    [
      "good",
      "tenant-a",
      "member-a",
      "a-one",
      spec.noGrants ? disabledGrant : "ACTIVE",
    ],
    ["revoked", "tenant-a", "member-a", "a-two", disabledGrant],
    ["closed", "tenant-a", "member-a", "a-closed", "ACTIVE"],
    ["foreign", "tenant-b", "member-a", "b-store", "ACTIVE"],
    ["other-member", "tenant-a", "other-actor", "a-two", "ACTIVE"],
  ])
    await memory.query(
      `INSERT INTO "StaffStoreAssignment" VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, tenant, member, store, grantRole, status],
    )
  const sub = spec.sub === undefined ? subscriptions[1] : spec.sub
  if (sub) {
    await memory.query(`INSERT INTO "SubscriptionPlan" VALUES ('plan-a',$1)`, [
      sub.key,
    ])
    await memory.query(
      `INSERT INTO "TenantSubscription" VALUES ('sub-a','tenant-a','plan-a',$1,'ACTIVE',$2,$3)`,
      [sub.provider, sub.binding, sub.endsAt],
    )
  }
}
const storeQuery = z
  .object({
    where: z
      .object({
        tenantId: z.string(),
        status: z.literal("ACTIVE").optional(),
        id: z
          .object({ in: z.array(z.string()) })
          .strict()
          .optional(),
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
      z.object({ name: z.literal("asc") }).strict(),
      z.object({ id: z.literal("asc") }).strict(),
    ]),
  })
  .strict()
async function tupleLock(pg: Pick<PGliteInterface, "query">) {
  const tid = (
    await pg.query<{ tid: string }>(
      `SELECT ctid::text AS tid FROM "Membership" WHERE id='member-a'`,
    )
  ).rows[0]?.tid
  const match = tid && /^\((\d+),(\d+)\)$/.exec(tid)
  if (!match) throw Error("Missing member tuple")
  const row = (
    await pg.query<{
      raw_flags: string[]
      combined_flags: string[]
      current: boolean
    }>(
      `
    SELECT flags.*, item.t_xmax::text=pg_current_xact_id()::text AS current
    FROM heap_page_items(get_raw_page('"Membership"',$1)) item,
      LATERAL heap_tuple_infomask_flags(item.t_infomask,item.t_infomask2) flags
    WHERE item.lp=$2`,
      [Number(match[1]), Number(match[2])],
    )
  ).rows[0]
  if (!row) throw Error("No inspected tuple")
  return row
}
async function invoke<T>(
  work: (
    tx: Prisma.TransactionClient,
    pg: Pick<PGliteInterface, "query">,
  ) => Promise<T>,
) {
  const calls: string[] = []
  const statements: Prisma.Sql[] = []
  const result = await memory.transaction(async (pg) => {
    await pg.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
    const tx = {
      $queryRaw: async (
        query: Prisma.Sql | TemplateStringsArray,
        ...values: unknown[]
      ) => {
        calls.push("member")
        const sql = "text" in query ? query : Prisma.sql(query, ...values)
        statements.push(sql)
        return (await pg.query(sql.text, sql.values)).rows
      },
      membership: {
        findFirst: async () => {
          throw Error("Legacy fact read must not run")
        },
      },
      store: {
        findMany: async (args: unknown) => {
          calls.push("stores")
          const spec = storeQuery.parse(args)
          const clauses = [Prisma.sql`"tenantId"=${spec.where.tenantId}`]
          if (spec.where.status) clauses.push(Prisma.sql`status='ACTIVE'`)
          if (spec.where.id)
            clauses.push(Prisma.sql`id=ANY(${spec.where.id.in}::text[])`)
          const sql = Prisma.sql`SELECT id,name,"salesRepOrderVisibility" FROM "Store" WHERE ${Prisma.join(clauses, " AND ")} ORDER BY name ASC,id ASC`
          return (await pg.query(sql.text, sql.values)).rows
        },
      },
    } as unknown as Prisma.TransactionClient
    const value = await work(tx, pg)
    const locks = (
      await pg.query<{ relation: string; mode: string }>(
        `SELECT c.relname AS relation,l.mode FROM pg_locks l JOIN pg_class c ON c.oid=l.relation WHERE c.relname IN ('Membership','Tenant','TenantSubscription','SubscriptionPlan','StaffStoreAssignment','Store')`,
      )
    ).rows
    return { value, locks }
  })
  return { ...result, calls, statements }
}

test("actual scope uses two reads and retains the exact member row share lock until caller commit", async () => {
  await seed()
  const oldLock = await memory.transaction(async (pg) => {
    await pg.query(
      `SELECT id FROM "Membership" WHERE "tenantId"=$1 AND "userId"=$2 FOR SHARE`,
      [viewer.tenantId, viewer.viewerUserId],
    )
    return tupleLock(pg)
  })
  const result = await invoke(async (tx, pg) => {
    const scope = await businessActivityScope(tx, viewer)
    const lock = await tupleLock(pg)
    return { scope, lock }
  })
  expect(result.calls).toEqual(["member", "stores"])
  expect(result.value.scope.membershipId).toBe("member-a")
  expect(result.value.lock.combined_flags).toEqual(oldLock.combined_flags)
  expect(result.value.lock.raw_flags).toContain("HEAP_XMAX_LOCK_ONLY")
  expect(result.value.lock.current).toBe(true)
  expect(
    result.locks
      .filter((lock) => lock.mode === "RowShareLock")
      .map((lock) => lock.relation),
  ).toEqual(["Membership"])
  const released = await memory.query(
    `SELECT 1 FROM pg_locks l JOIN pg_class c ON c.oid=l.relation WHERE c.relname='Membership' AND l.mode='RowShareLock'`,
  )
  expect(released.rows).toHaveLength(0)
})
test("all roles/modes and six paid/free/durable subscription states preserve access and signatures", async () => {
  for (const role of Object.values(MembershipRole))
    for (const mode of Object.values(StaffAccessMode))
      for (const sub of subscriptions) {
        await seed({ role, mode, sub })
        if (
          !["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"].includes(role)
        ) {
          await expect(
            invoke((tx) => businessActivityScope(tx, viewer)),
          ).rejects.toMatchObject({ code: "FORBIDDEN" })
          continue
        }
        const { value, calls } = await invoke((tx) =>
          businessActivityScope(tx, viewer),
        )
        const manages = role === "OWNER" || role === "ADMIN"
        const finance = manages && sub.finance
        const ids = manages
          ? ["a-two", "a-closed", "a-one"]
          : mode === "SCOPED"
            ? ["a-one"]
            : ["a-two", "a-one"]
        expect(value.stores.map((store) => store.id)).toEqual(ids)
        expect(value).toMatchObject({
          tenantId: "tenant-a",
          viewerUserId: "actor-a",
          membershipId: "member-a",
          role,
          manages,
          finance,
          timeZone: "Africa/Lagos",
        })
        expect(value.signature).toBe(
          JSON.stringify([
            "tenant-a",
            "actor-a",
            "member-a",
            role,
            mode,
            7,
            finance,
            ids.map((id) => [
              id,
              id === "a-two" ? "ALL_STORE_ORDERS" : "OWN_SALES",
            ]),
          ]),
        )
        expect(calls).toEqual(["member", "stores"])
      }
})
test("inactive/missing members, inactive Tenant and unassigned scoped staff stay refused", async () => {
  for (const spec of [
    { missing: true },
    { tenantActive: false },
    ...Object.values(MembershipStatus)
      .filter((value) => value !== "ACTIVE")
      .map((memberStatus) => ({ memberStatus })),
    { role: "CASHIER" as const, mode: "SCOPED" as const, noGrants: true },
  ]) {
    await seed(spec)
    await expect(
      invoke((tx) => businessActivityScope(tx, viewer)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  }
})
test("selected facts preserve JSON/date/optional subscriptions and filter grants by Member/Tenant/Store/status", async () => {
  await seed({ sub: subscriptions[2] })
  const { value: member, statements } = await invoke((tx) =>
    getActivityScopeMember(tx, viewer),
  )
  expect(member).toEqual({
    id: "member-a",
    role: "OWNER",
    staffAccessMode: "LEGACY",
    staffAccessRevision: 7,
    tenant: {
      timezone: "Africa/Lagos",
      metadata: { inert: "metadata-sentinel" },
      subscription: {
        plan: { key: "pro" },
        provider: "PLAY_STORE",
        status: "ACTIVE",
        billingSubscriptionId: "inert",
        currentPeriodEndsAt: new Date("2099-01-01Z"),
      },
    },
    staffStoreAssignments: [{ storeId: "a-one", role: grantRole }],
  })
  expect(statements).toHaveLength(1)
  expect(statements[0]?.text).toContain("FOR SHARE OF m")
  expect(statements[0]?.values).toEqual([viewer.tenantId, viewer.viewerUserId])
  await seed({ sub: null })
  const { value: without } = await invoke((tx) =>
    getActivityScopeMember(tx, viewer),
  )
  expect(without?.tenant.subscription).toBeNull()
})
test("successive reads recheck role/grant revision, order visibility and revocation without a cache", async () => {
  await seed({ role: "CASHIER", mode: "SCOPED" })
  const first = (await invoke((tx) => businessActivityScope(tx, viewer))).value
  await memory.exec(
    `UPDATE "Membership" SET "staffAccessRevision"=8 WHERE id='member-a'; UPDATE "StaffStoreAssignment" SET status='ACTIVE' WHERE id='revoked'; UPDATE "Store" SET "salesRepOrderVisibility"='ALL_STORE_ORDERS' WHERE id='a-one'`,
  )
  const second = (await invoke((tx) => businessActivityScope(tx, viewer))).value
  expect(second.stores.map((store) => store.id)).toEqual(["a-two", "a-one"])
  expect(second.signature).not.toBe(first.signature)
  expect(
    second.stores.every(
      (store) => store.salesRepOrderVisibility === "ALL_STORE_ORDERS",
    ),
  ).toBe(true)
  await memory.query(`UPDATE "Membership" SET status=$1 WHERE id='member-a'`, [
    Object.values(MembershipStatus).find((status) => status !== "ACTIVE"),
  ])
  await expect(
    invoke((tx) => businessActivityScope(tx, viewer)),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})
test("actor/Tenant inputs remain bound, SQL errors and inconsistent active subscription facts fail closed", async () => {
  await seed()
  const injected = "tenant-a' OR true --"
  const { value, statements } = await invoke((tx) =>
    getActivityScopeMember(tx, {
      tenantId: injected,
      viewerUserId: viewer.viewerUserId,
    }),
  )
  expect(value).toBeNull()
  expect(statements[0]?.text).not.toContain(injected)
  expect(statements[0]?.values).toContain(injected)
  const failure = new Error("inert read failure")
  const failed = {
    $queryRaw: async () => {
      throw failure
    },
  } as unknown as Prisma.TransactionClient
  await expect(getActivityScopeMember(failed, viewer)).rejects.toBe(failure)
  const inconsistent = {
    $queryRaw: async () => [
      {
        active: true,
        subscriptionId: "sub",
        planKey: null,
        provider: "NONE",
        subscriptionStatus: "ACTIVE",
      },
    ],
  } as unknown as Prisma.TransactionClient
  await expect(getActivityScopeMember(inconsistent, viewer)).rejects.toThrow(
    "subscription facts are unavailable",
  )
})
