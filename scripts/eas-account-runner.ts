import { createHash } from "node:crypto"
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { isReviewedIosPreviewSimulatorArtifact } from "./eas-ios-simulator-artifact"

type Operation =
  | "auth"
  | "build"
  | "submit"
  | "update"
  | "view"
  | "download"
  | "env-check"
  | "env-sync"
  | "env-chat-sync"
  | "env-legal-sync"
  | "env-analytics-sync"
type Target = "dev" | "preview" | "prod"
type BuildPlatform = "android" | "ios"
type UpdatePlatform = BuildPlatform | "all"
type Action =
  | "build:dev"
  | "build:preview"
  | "build:prod"
  | "submit:prod"
  | "update:preview"
  | "update:prod"
  | "view:dev"
  | "view:preview"
  | "view:prod"
  | "download:dev"
  | "download:preview"
  | "download:prod"
  | "env-check:prod"
  | "env-sync:prod"
  | "env-chat-sync:prod"
  | "env-legal-sync:prod"
  | "env-analytics-sync:prod"
type EasAccount = {
  label: string
  login: string
  password: string
  username: string | null
}

const REPO_DIR = path.join(import.meta.dir, "..")
const APP_DIR = path.join(REPO_DIR, "apps", "mobile")

const TARGET_PROFILES: Record<Target, string> = {
  dev: "development",
  preview: "preview",
  prod: "production",
}
const TARGET_ENV_FILES: Record<Target, string> = {
  dev: ".env.dev",
  preview: ".env.preview",
  prod: ".env.production",
}

const operation = process.argv[2] as Operation | undefined
const actionArgs = process.argv.slice(3)

if (
  !operation ||
  ![
    "auth",
    "build",
    "submit",
    "update",
    "view",
    "download",
    "env-check",
    "env-sync",
    "env-chat-sync",
    "env-legal-sync",
    "env-analytics-sync",
  ].includes(operation)
) {
  console.error(getUsage())
  process.exit(1)
}

if (operation === "auth") {
  await authenticateSharedSession(actionArgs)
  process.exit(0)
}

const target = resolveTarget(operation, actionArgs)
const buildPlatform = resolveBuildPlatform(operation, actionArgs)
const iosSimulator = actionArgs.includes("--ios-simulator")
if (
  iosSimulator &&
  (actionArgs.filter((arg) => arg === "--ios-simulator").length !== 1 ||
    target !== "preview" ||
    !(
      (operation === "build" && buildPlatform === "ios") ||
      operation === "download"
    ))
)
  throw new Error(
    "--ios-simulator is available only for an iOS Preview build or download.",
  )
const expectedSimulatorArtifactCommit =
  operation === "download" && iosSimulator
    ? assertExpectedUpdateCommit(actionArgs, "Simulator download")
    : undefined
// Production updates (and any update given --expected-commit) publish only clean
// committed HEAD. Preview without a commit stays a quick working-tree OTA.
const reviewedUpdate =
  operation === "update" &&
  (target === "prod" ||
    actionArgs.includes("--release-checks") ||
    actionArgs.some(
      (arg) =>
        arg === "--expected-commit" || arg.startsWith("--expected-commit="),
    ))
const expectedUpdateCommit = reviewedUpdate
  ? assertExpectedUpdateCommit(actionArgs)
  : undefined
if (operation === "update") {
  for (const arg of getForwardedArgs(actionArgs)) {
    if (/^--(channel|branch|environment|runtime-version)(=|$)/.test(arg)) {
      throw new Error(
        "EAS update target and runtime overrides are disabled; use --preview or --prod.",
      )
    }
  }
  if (!reviewedUpdate)
    console.log(
      "Quick Preview OTA: publishing working-tree code (pass --expected-commit to pin a clean commit).",
    )
}
const expectedNativeBuildCommit =
  operation === "build" && target !== "dev"
    ? assertExpectedUpdateCommit(actionArgs, "hosted build")
    : undefined
if (expectedNativeBuildCommit)
  assertHostedBuildArguments(getForwardedArgs(actionArgs))
const exactBuildId =
  operation === "submit" || operation === "view" || operation === "download"
    ? assertExactSubmissionBuildId(actionArgs)
    : undefined
const expectedSubmissionVersion =
  operation === "submit"
    ? assertExpectedSubmissionVersion(actionArgs)
    : undefined
const expectedSubmissionCommit =
  operation === "submit"
    ? assertExpectedSubmissionCommit(actionArgs)
    : undefined
const action = `${operation}:${target}` as Action
const profileEnvFile = TARGET_ENV_FILES[target]
const env = await loadEnvFiles({ ...Bun.env }, [
  path.join(REPO_DIR, ".env"),
  path.join(REPO_DIR, profileEnvFile),
  path.join(APP_DIR, ".env"),
  path.join(APP_DIR, profileEnvFile),
])
env.APP_VARIANT = TARGET_PROFILES[target]
env.EXPO_PUBLIC_APP_VARIANT = TARGET_PROFILES[target]
env.APP_ENV = target === "prod" ? "production" : target
env.DEV_PROFILE = target === "prod" ? "prod" : env.APP_ENV
env.EXPO_TOKEN = undefined

if (target === "preview" && ["build", "update"].includes(operation)) {
  await assertPreviewMobileTarget(env)
}

