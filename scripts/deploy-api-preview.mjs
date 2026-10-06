#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { inspectApiPreviewReadiness } from "./check-api-preview-readiness.mjs"
import { readEnvironmentFile } from "./environment-profile.mjs"
import { prepareCommittedApiArtifact } from "./release-api-build.mjs"
import {
  parseApiDeployArguments,
  resolveApiSourceRevision,
} from "./release-api-source-stage.mjs"
import {
  EWATRADE_VERCEL_API_TARGET,
  RELEASE_VERCEL_CLI,
  assertOwnedVercelDeployment,
  parseVercelDeploymentOutput,
} from "./release-vercel-deployment-output.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const api = path.join(root, "apps/api")
const { projectId, teamId } = EWATRADE_VERCEL_API_TARGET
const scope = "ishaqyusufs-projects"
const alias = "ewatrade-api-preview-ishaqyusufs-projects.vercel.app"

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    "Usage: bun run api:preview:deploy [--prepare-only|--verify-only] [--revision FULL_HEAD_SHA] [--source-repository ABSOLUTE_CLEAN_WORKTREE]",
  )
  console.log(
    "Builds clean committed HEAD with Bun 1.3.9 in a private macOS sandbox, then deploys only to the protected API Preview.",
  )
  process.exit(0)
}
const {
  prepareOnly,
  verifyOnly,
  revision: requestedRevision,
  sourceRepository = root,
} = parseApiDeployArguments(process.argv.slice(2), "preview")
const revision = verifyOnly
  ? undefined
  : resolveApiSourceRevision(sourceRepository, requestedRevision)

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=14336" },
  })
  if (result.error || result.status !== 0) {
    // Provider commands can include credentials in diagnostics. Keep their
    // output out of terminal logs and the Brain; report only the failed step.
    throw new Error(
      `${command} ${args[0] ?? ""} failed (exit ${result.status ?? "unknown"}).`,
    )
  }
  return result.stdout
}

function runVercel(args, cwd = api) {
  return run("bunx", [RELEASE_VERCEL_CLI, ...args], cwd)
}

function vercelJson(command, args, cwd = api) {
  const output = runVercel([command, ...args], cwd)
  try {
    return JSON.parse(output)
  } catch {
    throw new Error("VERCEL_DEPLOYMENT_INVALID_RECORD")
  }
}

function protectedGet(route, deployment, curlArgs = []) {
  return runVercel(
    [
      "curl",
      route,
      "--deployment",
      deployment,
      "--",
      "--silent",
      "--show-error",
      ...curlArgs,
    ],
    api,
  )
}

function verifyDeployment(url, expectedId) {
  const inspected = vercelJson("inspect", [
    url,
    "--format=json",
    "--scope",
    scope,
  ])
  if (
    inspected.name !== "ewatrade-api" ||
    inspected.target !== "preview" ||
    inspected.readyState !== "READY" ||
    !inspected.id?.startsWith("dpl_") ||
    (expectedId !== undefined && inspected.id !== expectedId)
  ) {
    throw new Error(
      "Deployment is not a Ready ewatrade-api Preview; alias was not moved.",
    )
  }

  const health = JSON.parse(protectedGet("/health", url))
  if (
    health.status !== "ok" ||
    !Number.isSafeInteger(health.database?.accounts)
  ) {
    throw new Error(
      "Protected Preview health check failed; alias was not moved.",
    )
  }
  if (protectedGet("/api/auth/get-session", url).trim() !== "null") {
    throw new Error(
      "Preview unauthenticated session check failed; alias was not moved.",
    )
  }
  const legal = JSON.parse(protectedGet("/api/trpc/auth.legalPublication", url))
  const publication = legal.result?.data?.json
  // Preview is an explicit legal testing environment in the committed server
  // contract. This does not enable the separate direct Better Auth signup route.
  if (
    publication?.signupAvailable !== true ||
    publication.acceptanceRequired !== false ||
    typeof publication.effective !== "boolean" ||
    (publication.effective
      ? typeof publication.version !== "string" ||
        publication.version.length === 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(publication.effectiveDate)
      : publication.version !== null || publication.effectiveDate !== null)
  ) {
    throw new Error(
      "Preview legal testing contract mismatch; alias was not moved.",
    )
  }
  const allowedOrigin = readEnvironmentFile(
    path.join(root, ".env.preview"),
  ).ALLOWED_API_ORIGINS.split(",")[0]
  const allowedHeaders = protectedGet("/health", url, [
    "--include",
    "--header",
    `Origin: ${allowedOrigin}`,
  ]).toLowerCase()
  if (
    !allowedHeaders.includes(
      `access-control-allow-origin: ${allowedOrigin}`.toLowerCase(),
    )
  ) {
    throw new Error(
      "Preview allowed-origin CORS check failed; alias was not moved.",
    )
  }
  const rejectedHeaders = protectedGet("/health", url, [
    "--include",
    "--header",
    "Origin: https://example.com",
  ]).toLowerCase()
  if (rejectedHeaders.includes("access-control-allow-origin:")) {
    throw new Error(
      "Preview rejected-origin CORS check failed; alias was not moved.",
    )
  }
  const pharmacy = protectedGet("/api/trpc/prescriptions.launchStatus", url, [
    "--include",
  ])
  if (
    !/^HTTP\/[\d.]+ 404\b/m.test(pharmacy) ||
    !pharmacy.toLowerCase().includes("cache-control: no-store") ||
    !pharmacy.includes('"error":"Pharmacy Commerce is unavailable."')
  ) {
    throw new Error("Preview pharmacy gate failed; alias was not moved.")
  }
  const deletion = JSON.parse(
    protectedGet("/api/trpc/accountPrivacy.externalIntakeAvailability", url),
  )
  if (deletion.result?.data?.json?.available !== false) {
    throw new Error(
      "Preview deletion intake unexpectedly available; alias was not moved.",
    )
  }
  const signup = protectedGet("/api/auth/sign-up/email", url, [
    "--include",
    "--request",
    "POST",
    "--header",
    "content-type: application/json",
    "--data",
    "not JSON",
  ])
  if (
    !/^HTTP\/[\d.]+ 404\b/m.test(signup) ||
    !signup.toLowerCase().includes("cache-control: no-store") ||
    !signup.includes('"error":"Account creation is unavailable here."')
  ) {
    throw new Error("Preview direct-signup gate failed; alias was not moved.")
  }
  return inspected.id
}

