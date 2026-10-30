import { afterAll, beforeEach, expect, test } from "bun:test"
import { PGlite } from "@electric-sql/pglite"
import { PrismaClient } from "../../generated/prisma/client"
import {
  AccountAgeBand,
  BillingProvider,
  BillingSubscriptionStatus,
  MembershipRole,
  MembershipStatus,
  QaDataClassification,
  StaffAccessMode,
  StaffStoreAssignmentStatus,
  StoreStaffRole,
  StoreStatus,
  TenantMode,
  TenantType,
} from "../../generated/prisma/enums"
import { getActiveTenantForUser } from "./tenants"
import { getWorkspaceReadPreference } from "./workspace-read-preference"

// Disposable in-process PostgreSQL and the real generated Prisma query/decoder.
const pg = await PGlite.create()
for (const [name, values] of Object.entries({
  AccountAgeBand,
  MembershipRole,
  MembershipStatus,
  StaffAccessMode,
  StoreStatus,
  StoreStaffRole,
  StaffStoreAssignmentStatus,
  TenantType,
  TenantMode,
  QaDataClassification,
  BillingProvider,
  BillingSubscriptionStatus,
}))
  await pg.exec(
    `CREATE TYPE "${name}" AS ENUM (${Object.values(values)
      .map((value) => `'${value}'`)
      .join(",")})`,
  )