if (
  operation === "submit" ||
  ((operation === "build" || operation === "update") && target === "prod")
) {
  const checks: Array<[string, string]> = [
    ["teen audience", "scripts/check-teen-release-readiness.mjs"],
    ["production API", "apps/mobile/scripts/check-production-api-live.mjs"],
    ["public legal publication", "scripts/check-production-legal-live.mjs"],
  ]
  if (operation === "submit") {
    checks.push(["store billing", "scripts/check-store-billing-readiness.mjs"])
  }
  if (
    buildPlatform === "ios" ||
    (operation === "update" && buildPlatform === "all")
  ) {
    checks.push(["iOS login", "scripts/check-ios-login-readiness.mjs"])
    checks.push([
      "iOS organization app identity",
      "scripts/check-production-ios-identity.mjs",
    ])
  }
  for (const [label, script] of checks) {
    const code = await runCommand(["bun", script], {
      cwd: REPO_DIR,
      env,
      stdio: "inherit",
    })
    if (code !== 0) {
      console.error(`EAS ${operation} stopped: ${label} preflight failed.`)
      process.exit(1)
    }
  }
}

if (reviewedUpdate) {
  try {
    await assertUpdatePublishReady()
  } catch (error) {
    reportUpdatePreflightFailure(error)
  }
}

if (expectedNativeBuildCommit) {
  try {
    await assertNativeBuildReady()
  } catch (error) {
    reportNativeBuildPreflightFailure(error)
  }
}

if (operation === "env-sync") {
  const code = await runCommand(
    ["bun", "apps/mobile/scripts/check-production-api-live.mjs"],
    { cwd: REPO_DIR, env, stdio: "inherit" },
  )
  if (code !== 0) {
    console.error(
      "EAS Production API origin sync stopped: live preflight failed.",
    )
    process.exit(1)
  }
}

const account = resolveAccount(action, env, actionArgs)
const forwardedArgs = getForwardedArgs(actionArgs)
const publishPreviewBuild =
  operation === "build" && target === "preview" && buildPlatform === "android"
const previewPublisher = publishPreviewBuild
  ? await import("./release-app-update")
  : null
if (previewPublisher)
  await previewPublisher.assertPreviewPublisherReady(REPO_DIR, forwardedArgs)

const isolatedHome = await mkdtemp(path.join(tmpdir(), "ewatrade-eas-"))
let exitCode = 1

try {
  // EAS reads $HOME/.expo/state.json. Never replace another app's session.
  env.HOME = isolatedHome
  env.EXPO_LOCAL = undefined
  env.EXPO_STAGING = undefined
  const session = await loginWithEmailAndPassword(
    account.login,
    account.password,
  )
  await writeExpoSession(isolatedHome, session)
  console.log(`Authenticated isolated EAS session as ${session.username}.`)

  let attachmentReady = true
  const attachmentEnvironment =
    operation === "env-check" || operation === "submit"
      ? "production"
      : (operation === "build" || operation === "update") && target !== "dev"
        ? target === "prod"
          ? "production"
          : "preview"
        : null
  if (attachmentEnvironment) {
    const attachmentCode = await runCommand(
      ["bun", "apps/mobile/scripts/check-expo-env-attachment.mjs"],
      {
        cwd: REPO_DIR,
        env: {
          ...env,
          EXPO_ENV_ATTACHMENT_ONLY: attachmentEnvironment,
          EXPO_ENV_VERIFY_LIVE: "1",
        },
        stdio: "inherit",
      },
    )
    if (attachmentCode !== 0) {
      console.error(
        `Expo ${attachmentEnvironment} environment verification failed.`,
      )
      attachmentReady = false
    }
  }

  const submissionBuildReady =
    attachmentReady &&
    (operation !== "submit" ||
      (await inspectSubmissionBuild({
        buildId: exactBuildId ?? "",
        expectedCommit: expectedSubmissionCommit ?? "",
        expectedVersion: expectedSubmissionVersion ?? "",
        platform: buildPlatform as BuildPlatform,
        env,
      })))
  let mobilePublishReady = true
  if (reviewedUpdate && attachmentReady) {
    try {
      await assertUpdatePublishReady()
    } catch (error) {
      reportUpdatePreflightFailure(error)
      mobilePublishReady = false
    }
  }
  if (expectedNativeBuildCommit && attachmentReady) {
    try {
      await assertNativeBuildReady()
    } catch (error) {
      reportNativeBuildPreflightFailure(error)
    }
  }
  exitCode =
    !submissionBuildReady || !mobilePublishReady
      ? 1
      : operation === "env-check"
        ? 0
        : operation === "env-sync"
          ? await syncProductionApiOrigin(env)
          : operation === "env-chat-sync"
            ? await syncProductionChatOrigin(env)
            : operation === "env-legal-sync"
              ? await syncProductionLegalOrigin(env)
              : operation === "env-analytics-sync"
                ? await syncProductionAnalyticsFlag(env)
                : operation === "download"
                  ? await downloadBuild(
                      ["eas", "build:view", exactBuildId ?? "", "--json"],
                      exactBuildId ?? "",
                      actionArgs,
                      { cwd: APP_DIR, env },
                    )
                  : operation === "view"
                    ? await viewBuild(
                        ["eas", "build:view", exactBuildId ?? "", "--json"],
                        {
                          cwd: APP_DIR,
                          env,
                        },
                      )
                    : previewPublisher && expectedNativeBuildCommit
                      ? await previewPublisher.runPreviewBuildAndPublish({
                          command: [
                            ...getActionCommand(
                              operation,
                              target,
                              buildPlatform,
                              expectedUpdateCommit,
                            ),
                            ...forwardedArgs,
                          ],
                          root: REPO_DIR,
                          expectedCommit: expectedNativeBuildCommit,
                          runJson: async (cmd) => {
                            const proc = Bun.spawn({
                              cmd,
                              cwd: APP_DIR,
                              env,
                              stdin: "inherit",
                              stdout: "pipe",
                              stderr: "inherit",
                            })
                            const [output, code] = await Promise.all([
                              new Response(proc.stdout).text(),
                              proc.exited,
                            ])
                            return { output, code }
                          },
                        })
                      : await runCommand(
                          [
                            ...getActionCommand(
                              operation,
                              target,
                              buildPlatform,
                              expectedUpdateCommit,
                            ),
                            ...forwardedArgs,
                          ],
                          { cwd: APP_DIR, env, stdio: "inherit" },
                        )
} finally {
  await rm(isolatedHome, { recursive: true, force: true })
}

