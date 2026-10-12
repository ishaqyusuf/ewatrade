import { createHash, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import pg from "pg"
import {
  applyDatabaseProfile,
  directDatabaseUrlForPrismaCli,
  loadProductionDatabaseUrl,
} from "../../../scripts/database-profile.mjs"
import { loadRootEnvironment } from "../../../scripts/environment-profile.mjs"

// Schema integrity only: no domain commands, provider calls or retained fixtures.
const root = fileURLToPath(new URL("../../../", import.meta.url))
const { env, profile } = loadRootEnvironment(root, { DEV_PROFILE: "local" })
applyDatabaseProfile(env, loadProductionDatabaseUrl(root))
if (profile !== "local") throw new Error("Development profile required")
const databaseUrl = env.EWATRADE_DATABASE_URL
if (!databaseUrl) throw new Error("Development database URL required")
const client = new pg.Client({
  connectionString: directDatabaseUrlForPrismaCli(databaseUrl),
})
const tables = [
  "CollectionIntent",
  "CollectionProviderEvent",
  "CollectionHold",
  "PayoutBeneficiary",
  "PayoutIntent",
  "PayoutProviderEvent",
  "BusinessPayoutSetting",
]
const prefix = `schema_qa_${randomUUID()}`
const id = (suffix: string) => `${prefix}_${suffix}`
const passed: string[] = []
await client.connect()
try {
  const migration = "20261012160840_collections_payouts"
  const checksum = createHash("sha256")
    .update(
      readFileSync(
        new URL(
          `../prisma/migrations/${migration}/migration.sql`,
          import.meta.url,
        ),
      ),
    )
    .digest("hex")
  const ledger = await client.query(
    "SELECT checksum, finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name = $1",
    [migration],
  )
  if (
    ledger.rows.length !== 1 ||
    !ledger.rows[0].finished_at ||
    ledger.rows[0].rolled_back_at ||
    ledger.rows[0].checksum !== checksum
  )
    throw new Error("Applied migration ledger/checksum mismatch")

  const counts = async () => {
    const result: Record<string, string> = {}
    for (const table of tables) {
      const count = await client.query(
        `SELECT count(*)::text AS n FROM "${table}"`,
      )
      result[table] = count.rows[0].n
    }
    return result
  }
  const before = await counts()
  await client.query("BEGIN")
  try {
    await client.query("SET LOCAL statement_timeout = '10s'")
    const source =
      await client.query(`SELECT o.id AS "orderId", o."tenantId", o."storeId",
      o."currencyCode", b.id AS "bookId" FROM "CommercialOrder" o
      JOIN "FinanceBook" b ON b."tenantId" = o."tenantId" AND b."currencyCode" = o."currencyCode"
      ORDER BY o."createdAt" DESC LIMIT 1`)
    const row = source.rows[0]
    if (!row) throw new Error("QA order with matching Finance Book required")
    const { tenantId, storeId, orderId, currencyCode, bookId } = row
    const expectRefusal = async (
      name: string,
      code: string,
      sql: string,
      values: unknown[],
    ) => {
      await client.query("SAVEPOINT refused_fixture")
      let refused = false
      try {
        await client.query(sql, values)
      } catch (error) {
        if (!(error instanceof Error) || Reflect.get(error, "code") !== code)
          throw error
        refused = true
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT refused_fixture")
      }
      if (!refused) throw new Error(`${name}: write was accepted`)
      passed.push(name)
    }
    const collectionSql = `INSERT INTO "CollectionIntent" (id,"tenantId","storeId","sourceKind","orderId",
      "clientIntentId",provider,"providerReference","amountMinor","currencyCode","expiresAt","updatedAt")
      VALUES ($1,$2,$3,'commercial_order',$4,$1,'deterministic',$1,1000,$5,now()+interval '1 hour',now())`
    await client.query(collectionSql, [
      id("collection"),
      tenantId,
      storeId,
      orderId,
      currencyCode,
    ])
    await client.query(collectionSql, [
      id("other_collection"),
      tenantId,
      storeId,
      orderId,
      currencyCode,
    ])
    const eventSql = `INSERT INTO "CollectionProviderEvent" (id,"intentId",provider,"providerEventId","payloadHash",
      "eventType","amountMinor","currencyCode",outcome) VALUES ($1,$2,'deterministic',$1,'qa','paid',1000,$3,'HELD')`
    await client.query(eventSql, [id("event"), id("collection"), currencyCode])
    await client.query(eventSql, [
      id("other_event"),
      id("other_collection"),
      currencyCode,
    ])
    const holdSql = `INSERT INTO "CollectionHold" (id,"tenantId","intentId","orderId","eventId","amountMinor",
      "currencyCode",reason) VALUES ($1,$2,$3,$4,$5,1000,$6,'source_already_settled')`
    await client.query(holdSql, [
      id("hold"),
      tenantId,
      id("collection"),
      orderId,
      id("event"),
      currencyCode,
    ])
    await expectRefusal(
      "hold cannot use another intent's event",
      "23503",
      holdSql,
      [
        id("bad_hold"),
        tenantId,
        id("collection"),
        orderId,
        id("other_event"),
        currencyCode,
      ],
    )
    await expectRefusal("provider event replay is unique", "23505", eventSql, [
      id("event"),
      id("collection"),
      currencyCode,
    ])
    // Same provider identity with a different row ID must also be refused.
    await expectRefusal(
      "provider identity replay with new row ID is unique",
      "23505",
      `INSERT INTO "CollectionProviderEvent" (id,provider,"providerEventId","payloadHash","eventType","amountMinor")
       VALUES ($1,'deterministic',$2,'qa','paid',1000)`,
      [id("replay"), id("event")],
    )
    await expectRefusal(
      "collection rejects a foreign business/source",
      "23503",
      collectionSql,
      [
        id("bad_collection"),
        id("missing_tenant"),
        storeId,
        orderId,
        currencyCode,
      ],
    )
    for (const suffix of ["supplier", "other_supplier"])
      await client.query(
        `INSERT INTO "FinanceSupplierAccount" (id,"bookId",code,name,"actorUserId")
        VALUES ($1,$2,$1,'Schema QA',$3)`,
        [id(suffix), bookId, id("actor")],
      )
    await client.query(
      `INSERT INTO "FinanceBill" (id,"bookId","supplierId","payeeName",description,
      "incurredAt","totalMinor","actorUserId") VALUES ($1,$2,$3,'Schema QA','Schema QA',now(),1000,$4)`,
      [id("bill"), bookId, id("supplier"), id("actor")],
    )
    await client.query(
      `INSERT INTO "FinanceAccount" (id,"bookId",code,name,kind,purpose)
      VALUES ($1,$2,$1,'Schema QA','ASSET','BANK')`,
      [id("account"), bookId],
    )
    for (const suffix of ["supplier", "other_supplier"])
      await client.query(
        `INSERT INTO "PayoutBeneficiary" (id,"tenantId","bookId","supplierId",version,country,
        "currencyCode","bankCode","bankName","accountName","accountSuffix","providerRecipientCode",status,
        "createdByUserId") VALUES ($1,$2,$3,$4,1,'NG',$5,'qa','Schema QA','Schema QA','1234',$1,'VERIFIED',$6)`,
        [
          id(`payee_${suffix}`),
          tenantId,
          bookId,
          id(suffix),
          currencyCode,
          id("actor"),
        ],
      )
    const payoutSql = `INSERT INTO "PayoutIntent" (id,"tenantId","bookId","supplierId","billId","beneficiaryId",
      "debitAccountId","amountMinor","feeMinor","totalDebitMinor","currencyCode","reviewDigest",provider,
      "providerReference",status,"draftedByUserId","approvedByUserId","stepUpVerifiedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,1000,50,1050,$8,'qa','deterministic',$1,'APPROVED',$9,$9,now())`
    const payoutValues = [
      id("payout"),
      tenantId,
      bookId,
      id("supplier"),
      id("bill"),
      id("payee_supplier"),
      id("account"),
      currencyCode,
      id("actor"),
    ]
    await client.query(payoutSql, payoutValues)
    await expectRefusal(
      "payout cannot bind another supplier's beneficiary",
      "23503",
      payoutSql,
      payoutValues.map((value, index) =>
        index === 0
          ? id("bad_payee")
          : index === 5
            ? id("payee_other_supplier")
            : value,
      ),
    )
    await expectRefusal(
      "payout cannot bind another supplier's bill",
      "23503",
      payoutSql,
      payoutValues.map((value, index) =>
        index === 0
          ? id("bad_bill")
          : index === 3
            ? id("other_supplier")
            : index === 5
              ? id("payee_other_supplier")
              : value,
      ),
    )
    await expectRefusal(
      "payout provider reference is unique",
      "23505",
      `INSERT INTO "PayoutIntent" SELECT $1,"tenantId","bookId","supplierId","billId","beneficiaryId",
       "debitAccountId","amountMinor","feeMinor","totalDebitMinor","currencyCode","reviewDigest",provider,
       "providerReference","providerTransferCode",status,"submissionCount","submissionClaimedAt",
       "draftedByUserId","approvedByUserId","stepUpVerifiedAt","approvedAt","settledAt",
       "postedJournalEntryId","correctionJournalEntryId" FROM "PayoutIntent" WHERE id=$2`,
      [id("payout_replay"), id("payout")],
    )
    await client.query(
      `INSERT INTO "PayoutProviderEvent" (id,"payoutId",provider,"providerEventId","payloadHash",status)
      VALUES ($1,$2,'deterministic',$1,'qa','pending')`,
      [id("payout_event"), id("payout")],
    )
    await client.query(
      `INSERT INTO "BusinessPayoutSetting" ("tenantId","payoutsStopped","updatedAt")
      VALUES ($1,true,now()) ON CONFLICT ("tenantId") DO NOTHING`,
      [tenantId],
    )
    passed.push("all seven model families persist within rollback transaction")
  } finally {
    await client.query("ROLLBACK")
  }
  const after = await counts()
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Row counts changed after rollback")
  console.log(
    JSON.stringify({
      profile,
      database: new URL(databaseUrl).pathname,
      migration,
      checksum,
      passed,
      rollbackCountsUnchanged: true,
    }),
  )
} finally {
  await client.end()
}
