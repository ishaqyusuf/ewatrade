import { spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { assertOwnedVercelDeployment } from "./release-vercel-deployment-output.mjs"

export type SmokeTarget = "local" | "preview"
export type SmokeSurface = "web" | "android"
export type SmokeConfig = {
  qaDomain: string
  web: {
    origin: string
    profileLabel: string
    catalogItem: string
    expectedTotal: string
  }
  android?: {
    device: string
    appId: string
    profileLabel: string
    catalogItem: string
    offeringLabel: string
    expectedTotal: string
    buildId?: string
    updateGroupId?: string
  }
}
export type SmokeReceipt = {
  version: 1
  id: string
  sha: string
  target: SmokeTarget
  surface: SmokeSurface
  status: "passed" | "failed"
  clean: boolean
  configHash: string
  startedAt: string
  completedAt: string
  runtimeVerified: boolean
  runtimeIds?: string[]
  checks: string[]
  failure?: string
}
export const root = resolve(import.meta.dir, "..")
export function git(root: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  })
  if (result.status !== 0) throw new Error("Git source inspection failed.")
  return result.stdout.trim()
}
export function receiptDirectory(repo: string) {
  // Worktrees and the existing release tool's clean copy share receipts without
  // adding them to Git or copying them into uploaded app artifacts.
  return resolve(
    dirname(resolve(repo, git(repo, ["rev-parse", "--git-common-dir"]))),
    ".scratch/qa-release",
  )
}
function runBrowserTool(action: "install" | "driver", repo = root) {
  const result = spawnSync(
    action === "driver" ? "node" : process.execPath,
    action === "install"
      ? [
          "--env-file=/dev/null",
          "node_modules/playwright/cli.js",
          "install",
          "chromium",
        ]
      : ["--test", "scripts/qa-smoke.browser.test.mjs"],
    {
      cwd: repo,
      stdio: "inherit",
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: resolve(receiptDirectory(repo), "playwright"),
      },
      timeout: 300000,
    },
  )
  return result.status === 0 ? 0 : 1
}
export function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}
export function verificationDependencyHash(repo: string) {
  return digest(
    [
      "release",
      "config",
      "git",
      "state",
      "workspace",
      "vercel",
      "expo",
      "provider-cli",
    ].map((name) =>
      readFileSync(
        resolve(repo, `../local-infra-kit/src/release-flow/${name}.ts`),
        "utf8",
      ),
    ),
  )
}
export function smokeConfigHash(config: SmokeConfig, repo: string) {
  return digest({ config, dependencies: verificationDependencyHash(repo) })
}
export function saveJson(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}
export function smokeToolingClean(repo: string) {
  const files = [
    "scripts/qa-smoke.ts",
    "scripts/qa-web-smoke.mjs",
    "scripts/qa-release.ts",
    ".maestro/smoke.yaml",
  ]
  return (
    files.every((file) => git(repo, ["ls-files", "--", file]) === file) &&
    !git(repo, ["diff", "HEAD", "--", ...files])
  )
}
export function readSmokeConfig(
  file: string,
  target: SmokeTarget,
): SmokeConfig {
  const raw = JSON.parse(readFileSync(file, "utf8")) as SmokeConfig
  if (
    !raw ||
    typeof raw.qaDomain !== "string" ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw.qaDomain)
  )
    throw new Error(
      "Configure an existing QA domain; no business is created automatically.",
    )
  const origin =
    target === "local"
      ? "https://ewatrade-dashboard.localhost"
      : "https://preview-dashboard.ewatrade.com"
  if (raw.web?.origin !== origin)
    throw new Error(
      `Smoke target must be the canonical ${target} dashboard origin.`,
    )
  for (const key of ["profileLabel", "catalogItem", "expectedTotal"] as const)
    if (!raw.web[key]?.trim())
      throw new Error(`Configure web.${key} for an existing QA business.`)
  if (raw.android) {
    const appId =
      target === "local" ? "com.ewatrade.dev" : "com.ewatrade.preview"
    if (raw.android.appId !== appId || !raw.android.device?.trim())
      throw new Error(
        "Select an explicit non-production Android app and device.",
      )
    for (const key of [
      "profileLabel",
      "catalogItem",
      "offeringLabel",
      "expectedTotal",
    ] as const)
      if (!raw.android[key]?.trim())
        throw new Error(`Configure android.${key}.`)
  }
  return raw
}

