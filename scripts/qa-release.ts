import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { loadRootEnvironment } from "./environment-profile.mjs"
import {
  type SmokeReceipt,
  type SmokeSurface,
  git,
  readSmokeConfig,
  receiptDirectory,
  root,
  runSmoke,
  saveJson,
  smokeConfigHash,
  verificationDependencyHash,
} from "./qa-smoke"
import { runQuick } from "./test-quick"

type FastReceipt = {
  version: 1
  sha: string
  status: "passed"
  clean: true
  completedAt: string
  dependencyHash: string
}
const MAX_AGE = 24 * 60 * 60 * 1000
export function freshReceipt(time: string, now = Date.now()) {
  const age = now - Date.parse(time)
  return Number.isFinite(age) && age >= -60000 && age <= MAX_AGE
}
export function requiredSmokeSurfaces(components: string[]): SmokeSurface[] {
  const surfaces: SmokeSurface[] = []
  if (
    components.some((name) =>
      [
        "api",
        "dashboard",
        "marketing",
        "storefront",
        "jobs",
        "database",
      ].includes(name),
    )
  )
    surfaces.push("web")
  if (components.includes("mobile")) surfaces.push("android")
  return surfaces
}
export function validFastReceipt(
  raw: unknown,
  sha: string,
  now = Date.now(),
  dependencyHash?: string,
) {
  const receipt = raw as FastReceipt
  return (
    receipt?.version === 1 &&
    receipt.sha === sha &&
    receipt.status === "passed" &&
    receipt.clean === true &&
    (!dependencyHash || receipt.dependencyHash === dependencyHash) &&
    freshReceipt(receipt.completedAt, now)
  )
}
export function assertSmokeReceipt(
  raw: unknown,
  sha: string,
  surface: SmokeSurface,
  configHash: string,
  now = Date.now(),
) {
  const receipt = raw as SmokeReceipt
  if (
    receipt?.version !== 1 ||
    receipt.sha !== sha ||
    receipt.surface !== surface ||
    receipt.target !== "preview" ||
    receipt.status !== "passed" ||
    !receipt.clean ||
    !receipt.runtimeVerified ||
    !receipt.runtimeIds?.length ||
    receipt.configHash !== configHash ||
    !freshReceipt(receipt.completedAt, now)
  )
    throw new Error(
      `Production needs fresh, passed, candidate-bound Preview ${surface} smoke. Local, dirty, failed, stale or unverified runtime results cannot qualify.`,
    )
}
function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch {
    throw new Error(
      "Required candidate verification receipt is missing or invalid.",
    )
  }
}
export function prepareCandidate(repo = root) {
  const sha = git(repo, ["rev-parse", "HEAD"])
  const file = resolve(receiptDirectory(repo), `fast-${sha}.json`)
  const dependencyHash = verificationDependencyHash(repo)
  if (
    existsSync(file) &&
    validFastReceipt(readJson(file), sha, Date.now(), dependencyHash)
  ) {
    console.log(`Reusing fast source checks for ${sha.slice(0, 9)}.`)
    return 0
  }
  if (git(repo, ["status", "--porcelain"]))
    throw new Error(
      `Candidate checks require a clean checkout at ${sha.slice(0, 9)}. Commit the selected change or use an isolated worktree; unrelated work will not be tested or shipped.`,
    )
  // Root/shared changes deliberately select all bounded smoke groups. The receipt
  // is source smoke only; domain-specific acceptance remains separately required.
  const code = runQuick(
    { files: ["package.json"], plan: false, help: false },
    repo,
  )
  if (
    code !== 0 ||
    git(repo, ["rev-parse", "HEAD"]) !== sha ||
    git(repo, ["status", "--porcelain"]) ||
    verificationDependencyHash(repo) !== dependencyHash
  )
    throw new Error(
      "Candidate checks failed or source changed during verification.",
    )
  saveJson(file, {
    version: 1,
    sha,
    status: "passed",
    clean: true,
    completedAt: new Date().toISOString(),
    dependencyHash,
  } satisfies FastReceipt)
  return 0
}

