#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readEnvironmentFile } from "./environment-profile.mjs"
import {
  STOREFRONT_PREVIEW,
  assertStorefrontPreviewAlias,
  assertStorefrontPreviewDeployment,
  assertStorefrontPreviewMode,
  assertStorefrontPreviewProjectLink,
  assertStorefrontPreviewSmoke,
  assertStorefrontPreviewUrl,
} from "./storefront-preview-guards.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const mode = process.argv[2]

if (mode === "--help" || mode === "-h") {
  console.log(
    "Usage: node scripts/deploy-storefront-preview.mjs --prepare-only|--verify-only|--deploy|--verify-deployment URL|--promote-existing URL",
  )
  process.exit(0)
}
assertStorefrontPreviewMode(process.argv.slice(2), process.env)

function run(command, args, cwd, step) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=14336" },
  })
  if (result.error || result.status !== 0)
    throw new Error(`${step} failed (exit ${result.status ?? "unknown"}).`)
  return result.stdout
}

function vercelJson(args, cwd, step) {
  const output = run("vercel", args, cwd, step)
  const start = output.indexOf("{")
  if (start < 0) throw new Error(`${step} returned no JSON.`)
  return JSON.parse(output.slice(start))
}

function inspect(url, cwd) {
  const deployment = vercelJson(
    ["inspect", url, "--format=json", "--scope", STOREFRONT_PREVIEW.scope],
    cwd,
    "Storefront Preview inspection",
  )
  if (!/^dpl_[A-Za-z0-9]+$/.test(deployment.id ?? ""))
    throw new Error("Storefront Preview inspection returned no deployment ID.")
  // `vercel inspect --format=json` omits projectId. Recheck the same deployment
  // through Vercel's read-only API before trusting its project identity.
  const identity = vercelJson(
    [
      "api",
      `/v13/deployments/${deployment.id}`,
      "--scope",
      STOREFRONT_PREVIEW.scope,
      "--raw",
    ],
    cwd,
    "Storefront Preview project identity",
  )
  if (
    identity.id !== deployment.id ||
    identity.name !== deployment.name ||
    identity.readyState !== deployment.readyState
  )
    throw new Error("Storefront Preview identity sources disagree.")
  return { ...deployment, projectId: identity.projectId }
}

function protectedGet(route, deployment, cwd, headers = false) {
  return run(
    "vercel",
    [
      "curl",
      route,
      "--deployment",
      deployment,
      "--",
      "--silent",
      "--show-error",
      ...(headers ? ["--include"] : []),
    ],
    cwd,
    "Protected Storefront Preview request",
  )
}

function verify(url, cwd) {
  const id = assertStorefrontPreviewDeployment(inspect(url, cwd))
  const rootResponse = protectedGet("/", url, cwd, true)
  const legal = JSON.parse(
    protectedGet(
      "/api/store-conversations/account/legal-publication",
      url,
      cwd,
    ),
  )
  const invalidTokenResponse = protectedGet(
    "/r/invalid-preview-safety-token",
    url,
    cwd,
    true,
  )
  const associationResponse = protectedGet(
    "/.well-known/apple-app-site-association",
    url,
    cwd,
    true,
  )
  const androidAssociationResponse = protectedGet(
    "/.well-known/assetlinks.json",
    url,
    cwd,
    true,
  )
  assertStorefrontPreviewSmoke({
    rootResponse,
    legal,
    invalidTokenResponse,
    associationResponse,
    androidAssociationResponse,
    expectedSurface:
      url === `https://${STOREFRONT_PREVIEW.alias}`
        ? "customer-chat"
        : "storefront",
  })
  return id
}

function assertNoSecrets(stage) {
  const secretValues = []
  for (const profile of [".env.local", ".env.preview", ".env.production"]) {
    const variables = readEnvironmentFile(path.join(root, profile))
    for (const [key, value] of Object.entries(variables)) {
      if (
        /(?:DATABASE_URL|SECRET|TOKEN|PRIVATE_KEY|INTERNAL_API_KEY)/.test(
          key,
        ) &&
        value?.length >= 16
      )
        secretValues.push(value)
    }
  }
  const inspectFile = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".env"))
        throw new Error(
          "Storefront Preview stage contains an environment file.",
        )
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        inspectFile(target)
      } else if (
        entry.isFile() &&
        /\.(?:[cm]?[jt]sx?|json|md|ya?ml|css|txt)$/.test(entry.name)
      ) {
        const content = readFileSync(target, "utf8")
        if (secretValues.some((value) => content.includes(value)))
          throw new Error(
            "Storefront Preview stage contains a profile credential.",
          )
      }
    }
  }
  inspectFile(stage)
}