export function inspectPreviewDeployment(
  raw: unknown,
  expected: { sha: string; projectId: string; teamId: string },
) {
  const value = raw as {
    id?: string
    url?: string
    projectId?: string
    ownerId?: string
    readyState?: string
    gitSource?: { sha?: string }
  }
  if (!value?.id || !value.url || value.gitSource?.sha !== expected.sha)
    throw new Error(
      "Preview deployment identity/source is not the selected candidate.",
    )
  assertOwnedVercelDeployment(raw, {
    id: value.id,
    url: value.url,
    projectId: expected.projectId,
    teamId: expected.teamId,
    environment: "preview",
  })
  return value.id
}

async function verifyPreviewWeb(repo: string, sha: string) {
  const library = await import(
    resolve(repo, "../local-infra-kit/src/release-flow/vercel.ts")
  )
  const configuration = await import(
    resolve(repo, "../local-infra-kit/src/release-flow/config.ts")
  )
  const state = await import(
    resolve(repo, "../local-infra-kit/src/release-flow/state.ts")
  )
  const source = await import(
    resolve(repo, "../local-infra-kit/src/release-flow/git.ts")
  )
  const config = await configuration.loadReleaseConfig(repo)
  const sourceGit = source.createGit(repo)
  const dashboard = config.components.find(
    (item: { name: string }) => item.name === "dashboard",
  )
  const api = library.createVercelCliApi(repo)
  const team = dashboard.vercel.team
  const ids: string[] = []
  for (const [host, project] of [
    ["preview-dashboard.ewatrade.com", "ewatrade-dashboard"],
    ["preview-api.ewatrade.com", "ewatrade-api"],
  ]) {
    const owned = await library.resolveVercelProject(api, team, project)
    const raw = await api(
      `/v13/deployments/${host}?teamId=${encodeURIComponent(team)}`,
    )
    const deployedSha = (raw as { gitSource?: { sha?: string } }).gitSource?.sha
    const component = config.components.find(
      (item: { name: string }) => project === `ewatrade-${item.name}`,
    )
    if (
      !component ||
      !deployedSha ||
      !/^[a-f0-9]{40}$/i.test(deployedSha) ||
      !sourceGit.resolveCommit(deployedSha)
    )
      throw new Error(
        "Preview component source cannot be verified from local Git history.",
      )
    const pathspecs = state.componentPathspecs(
      config,
      component,
      state.componentSourceDirs(repo, component),
    )
    assertEquivalentComponentSource(
      deployedSha,
      sha,
      sourceGit.changedFiles(deployedSha, sha, pathspecs),
    )
    ids.push(
      inspectPreviewDeployment(raw, {
        sha: deployedSha,
        projectId: owned.id,
        teamId: team,
      }),
    )
  }
  return ids
}

export function assertEquivalentComponentSource(
  deployedSha: string,
  candidateSha: string,
  changedFiles: string[],
) {
  if (deployedSha !== candidateSha && changedFiles.length)
    throw new Error(
      "Preview component source differs from the selected candidate.",
    )
}

export function verifyAndroidBuild(
  raw: unknown,
  sha: string,
  buildId: string,
  installedVersion: string,
  embedded = true,
) {
  const value = raw as {
    id?: string
    status?: string
    platform?: string
    appBuildVersion?: string
    gitCommitHash?: string
    channel?: string
    projectId?: string
  }
  if (
    value.id !== buildId ||
    value.status !== "FINISHED" ||
    value.platform !== "ANDROID" ||
    value.channel !== "preview" ||
    value.projectId !== "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b" ||
    (embedded && value.gitCommitHash !== sha) ||
    value.appBuildVersion !== installedVersion
  )
    throw new Error(
      "Installed Android build is not the inspected Preview candidate.",
    )
}

