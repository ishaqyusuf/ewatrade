import { createHash } from "node:crypto"
import path from "node:path"
import pg from "../../packages/db/node_modules/pg"
import { readEnvironmentFile } from "../environment-profile.mjs"
import { performanceRoot } from "./target.mjs"

const profiles = ["local", "dev", "preview", "production"]
const fingerprint = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 16)
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
const inspected = new Map<string, unknown>()
const results = []
for (const profile of profiles) {
  const url = readEnvironmentFile(
    path.join(performanceRoot, `.env.${profile}`),
  ).EWATRADE_DATABASE_URL
  if (!url) {
    results.push({ profile, status: "missing" })
    continue
  }
  let pool: pg.Pool | undefined
  try {
    const parsed = new URL(url)
    const targetId = fingerprint(
      `${parsed.hostname.replace("-pooler.", ".")}|${parsed.pathname}`,
    )
    if (inspected.has(targetId)) {
      results.push({
        profile,
        targetId,
        sameDatabaseAs: inspected.get(targetId),
      })
      continue
    }
    pool = new pg.Pool({
      connectionString: url,
      max: 1,
      connectionTimeoutMillis: 15000,
    })
    const client = await pool.connect()
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
      await client.query("SET LOCAL statement_timeout='60s'")
      const {
        rows: [identity],
      } = await client.query(
        "SELECT current_database() AS database, current_user AS role, current_setting('server_version') AS version, pg_database_size(current_database())::text AS bytes",
      )
      const { rows: tables } = await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
      const counts = []
      // Exact snapshot counts, not pg_class estimates. No row values are read.
      for (let start = 0; start < tables.length; start += 40) {
        const selected = tables.slice(start, start + 40)
        const query = selected
          .map(
            ({ tablename }, i) =>
              `SELECT $${i + 1}::text AS name,count(*)::text AS rows FROM public.${quote(tablename)}`,
          )
          .join(" UNION ALL ")
        counts.push(
          ...(
            await client.query(
              query,
              selected.map((t) => t.tablename),
            )
          ).rows,
        )
      }
      const { rows: extensions } = await client.query(
        "SELECT extname AS name,extversion AS version FROM pg_extension ORDER BY extname",
      )
      await client.query("ROLLBACK")
      results.push({
        profile,
        targetId,
        roleId: fingerprint(identity.role),
        postgresVersion: identity.version,
        bytes: identity.bytes,
        tables: counts,
        extensions,
        observedAt: new Date().toISOString(),
        evidence: "operator-read-only-not-deployed-runtime",
      })
      inspected.set(targetId, profile)
    } finally {
      client.release()
    }
  } catch {
    results.push({ profile, status: "inspection-failed" })
    process.exitCode = 1
  } finally {
    await pool?.end()
  }
}
console.log(JSON.stringify({ version: 1, results }, null, 2))