function prepareStage(stage) {
  for (const directory of [
    "apps/storefront",
    "apps/api",
    "packages",
    "scripts",
    "patches",
  ]) {
    mkdirSync(path.join(stage, directory), { recursive: true })
    run(
      "rsync",
      [
        "-a",
        "--exclude=node_modules",
        "--exclude=.vercel",
        "--exclude=.env*",
        "--exclude=.git",
        `${directory}/`,
        `${path.join(stage, directory)}/`,
      ],
      root,
      "Isolated Storefront Preview copy",
    )
  }
  for (const file of ["package.json", "bun.lock", "tsconfig.json"])
    copyFileSync(path.join(root, file), path.join(stage, file))
  const configPath = path.join(stage, "apps/storefront/next.config.ts")
  const config = readFileSync(configPath, "utf8")
  const marker = "const nextConfig: NextConfig = {"
  if (!config.includes(marker) || config.includes("ignoreBuildErrors"))
    throw new Error("Storefront build-only TypeScript override is ambiguous.")
  writeFileSync(
    configPath,
    config.replace(
      marker,
      `${marker}\n  typescript: { ignoreBuildErrors: true },`,
    ),
  )
  assertNoSecrets(stage)
  const linkDir = path.join(stage, ".vercel")
  mkdirSync(linkDir)
  const linkPath = path.join(linkDir, "project.json")
  writeFileSync(
    linkPath,
    JSON.stringify({
      projectId: STOREFRONT_PREVIEW.projectId,
      orgId: STOREFRONT_PREVIEW.orgId,
      projectName: STOREFRONT_PREVIEW.projectName,
    }),
  )
  assertStorefrontPreviewProjectLink(JSON.parse(readFileSync(linkPath, "utf8")))
}

if (
  mode === "--verify-only" ||
  mode === "--verify-deployment" ||
  mode === "--promote-existing"
) {
  const linked = mkdtempSync(path.join(tmpdir(), "ewatrade-storefront-verify-"))
  try {
    mkdirSync(path.join(linked, ".vercel"))
    writeFileSync(
      path.join(linked, ".vercel/project.json"),
      JSON.stringify({
        projectId: STOREFRONT_PREVIEW.projectId,
        orgId: STOREFRONT_PREVIEW.orgId,
        projectName: STOREFRONT_PREVIEW.projectName,
      }),
    )
    const url =
      mode === "--verify-only"
        ? `https://${STOREFRONT_PREVIEW.alias}`
        : assertStorefrontPreviewUrl(process.argv[3])
    const id = verify(url, linked)
    if (mode === "--promote-existing") {
      run(
        "vercel",
        [
          "alias",
          "set",
          url,
          STOREFRONT_PREVIEW.alias,
          "--scope",
          STOREFRONT_PREVIEW.scope,
        ],
        linked,
        "Storefront Preview alias move",
      )
      assertStorefrontPreviewAlias(
        inspect(`https://${STOREFRONT_PREVIEW.alias}`, linked),
        id,
      )
      verify(`https://${STOREFRONT_PREVIEW.alias}`, linked)
      console.log(
        `Storefront Preview ${id} passed checks and serves the alias.`,
      )
    } else {
      console.log(`Protected Storefront Preview ${id} passed gated checks.`)
    }
  } finally {
    rmSync(linked, { recursive: true, force: true })
  }
} else {
  console.log("Checking Storefront TypeScript on main...")
  run(
    "bun",
    ["run", "--cwd", "apps/storefront", "typecheck"],
    root,
    "Storefront TypeScript check",
  )
  const stage = mkdtempSync(path.join(tmpdir(), "ewatrade-storefront-preview-"))
  try {
    prepareStage(stage)
    if (mode === "--prepare-only") {
      console.log(
        "Isolated Storefront Preview stage passed project and credential checks. No deployment made.",
      )
    } else {
      run(
        "vercel",
        [
          "pull",
          "--yes",
          "--environment=preview",
          "--cwd",
          stage,
          "--scope",
          STOREFRONT_PREVIEW.scope,
        ],
        root,
        "Preview settings pull",
      )
      assertStorefrontPreviewProjectLink(
        JSON.parse(
          readFileSync(path.join(stage, ".vercel/project.json"), "utf8"),
        ),
      )
      const previewEnvPath = path.join(stage, ".vercel/.env.preview.local")
      if (!existsSync(previewEnvPath))
        throw new Error("Pulled Preview environment is missing.")
      const previewEnv = readEnvironmentFile(previewEnvPath)
      if (previewEnv.APP_ENV !== "preview")
        throw new Error("Pulled Storefront environment is not Preview.")
      const deployed = vercelJson(
        [
          "deploy",
          stage,
          "--project",
          STOREFRONT_PREVIEW.projectId,
          "--target=preview",
          "--scope",
          STOREFRONT_PREVIEW.scope,
          "--yes",
          "--format=json",
        ],
        root,
        "Storefront Preview deployment",
      )
      const url = assertStorefrontPreviewUrl(
        deployed.url?.startsWith("https://")
          ? deployed.url
          : `https://${deployed.url ?? ""}`,
      )
      const id = verify(url, stage)
      run(
        "vercel",
        [
          "alias",
          "set",
          url,
          STOREFRONT_PREVIEW.alias,
          "--scope",
          STOREFRONT_PREVIEW.scope,
        ],
        stage,
        "Storefront Preview alias move",
      )
      assertStorefrontPreviewAlias(
        inspect(`https://${STOREFRONT_PREVIEW.alias}`, stage),
        id,
      )
      verify(`https://${STOREFRONT_PREVIEW.alias}`, stage)
      console.log(
        `Storefront Preview ${id} passed checks and serves the alias.`,
      )
    }
  } finally {
    // Vercel pull may write Preview credentials. Remove the stage on every exit.
    rmSync(stage, { recursive: true, force: true })
  }
}
