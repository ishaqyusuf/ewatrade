import pg from "../../packages/db/node_modules/pg"
import { loadPerformanceDatabaseUrl, performanceTarget } from "./target.mjs"

const pool = new pg.Pool({
  connectionString: loadPerformanceDatabaseUrl(),
  max: 1,
  connectionTimeoutMillis: 15000,
})
try {
  const client = await pool.connect()
  try {
    await client.query("BEGIN READ ONLY")
    const {
      rows: [identity],
    } = await client.query(
      "SELECT current_database() AS database, current_setting('server_version_num')::int AS version, pg_database_size(current_database())::text AS bytes",
    )
    if (
      identity.database !== performanceTarget.database ||
      Math.floor(identity.version / 10000) !== performanceTarget.postgresMajor
    )
      throw new Error("Unexpected database identity/version")
    const {
      rows: [tables],
    } = await client.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    )
    const {
      rows: [activity],
    } = await client.query(
      "SELECT count(*)::int AS connections, count(*) FILTER (WHERE wait_event_type='Lock')::int AS lock_waiters FROM pg_stat_activity WHERE datname=current_database()",
    )
    const { rows: extensions } = await client.query(
      "SELECT name, installed_version FROM pg_available_extensions WHERE name='pg_stat_statements'",
    )
    console.log(
      JSON.stringify(
        {
          evidence: "isolated-performance-database-readback",
          branch: performanceTarget.neonBranchId,
          ...identity,
          tables: tables.count,
          activity,
          extensions,
        },
        null,
        2,
      ),
    )
    await client.query("ROLLBACK")
  } finally {
    client.release()
  }
} catch {
  console.error(
    "Performance database inspection failed; no connection secrets or provider error text emitted.",
  )
  process.exitCode = 1
} finally {
  await pool.end()
}
