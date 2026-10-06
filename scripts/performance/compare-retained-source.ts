import { readFileSync, writeFileSync } from "node:fs"
import pg from "../../packages/db/node_modules/pg"
import { readEnvironmentFile } from "../environment-profile.mjs"
import { performanceRoot } from "./target.mjs"
const records = readFileSync(
  `${performanceRoot}/.brain/artifacts/performance-phase0/environment-copies.jsonl`,
  "utf8",
)
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line))
const expected = records.find(
  (r) => r.stage === "retained-qa-copy-verified",
)?.tables
if (!expected) throw new Error("Verified snapshot is unavailable")
const url = new URL(
  readEnvironmentFile(`${performanceRoot}/.env.preview`).EWATRADE_DATABASE_URL,
)
if (
  url.hostname.split(".")[0].replace(/-pooler$/, "") !==
    "ep-tiny-pine-b8uhz5oi" ||
  !url.hostname.endsWith(".neon.tech") ||
  url.pathname !== "/neondb"
)
  throw new Error("Unexpected retained source")
url.searchParams.set("sslmode", "verify-full")
const pool = new pg.Pool({ connectionString: url.href, max: 1 })
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
try {
  const client = await pool.connect()
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const { rows: tables } = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
    const current = []
    for (let start = 0; start < tables.length; start += 25) {
      const selected = tables.slice(start, start + 25)
      const sql = selected
        .map(
          ({ tablename }, i) =>
            `SELECT $${i + 1}::text AS name,count(*)::text AS rows,md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS digest FROM (SELECT md5(row_to_json(t)::text) AS h FROM public.${quote(tablename)} t) r`,
        )
        .join(" UNION ALL ")
      current.push(
        ...(
          await client.query(
            sql,
            selected.map((t) => t.tablename),
          )
        ).rows,
      )
    }
    await client.query("ROLLBACK")
    const before = new Map(expected.map((r: { name: string }) => [r.name, r]))
    const changes = current.filter(
      (row) => JSON.stringify(before.get(row.name)) !== JSON.stringify(row),
    )
    const result = {
      observedAt: new Date().toISOString(),
      tableCount: current.length,
      unchanged: changes.length === 0 && current.length === expected.length,
      changes,
    }
    writeFileSync(
      `${performanceRoot}/.brain/artifacts/performance-phase0/retained-source-drift.json`,
      JSON.stringify(result, null, 2),
    )
    console.log(JSON.stringify(result))
  } finally {
    client.release()
  }
} catch {
  console.error("Retained source comparison failed; no profile changes made")
  process.exitCode = 1
} finally {
  await pool.end()
}
