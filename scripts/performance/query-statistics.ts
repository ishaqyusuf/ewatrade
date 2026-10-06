import pg from "../../packages/db/node_modules/pg"
import { loadPerformanceDatabaseUrl, performanceTarget } from "./target.mjs"

const action = process.argv[2]
if (!["enable", "snapshot"].includes(action) || process.argv.length !== 3)
  throw new Error(
    "Usage: bun scripts/performance/query-statistics.ts enable|snapshot",
  )
const pool = new pg.Pool({
  connectionString: loadPerformanceDatabaseUrl(),
  max: 1,
})
try {
  if (action === "enable")
    await pool.query("CREATE EXTENSION IF NOT EXISTS pg_stat_statements")
  const {
    rows: [metadata],
  } = await pool.query("SELECT stats_reset FROM pg_stat_statements_info")
  const { rows } = await pool.query(
    "SELECT queryid::text AS query_id, calls::text, total_exec_time, mean_exec_time, max_exec_time, rows::text, shared_blks_hit::text, shared_blks_read::text, temp_blks_written::text FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) ORDER BY total_exec_time DESC LIMIT 30",
  )
  // Query text/parameters are intentionally excluded, including normalized text.
  console.log(
    JSON.stringify(
      {
        version: 1,
        branch: performanceTarget.neonBranchId,
        observedAt: new Date().toISOString(),
        available: true,
        metadata,
        statements: rows,
      },
      null,
      2,
    ),
  )
} catch {
  console.log(
    JSON.stringify({
      version: 1,
      branch: performanceTarget.neonBranchId,
      available: false,
      fallback:
        "fixed-label application traces; no provider query-statistics acceptance",
    }),
  )
  process.exitCode = 1
} finally {
  await pool.end()
}