function assertNoSecrets(bundle) {
  for (const profile of [".env.preview", ".env.local", ".env.production"]) {
    const values = readEnvironmentFile(path.join(root, profile))
    for (const [key, value] of Object.entries(values)) {
      if (
        /(?:DATABASE_URL|SECRET|TOKEN|PRIVATE_KEY|INTERNAL_API_KEY)/.test(
          key,
        ) &&
        value?.length >= 16 &&
        bundle.includes(value)
      ) {
        throw new Error(
          `Bundle contains ${profile} credential ${key}; deployment stopped.`,
        )
      }
    }
  }
}

const issues = inspectApiPreviewReadiness(root)
if (issues.length)
  throw new Error(`API Preview preflight failed: ${issues.join(", ")}`)
if (
  process.env.VERCEL_API_TARGET === "production" ||
  process.env.VERCEL_ENV === "production"
) {
  throw new Error("Production environment selected; Preview deploy stopped.")
}
if (verifyOnly) {
  const id = verifyDeployment(`https://${alias}`)
  console.log(
    `Protected Preview alias ${id} passed all live launch-gate checks.`,
  )
  process.exit(0)
}

console.log(`Building committed Preview artifact ${revision}...`)
const artifact = await prepareCommittedApiArtifact({
  repository: sourceRepository,
  revision,
})
const { stage } = artifact
try {
  resolveApiSourceRevision(sourceRepository, revision)
  assertNoSecrets(
    readFileSync(path.join(stage, "apps/api/src/bundle.js"), "utf8"),
  )
  if (prepareOnly) {
    console.log(
      "Preview artifact prepared and credential scan passed. No deployment made.",
    )
    process.exitCode = 0
  } else {
    mkdirSync(path.join(stage, ".vercel"), { recursive: true })
    writeFileSync(
      path.join(stage, ".vercel/project.json"),
      `${JSON.stringify({
        orgId: teamId,
        projectId,
        projectName: "ewatrade-api",
      })}\n`,
      { mode: 0o600, flag: "wx" },
    )
    console.log("Pulling Preview-only Vercel settings...")
    runVercel(
      [
        "pull",
        "--yes",
        "--environment=preview",
        "--cwd",
        stage,
        "--scope",
        scope,
      ],
      root,
    )
    console.log("Deploying to the exact Preview API project...")
    const cliDeployment = parseVercelDeploymentOutput(
      runVercel(
        [
          "deploy",
          stage,
          "--project",
          projectId,
          "--target=preview",
          "--scope",
          scope,
          "--yes",
          "--format=json",
        ],
        root,
      ),
    )
    const rawDeployment = vercelJson("api", [
      `/v13/deployments/${cliDeployment.id}?teamId=${teamId}`,
      "--method",
      "GET",
      "--raw",
      "--scope",
      scope,
    ])
    const deployment = assertOwnedVercelDeployment(rawDeployment, {
      ...cliDeployment,
      projectId,
      teamId,
      environment: "preview",
    })
    const { url } = deployment
    const id = verifyDeployment(url, deployment.id)
    runVercel(["alias", "set", url, alias, "--scope", scope], api)
    console.log(
      `Preview deployment ${id} passed protected smoke and now serves https://${alias}`,
    )
  }
} finally {
  // `vercel pull` writes Preview secrets into this directory. Always remove it.
  artifact.cleanup()
}