process.exitCode = exitCode

function resolveAccount(
  actionValue: Action,
  sourceEnv: NodeJS.ProcessEnv,
  args: string[],
): EasAccount {
  const selectedAccount = getAccountSelector(args, sourceEnv)
  const actionPrefix = toEnvKey(actionValue)
  const target = actionValue.split(":")[1] as Target
  const targetPrefix = toEnvKey(target)
  const profilePrefix = toEnvKey(TARGET_PROFILES[target])
  const selectedPrefix = selectedAccount ? toEnvKey(selectedAccount) : null
  const prefixes = selectedPrefix
    ? [`EAS_${selectedPrefix}`]
    : [
        ...new Set([
          `EAS_${actionPrefix}`,
          `EAS_${targetPrefix}`,
          `EAS_${profilePrefix}`,
          "EAS",
        ]),
      ]

  const login =
    getFirstEnv(
      sourceEnv,
      prefixes.flatMap((prefix) => [`${prefix}_EMAIL`, `${prefix}_LOGIN`]),
    ) ?? null
  const password = getFirstEnv(
    sourceEnv,
    prefixes.map((prefix) => `${prefix}_PASSWORD`),
  )
  const username =
    getFirstEnv(
      sourceEnv,
      prefixes.map((prefix) => `${prefix}_USERNAME`),
    ) ?? null

  if (!login || !password) {
    console.error(
      [
        `Missing EAS credentials for ${selectedAccount ?? actionValue}.`,
        "",
        "Set EAS_EMAIL/EAS_PASSWORD, or choose a named account with:",
        "  EAS_ACCOUNT=work EAS_WORK_EMAIL=... EAS_WORK_PASSWORD=...",
        `  bun run eas:${actionValue.split(":")[0]} --${target} --account work`,
      ].join("\n"),
    )
    process.exit(1)
  }

  return {
    label: username ?? login,
    login,
    password,
    username,
  }
}

function resolveTarget(operation: Operation, args: string[]): Target {
  const selectedFlags = args.filter((arg) =>
    ["--dev", "--preview", "--prod"].includes(arg),
  )

  if (operation === "submit") {
    if (selectedFlags.length === 0) {
      return "prod"
    }

    if (selectedFlags.length === 1 && selectedFlags[0] === "--prod") {
      return "prod"
    }

    console.error("eas:submit supports only the production profile.\n")
    console.error(getUsage())
    process.exit(1)
  }

  if (selectedFlags.length !== 1) {
    console.error("Choose exactly one EAS environment flag.\n")
    console.error(getUsage())
    process.exit(1)
  }

  const target = selectedFlags[0].slice(2) as Target

  if (
    [
      "env-sync",
      "env-chat-sync",
      "env-legal-sync",
      "env-analytics-sync",
      "env-check",
    ].includes(operation) &&
    target !== "prod"
  ) {
    console.error(
      `eas:env:${operation === "env-check" ? "check" : "sync"} supports only --prod.`,
    )
    process.exit(1)
  }

  if (operation === "update" && target === "dev") {
    console.error("eas:update supports only --preview or --prod.\n")
    console.error(getUsage())
    process.exit(1)
  }

  return target
}

function resolveBuildPlatform(
  operation: Operation,
  args: string[],
): UpdatePlatform {
  let selected: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg !== "--platform" && !arg.startsWith("--platform=")) continue
    if (selected !== undefined) {
      throw new Error(
        "Choose one platform only for EAS build, submit, or update.",
      )
    }
    selected =
      arg === "--platform" ? args[++index] : arg.slice("--platform=".length)
  }
  if (
    selected !== undefined &&
    selected !== "android" &&
    selected !== "ios" &&
    !(operation === "update" && selected === "all")
  ) {
    throw new Error(
      "EAS platform must be android or ios; update also accepts all.",
    )
  }
  return (selected ?? "android") as UpdatePlatform
}

function assertExpectedUpdateCommit(args: string[], label = "update"): string {
  const values = args.flatMap((arg, index) => {
    if (arg === "--expected-commit") return [args[index + 1] ?? ""]
    if (arg.startsWith("--expected-commit="))
      return [arg.slice("--expected-commit=".length)]
    return []
  })
  if (values.length !== 1 || !/^[0-9a-f]{40}$/i.test(values[0] ?? "")) {
    throw new Error(
      `EAS ${label} requires exactly one full --expected-commit SHA for the reviewed source.`,
    )
  }
  return values[0]?.toLowerCase() ?? ""
}

function assertHostedBuildArguments(args: string[]) {
  const switches = new Set([
    "--non-interactive",
    "--json",
    "--wait",
    "--no-wait",
    "--clear-cache",
  ])
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (switches.has(arg)) continue
    if (arg.startsWith("--message=") && arg.length > "--message=".length)
      continue
    if (
      arg === "--message" &&
      args[index + 1] &&
      !args[index + 1].startsWith("-")
    ) {
      index++
      continue
    }
    throw new Error(
      "Hosted builds accept only reviewed platform/profile selection and non-interactive, JSON, wait, cache, or message options.",
    )
  }
}

async function assertNativeBuildReady(): Promise<void> {
  // Native compatibility is handled by the fingerprint runtime policy; hosted
  // builds only need to come from the exact clean commit being released.
  await assertExactCommittedMobileSource(expectedNativeBuildCommit ?? "")
}