export function verifyAndroidUpdate(raw: unknown, sha: string, group: string) {
  const updates = raw as {
    id?: string
    platform?: string
    group?: string
    branch?: string
    gitCommitHash?: string
    manifestPermalink?: string
    isRollBackToEmbedded?: boolean
  }[]
  if (!Array.isArray(updates))
    throw new Error("EAS update inspection returned no update list.")
  const android = updates.filter((item) => item.platform === "android")
  if (android.length !== 1)
    throw new Error("Expected exactly one Android update.")
  const item = android[0]
  const manifest = new URL(item.manifestPermalink || "invalid:")
  if (
    !item.id ||
    item.group !== group ||
    item.branch !== "preview" ||
    item.gitCommitHash !== sha ||
    item.isRollBackToEmbedded ||
    manifest.hostname !== "u.expo.dev" ||
    !manifest.pathname.includes("532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b")
  )
    throw new Error(
      "Android OTA update does not match the selected Preview candidate/project.",
    )
  return item.id
}
export function assertMaestroReport(report: string) {
  if (
    !/<testcase\b/.test(report) ||
    /<(failure|error|skipped)\b/.test(report) ||
    /\b(failures|errors|skipped)=["'][1-9]/.test(report)
  )
    throw new Error("Maestro did not report a complete passing flow.")
}

async function androidJourney(
  repo: string,
  config: SmokeConfig,
  target: SmokeTarget,
  sha: string,
  artifacts: string,
) {
  if (!config.android)
    throw new Error("Android smoke configuration is missing.")
  const value = config.android
  const adb =
    process.env.ANDROID_ADB_PATH ||
    resolve(
      process.env.ANDROID_HOME ||
        resolve(process.env.HOME || "", "Library/Android/sdk"),
      "platform-tools/adb",
    )
  const installed = spawnSync(
    adb,
    ["-s", value.device, "shell", "dumpsys", "package", value.appId],
    { encoding: "utf8", timeout: 15000 },
  )
  const version = installed.stdout?.match(/versionCode=(\d+)/)?.[1]
  if (installed.status !== 0 || !version)
    throw new Error(
      "The selected Android app/device is not available; no installation is performed.",
    )
  let runtimeVerified = false
  const runtimeIds: string[] = []
  let expectedRuntime = "QA runtime development"
  if (target === "preview" && !value.buildId)
    throw new Error(
      "Preview Android smoke needs the exact inspected EAS build ID.",
    )
  if (target === "preview" && value.buildId) {
    const read = spawnSync(
      process.execPath,
      [
        "--env-file=/dev/null",
        "scripts/eas-account-runner.ts",
        "view",
        "--preview",
        "--id",
        value.buildId,
      ],
      { cwd: repo, encoding: "utf8", timeout: 120000 },
    )
    const jsonLine = read.stdout
      ?.split("\n")
      .reverse()
      .find((line) => line.startsWith("{"))
    if (read.status !== 0 || !jsonLine)
      throw new Error("Read-only EAS build inspection failed.")
    verifyAndroidBuild(
      JSON.parse(jsonLine),
      sha,
      value.buildId,
      version,
      !value.updateGroupId,
    )
    let updateId = "embedded"
    if (value.updateGroupId) {
      const readUpdate = spawnSync(
        "eas",
        ["update:view", value.updateGroupId, "--json"],
        {
          cwd: resolve(repo, "apps/mobile"),
          encoding: "utf8",
          timeout: 120000,
        },
      )
      if (readUpdate.status !== 0)
        throw new Error(
          "Read-only EAS update inspection failed; use the correct existing EAS account.",
        )
      updateId = verifyAndroidUpdate(
        JSON.parse(readUpdate.stdout),
        sha,
        value.updateGroupId,
      )
    }
    expectedRuntime = `QA runtime ${updateId} · build ${version}`
    runtimeIds.push(value.buildId, updateId)
    runtimeVerified = true
  }
  const escapeRegex = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const args = [
    "--device",
    value.device,
    "test",
    "--format",
    "junit",
    "--output",
    resolve(artifacts, "report.xml"),
    "--test-output-dir",
    artifacts,
  ]
  for (const [name, entry] of Object.entries({
    APP_ID: value.appId,
    APP_SCHEME: target === "local" ? "ewatrade-dev" : "ewatrade-preview",
    QA_DOMAIN: config.qaDomain,
    PROFILE_LABEL: escapeRegex(value.profileLabel),
    CATALOG_ITEM: escapeRegex(value.catalogItem),
    OFFERING_LABEL: escapeRegex(value.offeringLabel),
    EXPECTED_TOTAL: escapeRegex(value.expectedTotal),
    EXPECTED_RUNTIME: escapeRegex(expectedRuntime),
  }))
    args.push("-e", `${name}=${entry}`)
  args.push(".maestro/smoke.yaml")
  const result = spawnSync(process.env.MAESTRO_BIN || "maestro", args, {
    cwd: repo,
    stdio: "inherit",
    timeout: 180000,
  })
  if (
    result.error ||
    result.status !== 0 ||
    !existsSync(resolve(artifacts, "report.xml"))
  )
    throw new Error(
      "Maestro did not complete successfully; install Maestro and connect the explicit QA device.",
    )
  assertMaestroReport(readFileSync(resolve(artifacts, "report.xml"), "utf8"))
  return {
    runtimeVerified,
    runtimeIds,
    checks: [
      "QA business session",
      "populated catalog",
      "sale draft through checkout",
      "cancel without confirming",
    ],
  }
}

export async function runSmoke(input: {
  repo?: string
  configFile: string
  target: SmokeTarget
  surface: SmokeSurface
}) {
  const repo = input.repo || root
  const config = readSmokeConfig(input.configFile, input.target)
  const sha = git(repo, ["rev-parse", "HEAD"])
  const before =
    input.target === "preview"
      ? String(smokeToolingClean(repo))
      : git(repo, ["status", "--porcelain"])
  const directory = receiptDirectory(repo)
  const artifacts = resolve(directory, "artifacts", randomUUID())
  mkdirSync(artifacts, { recursive: true })
  const receipt: SmokeReceipt = {
    version: 1,
    id: randomUUID(),
    sha,
    target: input.target,
    surface: input.surface,
    status: "failed",
    clean: input.target === "preview" ? before === "true" : !before,
    configHash: smokeConfigHash(config, repo),
    startedAt: new Date().toISOString(),
    completedAt: "",
    runtimeVerified: false,
    checks: [],
  }
  try {
    if (input.surface === "web") {
      if (input.target === "preview") {
        receipt.runtimeIds = await verifyPreviewWeb(repo, sha)
        receipt.runtimeVerified = true
      }
      const result = spawnSync(
        "node",
        ["scripts/qa-web-smoke.mjs", resolve(input.configFile), artifacts],
        {
          cwd: repo,
          encoding: "utf8",
          timeout: 120000,
          env: {
            ...process.env,
            PLAYWRIGHT_BROWSERS_PATH:
              process.env.PLAYWRIGHT_BROWSERS_PATH ||
              resolve(directory, "playwright"),
          },
        },
      )
      if (result.error || result.status !== 0)
        throw new Error(
          "Web smoke failed; inspect the private artifact directory and configured QA account/item.",
        )
      receipt.checks = JSON.parse(result.stdout).checks
      if (
        input.target === "preview" &&
        digest(await verifyPreviewWeb(repo, sha)) !== digest(receipt.runtimeIds)
      )
        throw new Error(
          "Preview deployment changed during smoke; result not accepted.",
        )
    } else
      Object.assign(
        receipt,
        await androidJourney(repo, config, input.target, sha, artifacts),
      )
    const after =
      input.target === "preview"
        ? String(smokeToolingClean(repo))
        : git(repo, ["status", "--porcelain"])
    if (git(repo, ["rev-parse", "HEAD"]) !== sha || after !== before)
      throw new Error("Source changed during smoke; result cannot be reused.")
    receipt.status = "passed"
  } catch (error) {
    receipt.failure = error instanceof Error ? error.message : "Smoke failed."
  }
  receipt.completedAt = new Date().toISOString()
  const file = resolve(
    directory,
    `smoke-${sha}-${input.target}-${input.surface}.json`,
  )
  saveJson(file, receipt)
  console.log(
    `${receipt.surface}: ${receipt.status}; runtime ${receipt.runtimeVerified ? "verified" : "unverified"}; receipt ${file}`,
  )
  if (receipt.failure) console.error(receipt.failure)
  return receipt
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2)
    if (args.length === 1 && args[0] === "install-browser")
      process.exitCode = runBrowserTool("install")
    else if (args.length === 1 && args[0] === "driver")
      process.exitCode = runBrowserTool("driver")
    else if (args.includes("--help"))
      console.log(
        "Usage: bun run qa:smoke --target local|preview --surface web|android --config PATH. Existing QA data only; sale drafts are canceled, never submitted.",
      )
    else {
      const value = (name: string) => args[args.indexOf(name) + 1]
      if (
        args.length !== 6 ||
        !args.includes("--target") ||
        !args.includes("--surface") ||
        !args.includes("--config")
      )
        throw new Error(
          "Specify exactly --target, --surface and --config (see --help).",
        )
      const target = value("--target")
      const surface = value("--surface")
      if (
        !["local", "preview"].includes(target) ||
        !["web", "android"].includes(surface)
      )
        throw new Error("Smoke supports local/preview and web/android only.")
      process.exitCode =
        (
          await runSmoke({
            configFile: value("--config"),
            target: target as SmokeTarget,
            surface: surface as SmokeSurface,
          })
        ).status === "passed"
          ? 0
          : 1
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Smoke failed.")
    process.exitCode = 1
  }
}
