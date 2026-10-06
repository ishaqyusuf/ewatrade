import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs"
import pg from "../../packages/db/node_modules/pg"
import { readEnvironmentFile } from "../environment-profile.mjs"
import { loadPerformanceDatabaseUrl, performanceRoot } from "./target.mjs"

// Fixed new destinations only. Never overwrite an existing database or profile.
const destinations = [
  {
    name: "development-v1",
    branch: "br-delicate-cherry-aw8yhwla",
    host: "ep-royal-dew-awnlogem.c-12.us-east-1.aws.neon.tech",
  },
  {
    name: "preview-v1",
    branch: "br-divine-forest-awxsk12z",
    host: "ep-soft-morning-awa0vqn3.c-12.us-east-1.aws.neon.tech",
  },
]
const database = "ewatrade_qa_v1"
const sourceUrl = new URL(
  readEnvironmentFile(`${performanceRoot}/.env.preview`).EWATRADE_DATABASE_URL,
)
if (
  sourceUrl.hostname.split(".")[0].replace(/-pooler$/, "") !==
    "ep-tiny-pine-b8uhz5oi" ||
  !sourceUrl.hostname.endsWith(".neon.tech")
)
  throw new Error("Unexpected retained QA source")
sourceUrl.hostname = sourceUrl.hostname.replace("-pooler.", ".")
sourceUrl.searchParams.set("sslmode", "verify-full")
const credentialTemplate = new URL(loadPerformanceDatabaseUrl())
const directory = mkdtempSync("/private/tmp/ewatrade-environment-copies-")
chmodSync(directory, 0o700)
const archive = `${directory}/retained-qa.dump`
const source = new pg.Pool({ connectionString: sourceUrl.href, max: 1 })
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
async function tableFingerprints(client: pg.PoolClient) {
  const { rows: tables } = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  )
  const rows = []
  for (let start = 0; start < tables.length; start += 25) {
    const selected = tables.slice(start, start + 25)
    const sql = selected
      .map(
        ({ tablename }, i) =>
          `SELECT $${i + 1}::text AS name,count(*)::text AS rows,md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS digest FROM (SELECT md5(row_to_json(t)::text) AS h FROM public.${quote(tablename)} t) r`,
      )
      .join(" UNION ALL ")
    rows.push(
      ...(
        await client.query(
          sql,
          selected.map((t) => t.tablename),
        )
      ).rows,
    )
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}
async function run(binary: string, args: string[], target: URL) {
  await new Promise<void>((resolve, reject) =>
    execFile(
      `/opt/homebrew/opt/libpq/bin/${binary}`,
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
        timeout: 1200000,
        maxBuffer: 1048576,
      },
      (error, _stdout, stderr) => {
        if (!error) return resolve()
        const category = /certificate|SSL|TLS/i.test(stderr)
          ? "TLS"
          : /permission denied/i.test(stderr)
            ? "permission"
            : /already exists/i.test(stderr)
              ? "already exists"
              : /syntax error/i.test(stderr)
                ? "SQL compatibility"
                : "unclassified"
        reject(new Error(`${binary} failed (${category})`))
      },
    ),
  )
}
const started = performance.now()
try {
  const client = await source.connect()
  let expected: Awaited<ReturnType<typeof tableFingerprints>>
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const {
      rows: [identity],
    } = await client.query(
      "SELECT current_database() AS database,current_setting('server_version_num')::int AS version",
    )
    if (
      identity.database !== "neondb" ||
      Math.floor(identity.version / 10000) !== 18
    )
      throw new Error("Unexpected QA source identity")
    const {
      rows: [snapshot],
    } = await client.query("SELECT pg_export_snapshot() AS id")
    expected = await tableFingerprints(client)
    console.log(
      JSON.stringify({
        stage: "retained-qa-export-started",
        tableCount: expected.length,
      }),
    )
    await run(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        `--snapshot=${snapshot.id}`,
        `--file=${archive}`,
      ],
      sourceUrl,
    )
    chmodSync(archive, 0o600)
    await client.query("ROLLBACK")
  } finally {
    client.release()
  }
  const candidates = []
  for (const destination of destinations) {
    const url = new URL(credentialTemplate)
    url.hostname = destination.host
    url.pathname = "/neondb"
    url.searchParams.set("sslmode", "verify-full")
    const admin = new pg.Pool({ connectionString: url.href, max: 1 })
    try {
      const {
        rows: [identity],
      } = await admin.query(
        "SELECT current_setting('server_version_num')::int AS version",
      )
      if (Math.floor(identity.version / 10000) !== 17)
        throw new Error("Unexpected destination version")
      if (
        (
          await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [
            database,
          ])
        ).rows.length
      )
        throw new Error("Destination already exists; no overwrite permitted")
      await admin.query(`CREATE DATABASE ${quote(database)}`)
    } finally {
      await admin.end()
    }
    url.pathname = `/${database}`
    console.log(
      JSON.stringify({
        stage: "retained-qa-restore-started",
        name: destination.name,
        branch: destination.branch,
        database,
      }),
    )
    await run(
      "pg_restore",
      [
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        "--jobs=4",
        "--dbname",
        database,
        archive,
      ],
      url,
    )
    const pool = new pg.Pool({ connectionString: url.href, max: 1 })
    try {
      const client = await pool.connect()
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
        const actual = await tableFingerprints(client)
        await client.query("ROLLBACK")
        if (JSON.stringify(expected) !== JSON.stringify(actual))
          throw new Error("Restored rows differ from exported snapshot")
        console.log(
          JSON.stringify({
            stage: "retained-qa-copy-verified",
            name: destination.name,
            branch: destination.branch,
            database,
            tableCount: actual.length,
            tables: actual,
          }),
        )
      } finally {
        client.release()
      }
    } finally {
      await pool.end()
    }
    url.hostname = url.hostname.replace(".c-12.", "-pooler.c-12.")
    candidates.push({ ...destination, database, url: url.href })
  }
  const secretFile = `${directory}/verified-candidates.json`
  writeFileSync(secretFile, JSON.stringify(candidates), { mode: 0o600 })
  console.log(
    JSON.stringify({
      stage: "copies-prepared-not-cut-over",
      seconds: (performance.now() - started) / 1000,
      archive,
      secretFile,
      snapshotDigest: createHash("sha256")
        .update(JSON.stringify(expected))
        .digest("hex"),
    }),
  )
} catch (error) {
  console.error(
    JSON.stringify({
      status: "copy-failed",
      detail:
        error instanceof Error &&
        /^(?:pg_dump|pg_restore|Unexpected |Destination |Restored )/.test(
          error.message,
        )
          ? error.message
          : "Provider operation failed; inspect new destination before retrying",
    }),
  )
  process.exitCode = 1
} finally {
  await source.end()
}