export async function releaseVerified(args: string[], repo = root) {
  // Reuse the existing parser, component dependency graph and release executor.
  // No duplicate deployment logic and no changes to other toolkit consumers.
  const library = await import(
    resolve(repo, "../local-infra-kit/src/release-flow/release.ts")
  )
  const options = library.parseReleaseArgs(args)
  if (options.help) {
    console.log(
      `${library.RELEASE_USAGE}\nEwaTrade run: source receipt first; Production also requires matching Preview smoke. No verification is run by status/plan/env/mark.`,
    )
    return 0
  }
  if (options.command !== "run") return library.runRelease(repo, options)
  if (options.allowDirty)
    throw new Error(
      "Verified releases use committed candidates; --allow-dirty cannot qualify.",
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
  const sha = sourceGit.head()
  const environment = library.resolveEnvironment({
    branch: sourceGit.branch(),
    explicit: options.environment,
    productionBranch: config.productionBranch,
  }) as "preview" | "production"
  if (library.RELEASE_VERIFICATION_HOOK_VERSION !== 1)
    throw new Error(
      "Update the sibling local-infra-kit verification hook before releasing; checks cannot be silently skipped.",
    )
  let surfaces: SmokeSurface[] = []
  const directory = receiptDirectory(repo)
  const configFile = resolve(directory, "smoke-preview.json")
  // The executor invokes this after its existing clean-copy preparation. This
  // avoids testing other agents' dirty code or creating a second checkout flow.
  const verify = async (context: {
    root: string
    head: string
    config: unknown
    git: unknown
    environment: "preview" | "production"
  }) => {
    if (context.head !== sha || sourceGit.head() !== sha)
      throw new Error("Candidate moved before verification; nothing deployed.")
    prepareCandidate(context.root)
    const statuses = state.componentStatuses({
      config: context.config,
      git: context.git,
      environment: context.environment,
      head: sha,
      only: options.only,
    }) as { component: { name: string }; changed: boolean }[]
    surfaces = requiredSmokeSurfaces(
      statuses
        .filter((item) => item.changed)
        .map((item) => item.component.name)
        .filter((name) => name !== "mobile" || options.mobile !== "skip"),
    )
    if (surfaces.length) {
      const smokeConfig = readSmokeConfig(configFile, "preview")
      if (surfaces.includes("android") && !smokeConfig.android)
        throw new Error(
          "Configure the existing Preview Android app/device before rollout.",
        )
      if (context.environment === "production")
        for (const surface of surfaces)
          assertSmokeReceipt(
            readJson(
              resolve(directory, `smoke-${sha}-preview-${surface}.json`),
            ),
            sha,
            surface,
            smokeConfigHash(smokeConfig, repo),
          )
    }
    return true
  }
  // All deployment commands, clean-copy behavior, prompts, pushes, database
  // isolation and native/provider checks remain in the original executor.
  const code = await library.runRelease(repo, options, { verify })
  if (code !== 0) return code
  if (sourceGit.head() !== sha)
    throw new Error("Source moved during release; verification not accepted.")
  if (environment === "preview") {
    let failed = false
    for (const surface of surfaces) {
      const receipt = await runSmoke({
        repo,
        configFile,
        target: "preview",
        surface,
      })
      if (
        receipt.status !== "passed" ||
        !receipt.runtimeVerified ||
        !receipt.clean
      )
        failed = true
    }
    if (failed) {
      console.error(
        "Preview deployment finished, but smoke is incomplete. Do not redeploy to retry testing; correct the prerequisite and rerun qa:smoke for this candidate.",
      )
      return 1
    }
  } else if (surfaces.includes("web")) {
    // A deployment health check, not another full QA acceptance run.
    const production = loadRootEnvironment(repo, {
      DEV_PROFILE: "production",
    }).env
    const health = await import(
      resolve(repo, "scripts/production-api-readiness.mjs")
    )
    const host = health.validateProductionApiHostConfiguration(production)
    if (!host.origin)
      throw new Error(
        "Production rollout finished but health origin configuration is invalid; inspect the existing API host preflight.",
      )
    const response = await fetch(`${host.origin}/health`, {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    })
    if (response.status !== 200 || (await response.json()).status !== "ok")
      throw new Error(
        "Production rollout finished but health failed; investigate the rollout, do not automatically retry deployment.",
      )
    console.log(
      "Production API health passed. Observe the existing rollout/error monitoring.",
    )
  }
  return 0
}

if (import.meta.main) {
  try {
    const [command, ...args] = process.argv.slice(2)
    if (command === "candidate" && args.length === 0)
      process.exitCode = prepareCandidate()
    else if (command === "release")
      process.exitCode = await releaseVerified(args)
    else
      throw new Error(
        "Use bun run qa:candidate or bun run release [existing options].",
      )
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Candidate verification failed.",
    )
    process.exitCode = 1
  }
}