function reportNativeBuildPreflightFailure(error: unknown): never {
  console.error(
    `EAS build stopped: source check failed${error instanceof Error ? `: ${error.message}` : "."}`,
  )
  process.exit(1)
}

async function assertUpdatePublishReady(): Promise<void> {
  // The fingerprint runtime policy keeps OTA updates off incompatible builds.
  await assertExactCommittedMobileSource(expectedUpdateCommit ?? "")
}

function reportUpdatePreflightFailure(error: unknown): never {
  console.error(
    `EAS update stopped: source check failed${error instanceof Error ? `: ${error.message}` : "."}`,
  )
  process.exit(1)
}

async function captureCommand(
  command: string[],
  cwd: string,
): Promise<{ code: number; stdout: string }> {
  const proc = Bun.spawn({ cmd: command, cwd, stdout: "pipe", stderr: "pipe" })
  const [stdout, , code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout }
}

async function assertExactCommittedMobileSource(
  revision: string,
): Promise<void> {
  const head = await captureCommand(["git", "rev-parse", "HEAD"], REPO_DIR)
  if (head.code !== 0 || head.stdout.trim().toLowerCase() !== revision) {
    throw new Error(
      "Expected commit must exactly match the current repository HEAD.",
    )
  }
  const status = await captureCommand(
    [
      "git",
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      "apps/mobile",
      "packages",
      "scripts/eas-account-runner.ts",
      "package.json",
      "bun.lock",
      "bun.lockb",
      "bunfig.toml",
      "turbo.json",
      "tsconfig.json",
      ".easignore",
      "patches",
    ],
    REPO_DIR,
  )
  if (status.code !== 0 || status.stdout.trim()) {
    throw new Error(
      "Mobile release source inputs must be clean and committed before release.",
    )
  }
}

function assertExactSubmissionBuildId(args: string[]): string {
  if (
    args.some(
      (arg) =>
        ["--latest", "--path", "--url"].includes(arg) ||
        arg.startsWith("--path=") ||
        arg.startsWith("--url="),
    )
  ) {
    throw new Error(
      "EAS submission requires an exact --id; latest, path and URL selectors are disabled.",
    )
  }
  const ids = args.flatMap((arg, index) => {
    if (arg === "--id") return [args[index + 1] ?? ""]
    if (arg.startsWith("--id=")) return [arg.slice("--id=".length)]
    return []
  })
  if (
    ids.length !== 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      ids[0],
    )
  ) {
    throw new Error(
      "EAS action requires exactly one UUID build ID: --id <build-id>.",
    )
  }
  return ids[0] ?? ""
}

function assertExpectedSubmissionVersion(args: string[]): string {
  const values = args.flatMap((arg, index) => {
    if (arg === "--expected-version") return [args[index + 1] ?? ""]
    if (arg.startsWith("--expected-version="))
      return [arg.slice("--expected-version=".length)]
    return []
  })
  if (values.length !== 1 || !/^[1-9]\d*$/.test(values[0] ?? "")) {
    throw new Error(
      "EAS submission requires exactly one positive --expected-version for the reviewed build.",
    )
  }
  return values[0] ?? ""
}

function assertExpectedSubmissionCommit(args: string[]): string {
  const values = args.flatMap((arg, index) => {
    if (arg === "--expected-commit") return [args[index + 1] ?? ""]
    if (arg.startsWith("--expected-commit="))
      return [arg.slice("--expected-commit=".length)]
    return []
  })
  if (values.length !== 1 || !/^[0-9a-f]{40}$/i.test(values[0] ?? "")) {
    throw new Error(
      "EAS submission requires exactly one full --expected-commit SHA for the reviewed build.",
    )
  }
  return values[0]?.toLowerCase() ?? ""
}

function getActionCommand(
  operation: Operation,
  target: Target,
  platform: UpdatePlatform,
  revision?: string,
): string[] {
  if (operation === "build") {
    return [
      "eas",
      "build",
      "--platform",
      platform,
      "--profile",
      iosSimulator ? "preview-simulator" : TARGET_PROFILES[target],
    ]
  }

  if (operation === "submit") {
    return [
      "eas",
      "submit",
      "--platform",
      platform,
      "--profile",
      TARGET_PROFILES[target],
    ]
  }

  if (operation === "update") {
    const environment = target === "prod" ? "production" : "preview"
    return [
      "eas",
      "update",
      "--platform",
      platform,
      "--channel",
      environment,
      "--environment",
      environment,
      "--message",
      revision ? `OTA update ${revision.slice(0, 12)}` : "Preview OTA update",
    ]
  }

  throw new Error(`Unsupported EAS action: ${operation}`)
}

function getAccountSelector(
  args: string[],
  sourceEnv: NodeJS.ProcessEnv,
): string | null {
  const accountFlagIndex = args.findIndex(
    (arg) => arg === "--account" || arg === "-a",
  )
  const accountEquals = args.find((arg) => arg.startsWith("--account="))

  if (accountFlagIndex >= 0) {
    return args[accountFlagIndex + 1]?.trim() || null
  }

  if (accountEquals) {
    return accountEquals.split("=").slice(1).join("=").trim() || null
  }

  return sourceEnv.EAS_ACCOUNT?.trim() || null
}

