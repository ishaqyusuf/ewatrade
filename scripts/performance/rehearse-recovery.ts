import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { chmodSync, mkdtempSync, readFileSync } from "node:fs"
import pg from "../../packages/db/node_modules/pg"
import { loadPerformanceDatabaseUrl, performanceTarget } from "./target.mjs"

const recoveryDatabase = "ewatrade_performance_recovery_v1"
const binaryRoot = "/opt/homebrew/opt/libpq/bin"
const sourceUrl = new URL(loadPerformanceDatabaseUrl())
sourceUrl.hostname = sourceUrl.hostname.replace("-pooler.", ".")
const recoveryUrl = new URL(sourceUrl)
recoveryUrl.pathname = `/${recoveryDatabase}`
const source = new pg.Pool({ connectionString: sourceUrl.href, max: 1 })
const recovery = new pg.Pool({ connectionString: recoveryUrl.href, max: 1 })
const started = performance.now()
const directory = mkdtempSync("/private/tmp/ewatrade-performance-recovery-")
chmodSync(directory, 0o700)
const archive = `${directory}/fixture.dump`
async function run(binary: string, args: string[], target: URL) {
  await new Promise<void>((resolve, reject) => {
    execFile(
      `${binaryRoot}/${binary}`,
      args,
      {
        env: {
          PATH: "/usr/bin:/bin",
          PGHOST: target.hostname,
          PGPORT: target.port || "5432",
          PGDATABASE: decodeURIComponent(target.pathname.slice(1)),
          PGUSER: decodeURIComponent(target.username),
          PGPASSWORD: decodeURIComponent(target.password),
          PGSSLMODE: "verify-full",
          PGSSLROOTCERT: "system",
          PGCHANNELBINDING: "require",
          PGCONNECT_TIMEOUT: "15",
        },
        timeout: 600000,
        maxBuffer: 1024 * 1024,
      },
      (error, _stdout, stderr) => {
        if (!error) return resolve()
        const category = /certificate|SSL|TLS/i.test(stderr)
          ? "TLS verification"
          : /permission denied/i.test(stderr)
            ? "permission"
            : /password authentication/i.test(stderr)
              ? "authentication"
              : /version mismatch/i.test(stderr)
                ? "client/server version"
                : "unclassified"
        reject(new Error(`${binary} failed (${category})`))
      },
    )
  })
}
async function fingerprint(pool: pg.Pool) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const { rows: tables } = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
    const results = []
    for (const { tablename } of tables) {
      const quoted = `"${tablename.replaceAll('"', '""')}"`
      // Per-row hashes sorted before aggregation make physical order irrelevant.
      const {
        rows: [row],
      } = await client.query(
        `SELECT count(*)::text AS rows, md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS digest FROM (SELECT md5(row_to_json(t)::text) AS h FROM public.${quoted} t) r`,
      )
      results.push({ table: tablename, ...row })
    }
    await client.query("ROLLBACK")
    return results
  } finally {
    client.release()
  }
}
try {
  const {
    rows: [identity],
  } = await source.query(
    "SELECT current_database() AS database,current_setting('server_version_num')::int AS version",
  )
  if (
    identity.database !== performanceTarget.database ||
    Math.floor(identity.version / 10000) !== performanceTarget.postgresMajor
  )
    throw new Error("Unexpected source identity")
  const {
    rows: [ownership],
  } = await source.query(
    `SELECT count(*)::int AS total,count(*) FILTER (WHERE "dataClassification"='QA' AND metadata->>'fixtureVersion'='ewatrade-performance-v1')::int AS owned FROM "Tenant"`,
  )
  if (!ownership.total || ownership.total !== ownership.owned)
    throw new Error("Recovery source is not exclusively fixture-owned")
  const { rows: existing } = await source.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [recoveryDatabase],
  )
  if (existing.length)
    throw new Error("Recovery destination already exists; refusing overwrite")
  console.log(
    JSON.stringify({
      stage: "snapshot-started",
      branch: performanceTarget.neonBranchId,
    }),
  )
  const before = await fingerprint(source)
  await run(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-acl", `--file=${archive}`],
    sourceUrl,
  )
  chmodSync(archive, 0o600)
  await source.query('CREATE DATABASE "ewatrade_performance_recovery_v1"')
  console.log(
    JSON.stringify({ stage: "restore-started", database: recoveryDatabase }),
  )
  await run(
    "pg_restore",
    [
      "--no-owner",
      "--no-acl",
      "--exit-on-error",
      "--jobs=4",
      "--dbname",
      recoveryDatabase,
      archive,
    ],
    recoveryUrl,
  )
  const restored = await fingerprint(recovery)
  const unchanged = await fingerprint(source)
  const passed =
    JSON.stringify(before) === JSON.stringify(restored) &&
    JSON.stringify(before) === JSON.stringify(unchanged)
  console.log(
    JSON.stringify({
      version: 1,
      fixtureVersion: performanceTarget.fixtureVersion,
      branch: performanceTarget.neonBranchId,
      sourceDatabase: performanceTarget.database,
      recoveryDatabase,
      archive,
      archiveSha256: createHash("sha256")
        .update(readFileSync(archive))
        .digest("hex"),
      seconds: (performance.now() - started) / 1000,
      tableCount: before.length,
      passed,
      tables: restored,
    }),
  )
  if (!passed) process.exitCode = 1
} catch (error) {
  // Only our fixed errors are public; provider exception text is withheld.
  console.error(
    JSON.stringify({
      status: "rehearsal-failed",
      detail:
        error instanceof Error &&
        /^(?:pg_dump|pg_restore|Recovery |Unexpected )/.test(error.message)
          ? error.message
          : "Inspect the isolated destination before retrying; no automatic deletion performed",
    }),
  )
  process.exitCode = 1
} finally {
  await Promise.all([source.end(), recovery.end()])
}