await pg.exec(`
 CREATE TABLE "User" (id text PRIMARY KEY,"ageBand" "AccountAgeBand");
 CREATE TABLE "Tenant" (id text PRIMARY KEY,slug text UNIQUE,name text,type "TenantType","enabledModes" "TenantMode"[],"currencyCode" text,"dataClassification" "QaDataClassification",timezone text,"qaPurgeStartedAt" timestamp(3),metadata jsonb,"isActive" boolean);
 CREATE TABLE "Membership" (id text PRIMARY KEY,"userId" text REFERENCES "User","tenantId" text REFERENCES "Tenant",role "MembershipRole",status "MembershipStatus","staffAccessMode" "StaffAccessMode","catalogEditor" boolean,"createdAt" timestamp(3),UNIQUE(id,"tenantId"),UNIQUE("tenantId","userId"));
 CREATE TABLE "Store" (id text PRIMARY KEY,"tenantId" text REFERENCES "Tenant",slug text,name text,status "StoreStatus","currencyCode" text,metadata jsonb,"createdAt" timestamp(3),UNIQUE(id,"tenantId"));
 CREATE TABLE "StaffStoreAssignment" (id text PRIMARY KEY,"tenantId" text,"membershipId" text,"storeId" text,role "StoreStaffRole",status "StaffStoreAssignmentStatus",FOREIGN KEY("membershipId","tenantId") REFERENCES "Membership"(id,"tenantId"),FOREIGN KEY("storeId","tenantId") REFERENCES "Store"(id,"tenantId"));
 CREATE TABLE "RetailOpsStaffProfile" (id text PRIMARY KEY,"tenantId" text,"membershipId" text UNIQUE,"defaultStoreId" text);
 CREATE TABLE "SubscriptionPlan" (id text PRIMARY KEY,key text);
 CREATE TABLE "TenantSubscription" (id text PRIMARY KEY,"tenantId" text UNIQUE REFERENCES "Tenant","planId" text REFERENCES "SubscriptionPlan",provider "BillingProvider",status "BillingSubscriptionStatus","billingSubscriptionId" text,"currentPeriodEndsAt" timestamp(3));
`)
const statements: {
  sql: string
  args: unknown[]
  rows: Record<string, unknown>[]
}[] = []
// Prisma public driver protocol: Boolean5/Text7/Json11. Join results have only
// these column kinds; unsupported types fail rather than silently changing data.
function columnType(oid: number) {
  if (oid === 16) return 5 as const
  if (oid === 25) return 7 as const
  if (oid === 3802) return 11 as const
  throw Error(`Unexpected fixture column type ${oid}`)
}
const adapter = {
  provider: "postgres" as const,
  adapterName: "inert-workspace-projection",
  connect: async () => ({
    provider: "postgres" as const,
    adapterName: "inert-workspace-projection",
    queryRaw: async (query: { sql: string; args: unknown[] }) => {
      const result = await pg.query<Record<string, unknown>>(
        query.sql,
        query.args,
      )
      statements.push({ ...query, rows: structuredClone(result.rows) })
      return {
        columnNames: result.fields.map((field) => field.name),
        columnTypes: result.fields.map((field) => columnType(field.dataTypeID)),
        rows: result.rows.map((row) =>
          result.fields.map((field) =>
            field.dataTypeID === 3802
              ? JSON.stringify(row[field.name])
              : row[field.name],
          ),
        ),
      }
    },
    executeScript: async () => {
      throw Error("No scripts through the application port")
    },
    executeRaw: async () => {
      throw Error("No writes through the application port")
    },
    startTransaction: async () => {
      throw Error("Projection must not add a transaction")
    },
    getConnectionInfo: () => ({ supportsRelationJoins: true }),
    dispose: async () => {},
  }),
}
const db = new PrismaClient({ adapter })
afterAll(async () => {
  await db.$disconnect()
  await pg.close()
})
const input = { userId: "actor-a", tenantSlug: "business-a", storeId: null }
beforeEach(async () => {
  await pg.exec(`TRUNCATE "StaffStoreAssignment","RetailOpsStaffProfile","TenantSubscription","SubscriptionPlan","Store","Membership","Tenant","User";
 INSERT INTO "User" VALUES ('actor-a','ADULT'),('actor-b','ADULT');
 INSERT INTO "Tenant" VALUES ('tenant-a','business-a','private-business-sentinel','MERCHANT',ARRAY['MERCHANT']::"TenantMode"[],'NGN','LIVE','Africa/Lagos',NULL,'{}',true),('tenant-b','business-b','Other','MERCHANT',ARRAY['MERCHANT']::"TenantMode"[],'USD','QA','UTC',NULL,'{}',true);
 INSERT INTO "Membership" VALUES ('member-a','actor-a','tenant-a','OWNER','ACTIVE','LEGACY',true,'2026-01-02'),('member-b','actor-b','tenant-a','ADMIN','ACTIVE','LEGACY',false,'2026-01-01'),('other-business','actor-a','tenant-b','OWNER','ACTIVE','LEGACY',false,'2026-01-01');
 INSERT INTO "Store" VALUES ('store-a','tenant-a','a-one','First','ACTIVE','NGN','{}','2026-01-01'),('store-default','tenant-a','a-two','Default','ACTIVE','NGN','{}','2026-01-02'),('store-pending','tenant-a','pending','Pending','DRAFT','NGN','{}','2026-01-03'),('store-old','tenant-a','old','Archived','ARCHIVED','NGN','{}','2026-01-04'),('foreign-store','tenant-b','foreign','Foreign','ACTIVE','USD','{}','2026-01-01');
 INSERT INTO "StaffStoreAssignment" VALUES ('grant','tenant-a','member-a','store-a','CASHIER','ACTIVE'),('inactive','tenant-a','member-a','store-default','MANAGER','REVOKED'),('closed','tenant-a','member-a','store-old','MANAGER','ACTIVE');
 INSERT INTO "RetailOpsStaffProfile" VALUES ('profile','tenant-a','member-a','store-default');
 INSERT INTO "SubscriptionPlan" VALUES ('plan','starter');
 INSERT INTO "TenantSubscription" VALUES ('sub','tenant-a','plan','NONE','ACTIVE',NULL,NULL);
 `)
  statements.length = 0
})
test("actual preference and complete context use one generated joined statement and match canonical selection", async () => {
  const result = await getWorkspaceReadPreference(db, input)
  expect(statements).toHaveLength(1)
  expect(result?.id).toBe("member-a")
  expect(result?.scope?.input).toEqual(input)
  expect(result?.scope?.tenantContext).toEqual(
    await getActiveTenantForUser(db, input),
  )
  expect(result?.scope?.tenantContext?.activeStore?.id).toBe("store-default")
  expect(result?.scope?.tenantContext?.stores.map((store) => store.id)).toEqual(
    ["store-a", "store-default", "store-pending"],
  )
})
test("every eligible age retains complete context while undeclared age returns no protected profile from SQL", async () => {
  for (const age of Object.values(AccountAgeBand)) {
    await pg.query(`UPDATE "User" SET "ageBand"=$1 WHERE id='actor-a'`, [age])
    statements.length = 0
    const result = await getWorkspaceReadPreference(db, input)
    expect(statements).toHaveLength(1)
    expect(result?.id).toBe("member-a")
    expect(result?.user.ageBand).toBe(age)
    if (age === "UNDECLARED") {
      expect(result?.scope).toBeNull()
      expect(JSON.stringify(statements[0]?.rows)).not.toContain(
        "private-business-sentinel",
      )
      expect(statements[0]?.rows[0]?.user).toMatchObject({
        ageBand: "UNDECLARED",
        memberships: [],
      })
    } else
      expect(result?.scope?.tenantContext).toEqual(
        await getActiveTenantForUser(db, input),
      )
  }
})
test("role/mode and exact/default/foreign Store choices preserve canonical visibility and refusal", async () => {
  for (const role of Object.values(MembershipRole))
    for (const mode of Object.values(StaffAccessMode)) {
      await pg.query(
        `UPDATE "Membership" SET role=$1,"staffAccessMode"=$2 WHERE id='member-a'`,
        [role, mode],
      )
      for (const storeId of [
        null,
        "store-a",
        "store-default",
        "foreign-store",
      ]) {
        const scope = { ...input, storeId }
        const result = await getWorkspaceReadPreference(db, scope)
        expect(result?.scope?.tenantContext).toEqual(
          await getActiveTenantForUser(db, scope),
        )
      }
    }
})
test("revoked/missing/inactive/foreign preferences stay absent and new reads observe changes", async () => {
  expect((await getWorkspaceReadPreference(db, input))?.scope).not.toBeNull()
  for (const status of Object.values(MembershipStatus).filter(
    (value) => value !== "ACTIVE",
  )) {
    await pg.query(`UPDATE "Membership" SET status=$1 WHERE id='member-a'`, [
      status,
    ])
    expect(await getWorkspaceReadPreference(db, input)).toBeNull()
  }
  await pg.exec(
    `UPDATE "Membership" SET status='ACTIVE' WHERE id='member-a'; UPDATE "Tenant" SET "isActive"=false WHERE id='tenant-a'`,
  )
  expect(await getWorkspaceReadPreference(db, input)).toBeNull()
  await pg.exec(`UPDATE "Tenant" SET "isActive"=true WHERE id='tenant-a'`)
  expect(
    await getWorkspaceReadPreference(db, { ...input, userId: "missing" }),
  ).toBeNull()
  expect(
    await getWorkspaceReadPreference(db, {
      ...input,
      tenantSlug: "business-a' OR true --",
    }),
  ).toBeNull()
  expect(
    (
      await getWorkspaceReadPreference(db, {
        ...input,
        tenantSlug: "business-b",
      })
    )?.scope?.tenantContext?.tenant.id,
  ).toBe("tenant-b")
})
test("QA scope fences the optional profile without changing cookie suggestion or creating a cross-scope seed", async () => {
  expect(
    (
      await getWorkspaceReadPreference(db, {
        ...input,
        qaScope: { tenantId: "tenant-a", membershipId: "member-a" },
      })
    )?.scope?.tenantContext?.tenant.id,
  ).toBe("tenant-a")
  for (const qaScope of [
    { tenantId: "tenant-b", membershipId: "other-business" },
    { tenantId: "tenant-a", membershipId: "member-b" },
  ]) {
    const result = await getWorkspaceReadPreference(db, { ...input, qaScope })
    expect(result?.id).toBe("member-a")
    expect(result?.scope).toBeNull()
    expect(JSON.stringify(statements.at(-1)?.rows)).not.toContain(
      "private-business-sentinel",
    )
  }
})
test("nested subscription dates, purge dates and metadata retain generated Prisma decoding and canonical policy", async () => {
  await pg.exec(
    `UPDATE "TenantSubscription" SET provider='PLAY_STORE',"billingSubscriptionId"='inert-binding',"currentPeriodEndsAt"='2000-01-01' WHERE id='sub'; UPDATE "Tenant" SET "qaPurgeStartedAt"='2030-01-01' WHERE id='tenant-a'`,
  )
  const result = await getWorkspaceReadPreference(db, input)
  expect(result?.scope?.tenantContext).toEqual(
    await getActiveTenantForUser(db, input),
  )
  expect(result?.scope?.tenantContext?.tenant.qaPurgeStartedAt).toBeInstanceOf(
    Date,
  )
  expect(result?.scope?.tenantContext?.tenant.retailOpsPlanId).toBe("free")
})
