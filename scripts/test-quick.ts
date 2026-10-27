import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

// Explicit, reviewed source-only smoke tests. Never discover/run arbitrary tests:
// many existing integration tests intentionally connect to databases/providers.
export const suites = {
  core: [
    "scripts/qa-workflow.test.ts",
    "scripts/qa-release.test.ts",
    "scripts/environment-profile.test.ts",
    "scripts/database-profile.test.ts",
  ],
  web: [
    "apps/dashboard/src/lib/inventory-quantity.test.ts",
    "apps/marketing/src/lib/signup-phone.test.ts",
    "apps/storefront/src/lib/service-display.test.ts",
    "apps/storefront/src/lib/service-request-selection.test.ts",
    "apps/storefront/src/lib/storefront-request-result.test.ts",
    "apps/dashboard/src/components/storefront/storefront-preview-navigation.test.ts",
    "packages/storefront-contracts/src/resources.test.ts",
    "packages/storefront-runtime/src/links.test.ts",
    "packages/storefront-runtime/src/share.test.ts",
    "packages/storefront-templates/src/shared/enquiry-selection.test.ts",
    "packages/storefront-templates/src/shared/detail-history.test.ts",
  ],
  mobile: [
    "apps/mobile/src/lib/qa-runtime-identity.test.ts",
    "apps/mobile/src/lib/quantity.test.ts",
    "apps/mobile/src/lib/background-query-policy.test.ts",
    "apps/mobile/scripts/prepare-android-dev.test.ts",
  ],
  domain: [
    "packages/utils/src/finance-money.test.ts",
    "packages/utils/src/currency.test.ts",
    "packages/errors/src/error-system.test.ts",
    "packages/service-commerce/src/contracts.test.ts",
    "packages/jobs/src/schedule-policy.test.ts",
    "apps/api/src/health-routes.test.ts",
    "packages/db/src/queries/public-storefront-listing.test.ts",
  ],
}
type Suite = keyof typeof suites
export type QuickOptions = {
  base?: string
  files?: string[]
  plan: boolean
  help: boolean
}
export const usage = `Usage: bun run test:quick [--base GIT_REF | --files PATH ...] [--plan]
Default: staged + unstaged + untracked files against HEAD.
--base checks the merge-base..HEAD plus current local changes; no fetch is run.
--plan prints the selected smoke tests without running checks.
Unsupported source areas fail visibly; extend the explicit mapping after review.
This fast source suite does not replace feature-specific types, integration or UI acceptance.`

export function parseQuickArgs(args: string[]): QuickOptions {
  const options: QuickOptions = { plan: false, help: false }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--plan") options.plan = true
    else if (arg === "--help" || arg === "-h") options.help = true
    else if (arg === "--base") {
      options.base = args[++i]
      if (!options.base || options.base.startsWith("-"))
        throw new Error("--base needs a Git ref")
    } else if (arg === "--files") {
      options.files = []
      while (args[i + 1] && !args[i + 1].startsWith("--"))
        options.files.push(args[++i])
      if (!options.files.length)
        throw new Error("--files needs at least one repository-relative path")
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  if (options.base && options.files)
    throw new Error("Use --base or --files, not both")
  return options
}

export function normalizeQuickPaths(files: string[]) {
  return [
    ...new Set(
      files.map((file) => {
        if (
          !file ||
          file.startsWith("/") ||
          file.startsWith("-") ||
          file.includes("\\") ||
          file.split("/").includes("..") ||
          /[\0\r\n]/.test(file)
        )
          throw new Error(
            "Expected repository-relative file paths without traversal or control characters",
          )
        return file.replace(/^\.\//, "")
      }),
    ),
  ].sort()
}

export function selectQuickPlan(files: string[]) {
  const paths = normalizeQuickPaths(files)
  const groups = new Set<Suite>(["core"])
  const unknown: string[] = []
  for (const file of paths) {
    if (file.endsWith(".md") || /^(\.brain|docs|artifacts)\//.test(file))
      continue
    if (
      [
        "package.json",
        "bun.lock",
        "bun.lockb",
        "turbo.json",
        "biome.json",
        "qa.smoke.example.json",
      ].includes(file) ||
      /^(release\.config\.|tooling\/)/.test(file) ||
      /^(apps|packages)\/[^/]+\/package\.json$/.test(file)
    ) {
      for (const group of Object.keys(suites) as Suite[]) groups.add(group)
    } else if (
      /^scripts\//.test(file) ||
      file === ".github/workflows/fast-checks.yml" ||
      file === ".maestro/smoke.yaml"
    )
      groups.add("core")
    else if (/^apps\/(dashboard|marketing|storefront)\//.test(file)) {
      groups.add("web")
      groups.add("domain")
    } else if (/^apps\/mobile\//.test(file)) {
      groups.add("mobile")
      groups.add("domain")
    } else if (
      /^(apps\/api|packages\/(db|assistant|utils|payments|catalog|errors|jobs|service-commerce|storefront-runtime|storefront-contracts|storefront-templates))\//.test(
        file,
      )
    ) {
      groups.add("domain")
      // Shared contracts can affect every client; broaden the bounded smoke set.
      groups.add("web")
      groups.add("mobile")
    } else unknown.push(file)
  }
  return {
    paths,
    groups: [...groups],
    tests: [...new Set([...groups].flatMap((group) => suites[group]))],
    unknown,
  }
}

export function readQuickChanges(root: string, base?: string) {
  function git(args: string[]) {
    const result = spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
    })
    if (result.status !== 0)
      throw new Error(
        "Cannot determine changed files. Verify the base ref exists locally; no checks were skipped.",
      )
    return result.stdout
  }
  const changed = git([
    "diff",
    "--name-only",
    "--no-renames",
    "-z",
    "HEAD",
    "--",
  ])
    .split("\0")
    .filter(Boolean)
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
  if (base) {
    const commit = git(["rev-parse", "--verify", `${base}^{commit}`]).trim()
    const ancestor = git(["merge-base", commit, "HEAD"]).trim()
    changed.push(
      ...git([
        "diff",
        "--name-only",
        "--no-renames",
        "-z",
        ancestor,
        "HEAD",
        "--",
      ])
        .split("\0")
        .filter(Boolean),
    )
  }
  return normalizeQuickPaths([...changed, ...untracked])
}

