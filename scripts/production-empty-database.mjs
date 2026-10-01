import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import path from "node:path"

function databaseIdentity(value) {
  const url = new URL(value)
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:")
    throw new Error("API_DEPLOY_DATABASE_IDENTITY_INVALID")
  return `${url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "")}:${url.port || "5432"}/${decodeURIComponent(url.pathname)}`
}

export function assertFreshDatabaseBackup(rootDir, reference) {
  const match = reference?.match(/^local-pg-dump:(.+):sha256=([a-f0-9]{64})$/)
  if (!match) throw new Error("API_DEPLOY_FRESH_DATABASE_BACKUP_INVALID")
  const backupPath = path.resolve(rootDir, match[1])
  if (!backupPath.startsWith(`${path.resolve(rootDir, ".scratch")}${path.sep}`))
    throw new Error("API_DEPLOY_FRESH_DATABASE_BACKUP_INVALID")
  const stat = statSync(backupPath)
  const contents = readFileSync(backupPath)
  if (
    !stat.isFile() ||
    stat.size < 5 ||
    (stat.mode & 0o077) !== 0 ||
    contents.subarray(0, 5).toString() !== "PGDMP" ||
    createHash("sha256").update(contents).digest("hex") !== match[2]
  )
    throw new Error("API_DEPLOY_FRESH_DATABASE_BACKUP_INVALID")
  return backupPath
}

export function assertDistinctProductionDatabase(
  productionUrl,
  localUrl,
  previewUrl,
) {
  const production = databaseIdentity(productionUrl)
  if (
    production === databaseIdentity(localUrl) ||
    production === databaseIdentity(previewUrl)
  )
    throw new Error("API_DEPLOY_PRODUCTION_DATABASE_NOT_ISOLATED")
}

export function inspectFreshProductionDatabase(
  { productionUrl, localUrl, previewUrl, backupReference, rootDir },
  runCommand = spawnSync,
) {
  assertDistinctProductionDatabase(productionUrl, localUrl, previewUrl)
  assertFreshDatabaseBackup(rootDir, backupReference)

  const url = new URL(productionUrl)
  const result = runCommand(
    "psql",
    [
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--command",
      "BEGIN TRANSACTION READ ONLY; SELECT (SELECT count(*) FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public') + (SELECT count(*) FROM pg_catalog.pg_type AS t JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace WHERE n.nspname = 'public') + (SELECT count(*) FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'public') + (SELECT count(*) FROM pg_catalog.pg_extension AS e JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace WHERE n.nspname = 'public'); COMMIT;",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PGHOST: url.hostname,
        PGPORT: url.port || "5432",
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        PGSSLMODE: "require",
        PGOPTIONS: "-c default_transaction_read_only=on",
        PGCLIENTENCODING: "UTF8",
        PGCONNECT_TIMEOUT: "10",
        PGAPPNAME: "ewatrade-production-empty-preflight",
      },
    },
  )
  if (result.status !== 0 || !/^BEGIN\s+0\s+COMMIT\s*$/.test(result.stdout))
    throw new Error("API_DEPLOY_PRODUCTION_DATABASE_NOT_EMPTY")
  return true
}
