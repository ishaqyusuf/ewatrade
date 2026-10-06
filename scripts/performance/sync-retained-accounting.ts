import { readFileSync, writeFileSync } from "node:fs"
import pg from "../../packages/db/node_modules/pg"
import { readEnvironmentFile } from "../environment-profile.mjs"
import { loadPerformanceDatabaseUrl, performanceRoot } from "./target.mjs"
const records = readFileSync(
  `${performanceRoot}/.brain/artifacts/performance-phase0/environment-copies.jsonl`,
  "utf8",
)
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line))
const verified = records.filter((r) => r.stage === "retained-qa-copy-verified")
if (
  verified.length !== 2 ||
  !records.some((r) => r.stage === "copies-prepared-not-cut-over")
)
  throw new Error("Both destination copies must be verified first")
// The only drift observed while coordinating the owner-approved QA pause.
// Refuse any broader changes instead of guessing at row deletion or ordering.
const order = [
  "FinanceBook",
  "FinanceAccount",
  "FinanceJournalEntry",
  "FinanceJournalLine",
  "FinanceCommand",
  "CustomerLedgerAccount",
  "CustomerLedgerEntry",
]
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`
async function fingerprint(client: pg.PoolClient) {
  const { rows: tables } = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  )
  const result = []
  for (let i = 0; i < tables.length; i += 25) {
    const part = tables.slice(i, i + 25)
    const sql = part
      .map(
        ({ tablename }, j) =>
          `SELECT $${j + 1}::text AS name,count(*)::text AS rows,md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS digest FROM (SELECT md5(row_to_json(t)::text) AS h FROM public.${quote(tablename)} t) r`,
      )
      .join(" UNION ALL ")
    result.push(
      ...(
        await client.query(
          sql,
          part.map((t) => t.tablename),
        )
      ).rows,
    )
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}
const original = new URL(
  readEnvironmentFile(`${performanceRoot}/.env.preview`).EWATRADE_DATABASE_URL,
)
if (
  original.hostname.split(".")[0].replace(/-pooler$/, "") !==
    "ep-tiny-pine-b8uhz5oi" ||
  !original.hostname.endsWith(".neon.tech") ||
  original.pathname !== "/neondb"
)
  throw new Error("Unexpected retained source")
original.searchParams.set("sslmode", "verify-full")
const source = new pg.Pool({ connectionString: original.href, max: 1 })
const results = []
try {
  const client = await source.connect()
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const expected = await fingerprint(client)
    const old = new Map(
      verified[0].tables.map((r: { name: string }) => [r.name, r]),
    )
    const drift = expected
      .filter((r) => JSON.stringify(old.get(r.name)) !== JSON.stringify(r))
      .map((r) => r.name)
    if (
      expected.length !== verified[0].tables.length ||
      drift.some((name) => !order.includes(name))
    )
      throw new Error("Source changed beyond reviewed accounting tables")
    const payloads = []
    for (const table of order.filter((t) => drift.includes(t))) {
      const columns = (
        await client.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
          [table],
        )
      ).rows.map((r) => r.column_name)
      if (!columns.includes("id"))
        throw new Error("Reviewed table lacks primary identity")
      const sort = columns.includes("sequence") ? "sequence,id" : "id"
      const {
        rows: [row],
      } = await client.query(
        `SELECT coalesce(json_agg(t),'[]'::json)::text AS payload FROM (SELECT * FROM public.${quote(table)} ORDER BY ${sort}) t`,
      )
      payloads.push({ table, columns, payload: row.payload })
    }
    for (const [name, endpoint] of [
      ["development-v1", "ep-royal-dew-awnlogem"],
      ["preview-v1", "ep-soft-morning-awa0vqn3"],
    ]) {
      const url = new URL(loadPerformanceDatabaseUrl())
      url.hostname = `${endpoint}.c-12.us-east-1.aws.neon.tech`
      url.pathname = "/ewatrade_qa_v1"
      url.searchParams.set("sslmode", "verify-full")
      const pool = new pg.Pool({ connectionString: url.href, max: 1 })
      try {
        const target = await pool.connect()
        try {
          await target.query("BEGIN")
          const {
            rows: [identity],
          } = await target.query(
            "SELECT current_database() AS database,current_setting('server_version_num')::int AS version",
          )
          if (
            identity.database !== "ewatrade_qa_v1" ||
            Math.floor(identity.version / 10000) !== 17
          )
            throw new Error("Destination identity mismatch")
          const before = await fingerprint(target)
          if (
            JSON.stringify(before) !==
            JSON.stringify(verified.find((r) => r.name === name).tables)
          )
            throw new Error(
              "Destination no longer matches the verified unused copy",
            )
          for (const { table, columns, payload } of payloads) {
            const updates = columns
              .filter((c) => c !== "id")
              .map((c) => `${quote(c)}=EXCLUDED.${quote(c)}`)
              .join(",")
            await target.query(
              `INSERT INTO public.${quote(table)} SELECT * FROM json_populate_recordset(NULL::public.${quote(table)},$1::json) ON CONFLICT (id) DO UPDATE SET ${updates}`,
              [payload],
            )
          }
          const after = await fingerprint(target)
          if (JSON.stringify(after) !== JSON.stringify(expected))
            throw new Error("Destination does not match final QA snapshot")
          await target.query("COMMIT")
          const result = {
            name,
            database: "ewatrade_qa_v1",
            passed: true,
            changedTables: drift,
            tableCount: after.length,
            tables: after,
          }
          results.push(result)
          console.log(JSON.stringify({ ...result, tables: undefined }))
        } catch (error) {
          await target.query("ROLLBACK")
          throw error
        } finally {
          target.release()
        }
      } finally {
        await pool.end()
      }
    }
    await client.query("ROLLBACK")
    const latest = await fingerprint(client)
    if (JSON.stringify(latest) !== JSON.stringify(expected))
      throw new Error("Source changed during synchronization; cutover withheld")
    const evidence = {
      observedAt: new Date().toISOString(),
      sourceUnchanged: true,
      profilesChanged: false,
      results,
    }
    writeFileSync(
      `${performanceRoot}/.brain/artifacts/performance-phase0/final-qa-copy-verification.json`,
      JSON.stringify(evidence, null, 2),
    )
    console.log(
      JSON.stringify({
        stage: "final-source-and-copies-match",
        profilesChanged: false,
      }),
    )
  } finally {
    client.release()
  }
} catch (error) {
  console.error(
    JSON.stringify({
      status: "sync-failed",
      detail:
        error instanceof Error &&
        /^(Source |Destination |Reviewed )/.test(error.message)
          ? error.message
          : "Database operation failed; no profile cutover performed",
    }),
  )
  process.exitCode = 1
} finally {
  await source.end()
}
