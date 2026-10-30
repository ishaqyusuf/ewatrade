import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"
import { Client } from "pg"
import { PrismaClient } from "../../../generated/prisma/client"
import {
  CommercialPaymentMethod,
  FinanceAccountKind,
  FinanceAccountPurpose,
  MembershipRole,
  MembershipStatus,
} from "../../../generated/prisma/enums"
import { getFinanceBook } from "./accounts"
import { readFinanceBookWithCurrencyHint } from "./book-read"

// Opt-in disposable socket only; never uses an application URL or profile.
const socket = process.env.EWATRADE_INERT_POSTGRES_SOCKET
if (socket && !/^\/(?:private\/)?tmp\/ewatrade-[\w/-]+\/socket$/.test(socket))
  throw Error("An explicitly isolated temporary PostgreSQL socket is required.")
const check = socket ? test : test.skip
const database = `ewatrade_book_fixture_${randomUUID().replaceAll("-", "")}`
const config = { host: socket, user: "fixture", port: 5432 }
const actor = { tenantId: "tenant-a", actorUserId: "actor-a" }
const makeDb = () =>
  new PrismaClient({
    adapter: new PrismaPg({ ...config, database, max: 2 }),
    log: [{ emit: "event", level: "query" }],
  })
let admin: Client
let writer: Client
let observer: Client
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
  for (const [name, values] of Object.entries({
    MembershipRole,
    MembershipStatus,
    CommercialPaymentMethod,
    FinanceAccountKind,
    FinanceAccountPurpose,
  }))
    await writer.query(
      `CREATE TYPE "${name}" AS ENUM (${Object.values(values)
        .map((value) => `'${value}'`)
        .join(",")})`,
    )
  await writer.query(`
    CREATE TABLE "Tenant" (id text PRIMARY KEY,"isActive" boolean,"currencyCode" text,timezone text);
    CREATE TABLE "Membership" (id text PRIMARY KEY,"tenantId" text REFERENCES "Tenant","userId" text,role "MembershipRole",status "MembershipStatus",UNIQUE("tenantId","userId"));
    CREATE TABLE "FinanceBook" (id text PRIMARY KEY,"tenantId" text REFERENCES "Tenant","currencyCode" text,timezone text,"startsAt" timestamp(3),"closedThrough" timestamp(3),"lastSequence" bigint,"createdById" text,"createdAt" timestamp(3),UNIQUE("tenantId","currencyCode"));
    CREATE TABLE "FinanceAccount" (id text PRIMARY KEY,"bookId" text REFERENCES "FinanceBook",code text,name text,kind "FinanceAccountKind",purpose "FinanceAccountPurpose","archivedAt" timestamp(3),"paymentMethods" "CommercialPaymentMethod"[],"paymentsPausedAt" timestamp(3),"mobileMoney" boolean,"bankName" text,"bankAccountNumber" text,"bankAccountHolder" text,"createdAt" timestamp(3));
  `)
  db = makeDb()
  db.$on("query", (event) => {
    if (/^\s*(SELECT|WITH)\b/i.test(event.query)) reads++
  })
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
  await writer.query(`TRUNCATE "FinanceAccount","FinanceBook","Membership","Tenant";
    INSERT INTO "Tenant" VALUES ('tenant-a',true,'NGN','Africa/Lagos'),('tenant-b',true,'USD','UTC');
    INSERT INTO "Membership" VALUES ('member-a','tenant-a','actor-a','OWNER','ACTIVE'),('member-b','tenant-b','actor-a','OWNER','ACTIVE');
    INSERT INTO "FinanceBook" VALUES ('book-ngn','tenant-a','NGN','Africa/Lagos','2026-10-01',NULL,9007199254740993,'actor-a','2026-10-01'),('book-usd','tenant-a','USD','UTC','2026-09-01','2026-10-01',4,'actor-a','2026-09-01'),('foreign','tenant-b','USD','UTC','2026-10-01',NULL,1,'actor-a','2026-10-01');
    INSERT INTO "FinanceAccount" VALUES ('later','book-ngn','1100','Inert bank','ASSET','BANK',NULL,ARRAY['BANK_TRANSFER']::"CommercialPaymentMethod"[],NULL,true,'Inert bank','0000','Inert holder','2026-10-01'),('first','book-ngn','1000','Inert cash','ASSET','CASH','2026-10-05',ARRAY['CASH']::"CommercialPaymentMethod"[],'2026-10-06',false,NULL,NULL,NULL,'2026-10-01');
  `)
}
async function outcome(hint?: string) {
  try {
    return { value: await getFinanceBook(db, actor, hint) }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error)) throw error
    return { code: error.code, message: error.message }
  }
}
async function waiting(minimum: number, pid?: number) {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const row = await observer.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND ($2::int IS NULL OR pid=$2)",
      [database, pid ?? null],
    )
    if (Number(row.rows[0]?.count) >= minimum) return
    await Bun.sleep(5)
  }
  throw Error("The isolated reader did not reach its membership lock wait")
}

