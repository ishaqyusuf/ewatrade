#!/usr/bin/env bun
/**
 * Copies rotated secrets from a local env file into every EwaTrade Vercel
 * project that already defines them. Values are piped to the Vercel CLI and
 * never printed. Run after rotating keys:
 *
 *   bun --env-file=/dev/null scripts/push-secrets-to-vercel.ts production
 *   bun --env-file=/dev/null scripts/push-secrets-to-vercel.ts preview QA_POLICY_READ_KEY
 *
 * Optional names after the target limit the run to those variables.
 * PUSH_SECRETS_DRY_RUN=1 lists what would change without writing.
 * Redeploy the projects afterwards so running functions pick up the values.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const orgId = "team_BV5rgKHJH4fMyFL1YfscZIZK"
const projects = {
  "ewatrade-api": "prj_ykC8ltJlPgEuFN90CQhFpC5uC3Vh",
  "ewatrade-dashboard": "prj_KPSnNRftlTWRgW67OsnH2vUHzLYO",
  "ewatrade-marketing": "prj_SchYrvtj15KQRzTxQcZwdIvNwYCJ",
}
/** Secrets exposed in the Trigger.dev incident of 1 Nov 2026. */
const rotated = [
  "EWATRADE_DATABASE_URL",
  "EWATRADE_TRIGGER_SECRET_KEY",
  "INTERNAL_API_KEY",
  "RESEND_API_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "CATALOG_IMAGE_OPENAI_API_KEY",
  "ASSISTANT_VOICE_GATEWAY_SECRET",
  "QA_POLICY_READ_KEY",
  "LOGLY_DASHBOARD_PROJECT_KEY",
]
/** Vercel names that hold the same value as another env-file name. */
const aliases: Record<string, string> = {
  DATABASE_URL: "EWATRADE_DATABASE_URL",
}

const [target, ...only] = process.argv.slice(2)
if (target !== "production" && target !== "preview") {
  console.error("Usage: push-secrets-to-vercel.ts production|preview [NAME...]")
  process.exit(1)
}

function readEnv(file: string) {
  const values = new Map<string, string>()
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match?.[1]) continue
    values.set(match[1], (match[2] ?? "").replace(/^(['"])(.*)\1$/, "$2"))
  }
  return values
}

async function vercel(cwd: string, args: string[], input?: string) {
  const child = Bun.spawn(["vercel", ...args], {
    cwd,
    stdin: input === undefined ? "ignore" : new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { out: `${out}\n${err}`, code }
}

const env = readEnv(`.env.${target}`)
const wanted = new Set(only.length ? only : rotated)
if (process.env.PUSH_SECRETS_DRY_RUN === "1")
  console.log("dry run: listing only")
let failed = false

for (const [name, projectId] of Object.entries(projects)) {
  const cwd = join(tmpdir(), `ewatrade-vercel-link-${name}`)
  mkdirSync(join(cwd, ".vercel"), { recursive: true })
  writeFileSync(
    join(cwd, ".vercel", "project.json"),
    JSON.stringify({ projectId, orgId }),
  )
  const listed = await vercel(cwd, ["env", "ls", target])
  if (listed.code !== 0) {
    console.error(`${name}: could not list env (${listed.code})`)
    failed = true
    continue
  }
  const present = new Set(
    [...listed.out.matchAll(/^\s+([A-Z0-9_]+)\s/gm)].map((m) => m[1]),
  )
  for (const key of present) {
    const source = aliases[key] ?? key
    if (!wanted.has(source)) continue
    const value = env.get(source)
    if (!value) {
      console.error(
        `${name}: ${key} skipped, ${source} missing in .env.${target}`,
      )
      failed = true
      continue
    }
    if (process.env.PUSH_SECRETS_DRY_RUN === "1") {
      console.log(`${name}: ${key} would be updated from ${source}`)
      continue
    }
    await vercel(cwd, ["env", "rm", key, target, "--yes"])
    const added = await vercel(cwd, ["env", "add", key, target], value)
    console.log(`${name}: ${key} ${added.code === 0 ? "updated" : "FAILED"}`)
    if (added.code !== 0) failed = true
  }
}
process.exit(failed ? 1 : 0)