function getForwardedArgs(args: string[]): string[] {
  const forwardedArgs: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === "--release-checks") continue

    if (arg === "--account" || arg === "-a") {
      index += 1
      continue
    }

    if (arg.startsWith("--account=")) {
      continue
    }

    if (arg === "--expected-version") {
      index += 1
      continue
    }

    if (arg.startsWith("--expected-version=")) {
      continue
    }
    if (arg === "--expected-commit") {
      index += 1
      continue
    }
    if (arg.startsWith("--expected-commit=")) {
      continue
    }

    if (["--dev", "--preview", "--prod", "--ios-simulator"].includes(arg)) {
      continue
    }

    if (arg === "--platform") {
      index += 1
      continue
    }

    if (arg.startsWith("--platform=")) {
      continue
    }

    forwardedArgs.push(arg)
  }

  return forwardedArgs
}

function getFirstEnv(
  sourceEnv: NodeJS.ProcessEnv,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = sourceEnv[key]?.trim()

    if (value) {
      return value
    }
  }
}

function toEnvKey(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
}

function getUsage(): string {
  return [
    "Usage:",
    "  bun run eas:auth [--account <name>]",
    "  bun run eas:build <--preview|--prod> --expected-commit <full-sha> [--platform android|ios] [--ios-simulator (Preview iOS only)] [--account <name>]",
    "  bun run eas:build --dev [--platform android|ios] [--account <name>]",
    "  bun run eas:submit [--prod] [--platform android|ios] --id <build-id> --expected-version <version> --expected-commit <full-sha> [--account <name>]",
    "  bun run eas:view <--dev|--preview|--prod> --id <build-id> [--account <name>]",
    "  bun run eas:download <--dev|--preview|--prod> --id <build-id> --output <path> [--account <name>]",
    "  bun run eas:update --preview [--platform android|ios|all] [--account <name>]",
    "  bun run eas:update <--preview --release-checks|--prod> --expected-commit <full-sha> [--platform android|ios|all] [--account <name>]",
    "  bun run eas:env:sync --prod [--account <name>]",
    "  bun run eas:env:chat-sync --prod [--account <name>]",
    "  bun run eas:env:legal-sync --prod [--account <name>]",
    "  bun run eas:env:analytics-sync --prod [--account <name>]",
    "  bun run eas:env:check --prod [--account <name>]",
    "",
    "Default credentials:",
    "  EAS_EMAIL or EAS_LOGIN",
    "  EAS_PASSWORD",
    "  EAS_USERNAME optional",
    "",
    "Named account credentials:",
    "  EAS_ACCOUNT=work",
    "  EAS_WORK_EMAIL or EAS_WORK_LOGIN",
    "  EAS_WORK_PASSWORD",
    "  EAS_WORK_USERNAME optional",
  ].join("\n")
}

async function assertPreviewMobileTarget(
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const mobileFile = path.join(APP_DIR, ".env.preview")
  let source: string
  try {
    source = await readFile(mobileFile, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "Preview mobile target is missing: apps/mobile/.env.preview must explicitly name the Preview API and legal origin.",
      )
    }
    throw error
  }
  const mobile = parseEnvFile(source)
  const production = parseEnvFile(
    await readFile(path.join(APP_DIR, ".env.production"), "utf8"),
  )
  const { validatePreviewMobileTarget } = await import(
    "./eas-preview-mobile-target"
  )
  validatePreviewMobileTarget({
    apiUrl: mobile.EXPO_PUBLIC_API_URL,
    expectedApiUrl: env.API_URL,
    legalOrigin: mobile.EXPO_PUBLIC_LEGAL_ORIGIN,
    productionApiUrl: production.EXPO_PUBLIC_API_URL,
    baseUrl: mobile.EXPO_PUBLIC_BASE_URL,
    webUrl: mobile.EXPO_PUBLIC_WEB_URL,
    chatUrl: mobile.EXPO_PUBLIC_CHAT_URL,
    productionBaseUrl: production.EXPO_PUBLIC_BASE_URL,
    productionWebUrl: production.EXPO_PUBLIC_WEB_URL,
    productionChatUrl: production.EXPO_PUBLIC_CHAT_URL,
  })
}

/**
 * Signs the global EAS CLI in to the ewatrade account for release tooling,
 * which reads EAS (fingerprints, builds, env) through the shared session that
 * other apps on this machine also switch. Every other operation stays isolated.
 */
async function authenticateSharedSession(args: string[]): Promise<void> {
  const env = await loadEnvFiles({ ...Bun.env }, [
    path.join(REPO_DIR, ".env"),
    path.join(APP_DIR, ".env"),
  ])
  const selected = getAccountSelector(args, env)
  const prefix = selected ? `EAS_${toEnvKey(selected)}` : "EAS"
  const login = getFirstEnv(env, [`${prefix}_EMAIL`, `${prefix}_LOGIN`])
  const password = getFirstEnv(env, [`${prefix}_PASSWORD`])
  const username = getFirstEnv(env, [`${prefix}_USERNAME`]) ?? null
  if (!login || !password) {
    console.error(
      `Missing EAS credentials: set ${prefix}_EMAIL and ${prefix}_PASSWORD.`,
    )
    process.exit(1)
  }
  const home = Bun.env.HOME
  if (!home) throw new Error("HOME is not set; the EAS session has no path.")
  const statePath = path.join(home, ".expo", "state.json")
  let state: Record<string, unknown> = {}
  try {
    state = JSON.parse(await readFile(statePath, "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const current = (state.auth as { username?: string } | undefined)?.username
  if (current && username && current.toLowerCase() === username.toLowerCase()) {
    console.log(`EAS session already matches ${current}.`)
    return
  }
  const session = await loginWithEmailAndPassword(login, password)
  state.auth = {
    sessionSecret: session.sessionSecret,
    userId: session.id,
    username: session.username,
    currentConnection: "Username-Password-Authentication",
  }
  await mkdir(path.dirname(statePath), { recursive: true })
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  })
  console.log(
    current
      ? `Switched the EAS session from ${current} to ${session.username}.`
      : `Authenticated the EAS session as ${session.username}.`,
  )
}

async function loadEnvFiles(
  baseEnv: NodeJS.ProcessEnv,
  envFilePaths: string[],
): Promise<NodeJS.ProcessEnv> {
  const env = { ...baseEnv }

  for (const envFilePath of envFilePaths) {
    let source: string

    try {
      source = await readFile(envFilePath, "utf8")
    } catch (error) {
      const isMissingFile =
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"

      if (isMissingFile) {
        continue
      }

      throw error
    }

    Object.assign(env, parseEnvFile(source))
  }

  return env
}

function parseEnvFile(source: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith("#")) {
      continue
    }

    const withoutExport = line.startsWith("export ")
      ? line.slice(7).trimStart()
      : line
    const separatorIndex = withoutExport.indexOf("=")

    if (separatorIndex <= 0) {
      continue
    }

    const key = withoutExport.slice(0, separatorIndex).trim()

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue
    }

    values[key] = unquoteEnvValue(
      withoutExport.slice(separatorIndex + 1).trim(),
    )
  }

  return values
}

function unquoteEnvValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"')
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1)
  }

  const commentIndex = value.search(/\s#/)
  return commentIndex >= 0 ? value.slice(0, commentIndex).trimEnd() : value
}

async function loginWithEmailAndPassword(
  emailValue: string,
  passwordValue: string,
) {
  const easCliRoot = await resolveEasCliRoot()
  const modulePath = path.join(
    easCliRoot,
    "build",
    "user",
    "fetchSessionSecretAndUser.js",
  )

  const module = (await import(pathToFileURL(modulePath).href)) as {
    fetchSessionSecretAndUserAsync: (input: {
      username: string
      password: string
      otp?: string
    }) => Promise<{ sessionSecret: string; id: string; username: string }>
  }

  return await module.fetchSessionSecretAndUserAsync({
    username: emailValue,
    password: passwordValue,
  })
}

async function writeExpoSession(
  isolatedHome: string,
  session: {
    sessionSecret: string
    id: string
    username: string
  },
): Promise<void> {
  const statePath = path.join(isolatedHome, ".expo", "state.json")

  await mkdir(path.dirname(statePath), { recursive: true })
  await writeFile(
    statePath,
    `${JSON.stringify(
      {
        auth: {
          sessionSecret: session.sessionSecret,
          userId: session.id,
          username: session.username,
          currentConnection: "Username-Password-Authentication",
        },
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  )
}

async function resolveEasCliRoot(): Promise<string> {
  const easBinary = Bun.which("eas")

  if (!easBinary) {
    throw new Error("The `eas` command was not found in PATH.")
  }

  const basedir = path.dirname(easBinary)
  const resolvedBinary = await resolveRealpathSafe(easBinary)
  const resolvedBasedir = path.dirname(resolvedBinary)
  const wrapperCandidates = [
    ...(await collectWrapperCandidates(easBinary, basedir)),
    ...(await collectWrapperCandidates(resolvedBinary, resolvedBasedir)),
  ]
  const candidates = [
    ...collectAncestorCandidates(easBinary),
    ...collectAncestorCandidates(resolvedBinary),
    ...wrapperCandidates,
  ].filter((candidate, index, all) => all.indexOf(candidate) === index)

  for (const candidate of candidates) {
    try {
      if (await isEasCliRoot(candidate)) {
        return candidate
      }
    } catch {
      // Keep trying the next detected wrapper path.
    }
  }

  throw new Error(
    `Unable to resolve the installed eas-cli package path from ${easBinary}.`,
  )
}

function normalizeWrapperPath(candidate: string, basedir: string): string {
  const resolved = candidate.replaceAll("$basedir", basedir)
  return path.isAbsolute(resolved) ? resolved : path.resolve(basedir, resolved)
}

function collectAncestorCandidates(binaryPath: string): string[] {
  const candidates: string[] = []
  let currentDir = path.dirname(binaryPath)

  while (true) {
    candidates.push(currentDir)

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      break
    }

    currentDir = parentDir
  }

  return candidates
}

async function collectWrapperCandidates(
  binaryPath: string,
  basedir: string,
): Promise<string[]> {
  try {
    const wrapper = await readFile(binaryPath, "utf8")
    return [
      ...wrapper.matchAll(/["']([^"']*node_modules\/eas-cli)\/bin\/run["']/g),
      ...wrapper.matchAll(
        /["']([^"']*node_modules\/eas-cli)\/bin\/node_modules/g,
      ),
      ...wrapper.matchAll(/["']([^"']*node_modules\/eas-cli)\/node_modules/g),
    ].map((match) => normalizeWrapperPath(match[1], basedir))
  } catch {
    return []
  }
}

async function isEasCliRoot(candidate: string): Promise<boolean> {
  const packageJsonPath = path.join(candidate, "package.json")
  const runPath = path.join(candidate, "bin", "run")
  const buildPath = path.join(candidate, "build")

  try {
    await access(runPath)
    await access(buildPath)
  } catch {
    return false
  }

  try {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      name?: string
    }

    return packageJson.name === "eas-cli"
  } catch {
    return false
  }
}

async function resolveRealpathSafe(filePath: string): Promise<string> {
  try {
    return await realpath(filePath)
  } catch {
    return filePath
  }
}

async function runCommand(
  cmd: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; stdio: "inherit" | "pipe" },
): Promise<number> {
  const proc = Bun.spawn({
    cmd,
    cwd: options.cwd,
    env: options.env,
    stdin: "inherit",
    stdout: options.stdio,
    stderr: options.stdio,
  })

  return await proc.exited
}

async function syncProductionApiOrigin(
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const origin = env.EXPO_PUBLIC_API_URL?.trim()
  if (!origin) throw new Error("Local Production mobile API URL is missing.")
  const update = await runCommand(
    [
      "eas",
      "env:update",
      "production",
      "--variable-name",
      "EXPO_PUBLIC_API_URL",
      "--value",
      origin,
      "--visibility",
      "plaintext",
      "--scope",
      "project",
      "--non-interactive",
    ],
    { cwd: APP_DIR, env, stdio: "inherit" },
  )
  if (update !== 0) return update

  const proc = Bun.spawn({
    cmd: [
      "eas",
      "env:list",
      "production",
      "--format",
      "short",
      "--scope",
      "project",
    ],
    cwd: APP_DIR,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [output, , status] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (
    status !== 0 ||
    !output
      .split(/\r?\n/)
      .some(
        (line) => line.includes("EXPO_PUBLIC_API_URL") && line.includes(origin),
      )
  ) {
    console.error("EAS Production API URL readback did not confirm the update.")
    return 1
  }
  console.log("EAS Production API URL matches the verified live API host.")
  return 0
}

async function syncProductionChatOrigin(
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const origin = env.EXPO_PUBLIC_CHAT_URL?.trim()
  if (origin !== "https://chat.ewatrade.com") {
    throw new Error(
      "Local Production mobile chat URL must be the canonical HTTPS host.",
    )
  }
  const [home, legal] = await Promise.all([
    fetch(origin, { redirect: "manual", signal: AbortSignal.timeout(15_000) }),
    fetch(`${origin}/api/store-conversations/account/legal-publication`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    }),
  ])
  const publication = legal.ok ? await legal.json() : null
  if (
    home.status !== 200 ||
    home.headers.get("x-tenant-surface") !== "customer-chat" ||
    legal.status !== 200 ||
    publication?.effective !== false ||
    publication?.signupAvailable !== false
  ) {
    throw new Error(
      "Production chat host or closed legal gate failed live preflight.",
    )
  }
  const create = await runCommand(
    [
      "eas",
      "env:create",
      "production",
      "--name",
      "EXPO_PUBLIC_CHAT_URL",
      "--value",
      origin,
      "--visibility",
      "plaintext",
      "--scope",
      "project",
      "--force",
      "--non-interactive",
    ],
    { cwd: APP_DIR, env, stdio: "inherit" },
  )
  if (create !== 0) return create

  const proc = Bun.spawn({
    cmd: [
      "eas",
      "env:list",
      "production",
      "--format",
      "short",
      "--scope",
      "project",
    ],
    cwd: APP_DIR,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [output, , status] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (
    status !== 0 ||
    !output
      .split(/\r?\n/)
      .some(
        (line) =>
          line.includes("EXPO_PUBLIC_CHAT_URL") && line.includes(origin),
      )
  ) {
    console.error(
      "EAS Production chat URL readback did not confirm the update.",
    )
    return 1
  }
  console.log("EAS Production chat URL matches the verified gated chat host.")
  return 0
}

async function syncProductionLegalOrigin(
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const origin = env.EXPO_PUBLIC_LEGAL_ORIGIN?.trim()
  const marketingUrl = env.NEXT_PUBLIC_MARKETING_URL?.trim()
  if (origin !== "https://ewatrade.com" || origin !== marketingUrl) {
    throw new Error(
      "Local Production legal origin must match the canonical Marketing URL.",
    )
  }
  const create = await runCommand(
    [
      "eas",
      "env:create",
      "production",
      "--name",
      "EXPO_PUBLIC_LEGAL_ORIGIN",
      "--value",
      origin,
      "--visibility",
      "plaintext",
      "--scope",
      "project",
      "--force",
      "--non-interactive",
    ],
    { cwd: APP_DIR, env, stdio: "inherit" },
  )
  if (create !== 0) return create

  const proc = Bun.spawn({
    cmd: [
      "eas",
      "env:list",
      "production",
      "--format",
      "short",
      "--scope",
      "project",
    ],
    cwd: APP_DIR,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [output, , status] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (
    status !== 0 ||
    !output
      .split(/\r?\n/)
      .some(
        (line) =>
          line.includes("EXPO_PUBLIC_LEGAL_ORIGIN") && line.includes(origin),
      )
  ) {
    console.error(
      "EAS Production legal origin readback did not confirm the update.",
    )
    return 1
  }
  console.log("EAS Production legal origin matches the Marketing host.")
  return 0
}

async function syncProductionAnalyticsFlag(
  env: NodeJS.ProcessEnv,
): Promise<number> {
  if (env.EXPO_PUBLIC_LOGLY_ENABLED !== "false") {
    throw new Error(
      "Production mobile analytics must be disabled while the mixed-age audience lacks a pre-collection age gate.",
    )
  }
  const update = await runCommand(
    [
      "eas",
      "env:update",
      "production",
      "--variable-name",
      "EXPO_PUBLIC_LOGLY_ENABLED",
      "--value",
      "false",
      "--visibility",
      "plaintext",
      "--scope",
      "project",
      "--non-interactive",
    ],
    { cwd: APP_DIR, env, stdio: "inherit" },
  )
  if (update !== 0) return update

  const proc = Bun.spawn({
    cmd: [
      "eas",
      "env:list",
      "production",
      "--format",
      "short",
      "--scope",
      "project",
    ],
    cwd: APP_DIR,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [output, , status] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (
    status !== 0 ||
    !output
      .split(/\r?\n/)
      .some((line) =>
        /^EXPO_PUBLIC_LOGLY_ENABLED\s*=\s*false\s*$/.test(line.trim()),
      )
  ) {
    console.error(
      "EAS Production mobile analytics readback did not confirm disabled state.",
    )
    return 1
  }
  console.log(
    "EAS Production mobile analytics is disabled for the mixed-age release.",
  )
  return 0
}

async function inspectSubmissionBuild({
  buildId,
  env,
  expectedCommit,
  expectedVersion,
  platform,
}: {
  buildId: string
  env: NodeJS.ProcessEnv
  expectedCommit: string
  expectedVersion: string
  platform: BuildPlatform
}): Promise<boolean> {
  const proc = Bun.spawn({
    cmd: ["eas", "build:view", buildId, "--json"],
    cwd: APP_DIR,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [rawOutput, , exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    console.error("EAS submission stopped: exact build inspection failed.")
    return false
  }
  let build: {
    id?: string
    status?: string
    platform?: string
    buildProfile?: string
    distribution?: string
    channel?: string
    appBuildVersion?: string
    gitCommitHash?: string | null
    isForIosSimulator?: boolean
    artifacts?: { buildUrl?: string }
    project?: { id?: string; ownerAccount?: { name?: string } }
  }
  try {
    build = JSON.parse(rawOutput)
    if (!build || typeof build !== "object" || Array.isArray(build))
      throw new Error("Invalid build metadata")
  } catch {
    console.error("EAS submission stopped: build metadata is unreadable.")
    return false
  }
  const failures = [
    build.id === buildId || "build ID",
    build.status === "FINISHED" || "build status",
    build.platform === platform.toUpperCase() || "platform",
    build.buildProfile === "production" || "build profile",
    build.distribution === "STORE" || "store distribution",
    build.channel === "production" || "update channel",
    build.appBuildVersion === expectedVersion || "reviewed version",
    (typeof build.gitCommitHash === "string" &&
      build.gitCommitHash.toLowerCase() === expectedCommit) ||
      "reviewed commit",
    build.project?.id === "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b" ||
      "Expo project",
    build.project?.ownerAccount?.name === "cipron-startups" || "Expo owner",
    platform !== "ios" ||
      build.isForIosSimulator === false ||
      "device distribution",
    (typeof build.artifacts?.buildUrl === "string" &&
      build.artifacts.buildUrl.startsWith("https://")) ||
      "HTTPS artifact",
  ].filter((item): item is string => item !== true)
  if (failures.length) {
    console.error(
      `EAS submission stopped: selected build failed ${failures.join(", ")}.`,
    )
    return false
  }
  return true
}

async function viewBuild(
  cmd: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<number> {
  const proc = Bun.spawn({
    cmd,
    cwd: options.cwd,
    env: options.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [rawOutput, , exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    console.error(`EAS build inspection failed (exit ${exitCode}).`)
    return exitCode
  }
  try {
    const result = JSON.parse(rawOutput) as {
      id?: string
      status?: string
      platform?: string
      buildProfile?: string
      distribution?: string
      channel?: string
      appBuildVersion?: string
      gitCommitHash?: string | null
      artifacts?: Record<string, unknown>
      createdAt?: string
      updatedAt?: string
      project?: { id?: string; ownerAccount?: { name?: string } }
    }
    console.log(
      JSON.stringify({
        id: result.id,
        status: result.status,
        platform: result.platform,
        buildProfile: result.buildProfile,
        distribution: result.distribution,
        channel: result.channel,
        appBuildVersion: result.appBuildVersion,
        gitCommitHash: result.gitCommitHash,
        artifactAvailable: Boolean(result.artifacts?.buildUrl),
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        projectId: result.project?.id,
        ownerAccount: result.project?.ownerAccount?.name,
      }),
    )
    return 0
  } catch {
    console.error("EAS build inspection returned an unreadable response.")
    return 1
  }
}

async function downloadBuild(
  cmd: string[],
  exactId: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<number> {
  const outputFlag = args.indexOf("--output")
  const outputPath = outputFlag >= 0 ? args[outputFlag + 1] : undefined
  if (!outputPath || !path.isAbsolute(outputPath)) {
    console.error("Choose an absolute --output path for the build artifact.")
    return 1
  }
  const proc = Bun.spawn({
    cmd,
    cwd: options.cwd,
    env: options.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [rawOutput, , exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    console.error(`EAS artifact lookup failed (exit ${exitCode}).`)
    return exitCode
  }
  let build: {
    id?: string
    status?: string
    platform?: string
    artifacts?: { buildUrl?: string }
    buildProfile?: string
    distribution?: string
    channel?: string
    gitCommitHash?: string | null
    isForIosSimulator?: boolean
    project?: { id?: string; ownerAccount?: { name?: string } }
  }
  try {
    build = JSON.parse(rawOutput)
  } catch {
    console.error("EAS artifact lookup returned an unreadable response.")
    return 1
  }
  if (
    build.id !== exactId ||
    build.status !== "FINISHED" ||
    (iosSimulator
      ? !isReviewedIosPreviewSimulatorArtifact(build, {
          id: exactId,
          commit: expectedSimulatorArtifactCommit ?? "",
        })
      : build.platform !== "ANDROID") ||
    !build.artifacts?.buildUrl?.startsWith("https://")
  ) {
    console.error("Exact reviewed build artifact is unavailable.")
    return 1
  }
  try {
    const response = await fetch(build.artifacts.buildUrl)
    if (!response.ok) throw new Error("Artifact download failed")
    const bytes = new Uint8Array(await response.arrayBuffer())
    await writeFile(outputPath, bytes, { flag: "wx", mode: 0o600 })
    console.log(
      JSON.stringify({
        id: exactId,
        path: outputPath,
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }),
    )
    return 0
  } catch {
    console.error("Artifact download or exclusive save failed.")
    return 1
  }
}