export function quickEnvironment(seed: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Do not forward developer credentials, opt-in RUN_* flags, or profile files.
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    EWATRADE_DATABASE_URL: "postgresql://unit-only@127.0.0.1:1/unused",
  }
  for (const key of [
    "PATH",
    "HOME",
    "USER",
    "TMPDIR",
    "TEMP",
    "SYSTEMROOT",
    "CI",
    "TERM",
  ])
    if (seed[key]) env[key] = seed[key]
  return env
}

export function runQuick(
  options: QuickOptions,
  root = resolve(import.meta.dir, ".."),
) {
  if (options.help) {
    console.log(usage)
    return 0
  }
  const plan = selectQuickPlan(
    options.files || readQuickChanges(root, options.base),
  )
  console.log(
    JSON.stringify(
      {
        ...plan,
        scope:
          "source smoke only; feature-specific verification remains required",
      },
      null,
      2,
    ),
  )
  if (plan.unknown.length) {
    console.error(
      "Unmapped changes need a reviewed test mapping; not reporting green.",
    )
    return 2
  }
  for (const test of plan.tests)
    if (!existsSync(resolve(root, test)))
      throw new Error(`Configured test is missing: ${test}`)
  if (options.plan) return 0
  const env = quickEnvironment(process.env)
  function run(label: string, command: string, args: string[]) {
    const started = Date.now()
    console.log(`\n${label}`)
    const result = spawnSync(command, args, {
      cwd: root,
      env,
      stdio: "inherit",
      timeout: 180000,
    })
    console.log(`${label}: ${((Date.now() - started) / 1000).toFixed(1)}s`)
    if (result.error || result.status !== 0)
      throw new Error(`${label} failed or timed out; inspect the output above.`)
  }
  run("QA tooling types", process.execPath, [
    "--env-file=/dev/null",
    "node_modules/typescript/bin/tsc",
    "--project",
    "scripts/tsconfig.qa.json",
  ])
  const lintFiles = plan.paths.filter(
    (file) =>
      /\.(ts|tsx|js|mjs|cjs|json|jsonc)$/.test(file) &&
      !/^(\.brain|artifacts)\//.test(file) &&
      existsSync(resolve(root, file)),
  )
  if (lintFiles.length)
    run("Changed-file Biome", resolve(root, "node_modules/.bin/biome"), [
      "check",
      "--files-ignore-unknown=true",
      "--no-errors-on-unmatched",
      "--",
      ...lintFiles,
    ])
  run("Focused source tests", process.execPath, [
    "--env-file=/dev/null",
    "test",
    ...plan.tests.map((file) => `./${file}`),
  ])
  console.log(
    "Fast checks passed. Existing assistant gates and change-specific acceptance remain separate.",
  )
  return 0
}

if (import.meta.main) {
  try {
    process.exitCode = runQuick(parseQuickArgs(process.argv.slice(2)))
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Quick checks failed.",
    )
    process.exitCode = 1
  }
}