check(
  "generated joined read preserves the full SDK DTO and removes one post-lock statement",
  async () => {
    await seed()
    reads = 0
    const original = await getFinanceBook(db, actor)
    expect(reads).toBe(3)
    reads = 0
    const current = await getFinanceBook(db, actor, "NGN")
    expect(reads).toBe(2)
    expect(current).toEqual(original)
    expect(current?.lastSequence).toBe("9007199254740993")
    expect(current?.startsAt).toBeInstanceOf(Date)
    expect(current?.accounts.map((account) => account.code)).toEqual([
      "1000",
      "1100",
    ])
    expect(current?.accounts[0]?.archivedAt).toBeInstanceOf(Date)
    expect(current?.accounts[1]?.paymentMethods).toEqual(["BANK_TRANSFER"])
  },
)
check(
  "post-lock currency drift and arbitrary hints retain authoritative current lookup",
  async () => {
    await seed()
    await writer.query(
      `UPDATE "Tenant" SET "currencyCode"='USD' WHERE id='tenant-a'`,
    )
    const original = await getFinanceBook(db, actor)
    for (const hint of ["NGN", "GBP", "USD' OR true --", ""]) {
      reads = 0
      expect(await getFinanceBook(db, actor, hint)).toEqual(original)
      expect(reads).toBe(3)
    }
    expect(original?.id).toBe("book-usd")
    await writer.query(
      `UPDATE "Tenant" SET "currencyCode"='GBP' WHERE id='tenant-a'`,
    )
    expect(await getFinanceBook(db, actor, "GBP")).toBeNull()
  },
)
check(
  "all role/status/business combinations retain canonical refusal and scope",
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
          const original = await outcome()
          const current = await outcome("NGN")
          expect(current).toEqual(original)
          expect("value" in current).toBe(
            active && status === "ACTIVE" && ["OWNER", "ADMIN"].includes(role),
          )
        }
    await writer.query(`DELETE FROM "Membership" WHERE id='member-a'`)
    expect(await outcome("NGN")).toEqual(await outcome())
  },
)
for (const revoke of [false, true])
  check(
    `a real lock wait observes committed ${revoke ? "revocation" : "currency drift"} after locking`,
    async () => {
      await seed()
      await writer.query("BEGIN")
      await writer.query(
        `SELECT id FROM "Membership" WHERE id='member-a' FOR UPDATE`,
      )
      const result = Promise.all([outcome(), outcome("NGN")])
      try {
        await waiting(2)
        if (revoke)
          await writer.query(
            `UPDATE "Membership" SET status='SUSPENDED' WHERE id='member-a'`,
          )
        else
          await writer.query(
            `UPDATE "Tenant" SET "currencyCode"='USD' WHERE id='tenant-a'`,
          )
        await writer.query("COMMIT")
      } catch (error) {
        await writer.query("ROLLBACK")
        await result
        throw error
      }
      const [original, current] = await result
      expect(current).toEqual(original)
      if (revoke) expect(current).toMatchObject({ code: "FORBIDDEN" })
      else
        expect(current).toMatchObject({
          value: { id: "book-usd", currencyCode: "USD" },
        })
    },
  )
for (const rollback of [false, true])
  check(
    `joined reader retains membership lock through ${rollback ? "rollback" : "commit"}`,
    async () => {
      await seed()
      const ready = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const result = db
        .$transaction(
          async (tx) => {
            await readFinanceBookWithCurrencyHint(tx, actor, "NGN")
            ready.resolve()
            await release.promise
            if (rollback) throw Error("Inert rollback")
          },
          { maxWait: 10000, timeout: 30000 },
        )
        .then(
          () => "committed",
          () => "rolled back",
        )
      await ready.promise
      let written = false
      const write = writer
        .query(`UPDATE "Membership" SET status='SUSPENDED' WHERE id='member-a'`)
        .then(() => {
          written = true
        })
      try {
        await waiting(1)
        expect(written).toBe(false)
      } finally {
        release.resolve()
        await result
        await write
      }
      expect(await result).toBe(rollback ? "rolled back" : "committed")
      expect(written).toBe(true)
    },
  )
