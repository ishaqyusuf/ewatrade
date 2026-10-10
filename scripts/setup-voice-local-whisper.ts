#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
/**
 * One-time setup: assistant voice through this Mac's local Whisper (WAPI) for
 * local, preview and production. Run from the repository root:
 *
 *   bun --env-file=/dev/null scripts/setup-voice-local-whisper.ts
 *
 * - Turns voice on and enrolls every tenant ("*") in each environment.
 * - Generates a publish secret (API) and a gateway secret (jobs) per
 *   environment, reusing any already in the env files. Values are never printed.
 * - Writes .env.local / .env.preview / .env.production, including the Mac-only
 *   ASSISTANT_VOICE_TARGETS_JSON in .env.local so WAPI publishes to all three.
 * - Adds the API's voice settings to Vercel ewatrade-api (preview, production).
 *
 * Jobs read their env from the env files on deploy, so deploy jobs afterwards.
 * No cloud transcription key is added; the mic shows only while WAPI is up.
 */
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const environments = [
  {
    name: "local",
    file: ".env.local",
    registryUrl: "https://ewatrade-api.localhost/api/assistant/voice/gateway",
    vercel: null,
  },
  {
    name: "preview",
    file: ".env.preview",
    registryUrl: "https://preview-api.ewatrade.com/api/assistant/voice/gateway",
    vercel: "preview",
  },
  {
    name: "production",
    file: ".env.production",
    registryUrl: "https://api.ewatrade.com/api/assistant/voice/gateway",
    vercel: "production",
  },
] as const

const secret = () => randomBytes(36).toString("base64url")

function readEnv(file: string) {
  return existsSync(file) ? readFileSync(file, "utf8") : ""
}

function currentValue(text: string, name: string) {
  const line = text.split("\n").find((row) => row.startsWith(`${name}=`))
  return line?.slice(name.length + 1).replace(/^['"]|['"]$/g, "") || null
}

/** Replace NAME=... in place, or append under a voice heading. */
function upsert(text: string, name: string, value: string) {
  const line = `${name}=${value}`
  const lines = text.split("\n")
  const index = lines.findIndex((row) => row.startsWith(`${name}=`))
  if (index >= 0) {
    lines[index] = line
    return lines.join("\n")
  }
  const heading = "# Assistant voice (local Whisper via WAPI)"
  const body = text.includes(heading)
    ? text.replace(heading, `${heading}\n${line}`)
    : `${text.replace(/\n*$/, "\n")}\n${heading}\n${line}\n`
  return body
}

const targets: {
  environment: string
  registryUrl: string
  publishSecret: string
  gatewaySecret: string
}[] = []

for (const environment of environments) {
  let text = readEnv(environment.file)
  const publishSecret =
    currentValue(text, "ASSISTANT_VOICE_PUBLISH_SECRET") ?? secret()
  const gatewaySecret =
    currentValue(text, "ASSISTANT_VOICE_GATEWAY_SECRET") ?? secret()
  text = upsert(text, "ASSISTANT_VOICE_ENABLED", "true")
  text = upsert(text, "ASSISTANT_LOCAL_TENANT_IDS", "*")
  text = upsert(text, "ASSISTANT_VOICE_PUBLISH_SECRET", publishSecret)
  text = upsert(text, "ASSISTANT_VOICE_GATEWAY_SECRET", gatewaySecret)
  writeFileSync(environment.file, text)
  targets.push({
    environment: environment.name,
    registryUrl: environment.registryUrl,
    publishSecret,
    gatewaySecret,
  })
  console.log(`✓ ${environment.file}: voice on, all tenants, secrets set`)
}

// The Mac publishes its tunnel to every environment from the local profile.
writeFileSync(
  ".env.local",
  upsert(
    readEnv(".env.local"),
    "ASSISTANT_VOICE_TARGETS_JSON",
    `'${JSON.stringify(targets)}'`,
  ),
)
console.log(
  "✓ .env.local: ASSISTANT_VOICE_TARGETS_JSON lists local, preview, production",
)

for (const environment of environments) {
  if (!environment.vercel) continue
  const target = targets.find((row) => row.environment === environment.name)
  if (!target) continue
  const listed = spawnSync(
    "vercel",
    ["env", "ls", environment.vercel, "--cwd", "apps/api"],
    { encoding: "utf8" },
  ).stdout
  const values: [string, string, boolean][] = [
    ["ASSISTANT_VOICE_ENABLED", "true", false],
    ["ASSISTANT_LOCAL_TENANT_IDS", "*", false],
    ["ASSISTANT_VOICE_PUBLISH_SECRET", target.publishSecret, true],
  ]
  for (const [name, value, sensitive] of values) {
    if (new RegExp(`\\b${name}\\b`).test(listed)) {
      console.log(
        `· Vercel ${environment.vercel}: ${name} already set, left as is`,
      )
      continue
    }
    const added = spawnSync(
      "vercel",
      [
        "env",
        "add",
        name,
        environment.vercel,
        ...(sensitive ? ["--sensitive"] : []),
        "--cwd",
        "apps/api",
      ],
      { input: value, encoding: "utf8" },
    )
    console.log(
      added.status === 0
        ? `✓ Vercel ${environment.vercel}: ${name}`
        : `✗ Vercel ${environment.vercel}: ${name} failed: ${(added.stderr || added.stdout).trim().split("\n").at(-1)}`,
    )
  }
}

console.log(`
Next:
  1. Restart local dev (API + jobs) so they read .env.local, then start WAPI:
       bun run dev --f wapi
  2. Deploy jobs so preview/production jobs get the gateway secret:
       bun run jobs:preview:deploy && bun run jobs:deploy
  3. Redeploy ewatrade-api (preview and production) so the API reads the new settings.`)
