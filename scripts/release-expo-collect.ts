#!/usr/bin/env bun
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  type EwaTradeProviderBundle,
  MOBILE_PROJECT,
  MOBILE_TARGET,
} from "../.release/ewatrade-provider-bundle"
import type { ExpoPlatform } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/expo"
import {
  assertExpoNativeEnvironmentReceipt,
  collectExpoNativeEnvironment,
} from "./release-expo-environment"
import {
  assertNativeEasEnvironment,
  assertNativeEnvironmentState,
  resolveNativeEnvironment,
} from "./release-mobile-environment"
import { validExpoFingerprint } from "./release-mobile-fingerprint"
import type { MobileSourceState } from "./release-mobile-source"

const PAGE_SIZE = 50
const MAX_PAGES = 20
const OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 120_000
const OWNER = MOBILE_PROJECT.owner
const SLUG = MOBILE_PROJECT.slug

export type ExpoSourceState = MobileSourceState

export type CollectedEnvironment = {
  environment: "preview" | "production"
  projectId: string
  variables: Array<{
    name: string
    scope: string
    visibility: string
    environments: string[]
  }>
}

export type ReadOnlyCommand = (args: string[], cwd: string) => Promise<string>

export type ExpoCollection = {
  releaseReady: false
  observedAt: string
  revision: string
  environment: "preview" | "production"
  project: { id: string; owner: string; slug: string }
  sourceState: ExpoSourceState
  expo: EwaTradeProviderBundle["expo"]
  environmentMetadata: CollectedEnvironment
  unsupported: string[]
}

type CollectorInput = {
  environment: "preview" | "production"
  revision: string
  sourceState: ExpoSourceState
  baselineBuildIds: Partial<Record<ExpoPlatform, string | null>>
  runReadOnly: ReadOnlyCommand
  projectDirectory: string
  nativeEasConfiguration?: unknown
  readNativeEnvironment?: typeof collectExpoNativeEnvironment
}

/** Authenticated commands always run in the owned neutral project directory. */
export async function collectNeutralExpoProviderState(
  input: Omit<CollectorInput, "runReadOnly" | "projectDirectory">,
): Promise<ExpoCollection> {
  return withNeutralExpoProject((projectDirectory) =>
    collectExpoProviderState({
      ...input,
      projectDirectory,
      runReadOnly: runEasReadOnly,
    }),
  )
}

export function createNeutralExpoConfig() {
  return {
    expo: {
      name: "EwaTrade release evidence",
      slug: SLUG,
      owner: OWNER,
      extra: { eas: { projectId: MOBILE_TARGET.projectId } },
    },
  }
}

export async function withNeutralExpoProject<T>(
  action: (projectDirectory: string) => Promise<T>,
): Promise<T> {
  const projectDirectory = await mkdtemp(
    join(tmpdir(), "ewatrade-eas-readonly-"),
  )
  try {
    await writeFile(
      join(projectDirectory, "app.json"),
      `${JSON.stringify(createNeutralExpoConfig(), null, 2)}\n`,
      { mode: 0o600 },
    )
    await writeFile(
      join(projectDirectory, "package.json"),
      `${JSON.stringify({ name: "ewa-release-evidence", private: true }, null, 2)}\n`,
      { mode: 0o600 },
    )
    return await action(projectDirectory)
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
}

export function validateExpoSourceState(
  sourceState: ExpoSourceState,
  revision: string,
  environment: "preview" | "production",
) {
  if (
    sourceState?.version !== 1 ||
    sourceState.revision !== revision ||
    sourceState.environment !== environment ||
    !/^[0-9a-f]{40}$/i.test(revision) ||
    !/^[0-9a-f]{64}$/i.test(sourceState.sourceFingerprint)
  ) {
    throw new Error(
      "Credential-free Expo source-state artifact is missing or not bound to the exact revision and environment.",
    )
  }
  for (const platform of MOBILE_TARGET.platforms) {
    const state = sourceState.platforms?.[platform]
    if (
      !state ||
      !validExpoFingerprint(state.fingerprint) ||
      state.fingerprintAlgorithm !==
        (state.fingerprint.length === 40 ? "sha1" : "sha256") ||
      !/^[A-Za-z0-9][A-Za-z0-9._:+-]*$/.test(state.runtimeVersion)
    ) {
      throw new Error(
        `${platform}: exact-source fingerprint/runtime result is unavailable.`,
      )
    }
  }
  assertNativeEnvironmentState(
    { revision, environment, sourceFingerprint: sourceState.sourceFingerprint },
    sourceState.nativeEnvironment,
  )
}

export async function collectExpoProviderState(
  input: CollectorInput,
): Promise<ExpoCollection> {
  validateExpoSourceState(input.sourceState, input.revision, input.environment)
  const nativeContext = {
    revision: input.revision,
    environment: input.environment,
    sourceFingerprint: input.sourceState.sourceFingerprint,
  }
  if (input.nativeEasConfiguration !== undefined)
    assertNativeEasEnvironment(
      input.nativeEasConfiguration,
      input.environment,
      resolveNativeEnvironment(nativeContext).values,
    )
  if (
    !MOBILE_TARGET.platforms.every(
      (platform) => input.baselineBuildIds[platform],
    )
  ) {
    throw new Error(
      "Collector requires explicit owner-selected Android and iOS baseline build IDs.",
    )
  }

  const project = await collectProjectIdentity(
    input.runReadOnly,
    input.projectDirectory,
  )
  if (
    project.id !== MOBILE_TARGET.projectId ||
    project.owner !== OWNER ||
    project.slug !== SLUG
  ) {
    throw new Error(
      "Authenticated EAS project identity does not match the owned EwaTrade project.",
    )
  }

  let nativeEnvironmentParity: EwaTradeProviderBundle["expo"]["nativeEnvironmentParity"]
  if (input.nativeEasConfiguration !== undefined) {
    try {
      nativeEnvironmentParity = await (
        input.readNativeEnvironment ?? collectExpoNativeEnvironment
      )(
        nativeContext,
        input.sourceState.nativeEnvironment,
        input.nativeEasConfiguration,
      )
      assertExpoNativeEnvironmentReceipt(
        nativeContext,
        input.sourceState.nativeEnvironment,
        input.nativeEasConfiguration,
        nativeEnvironmentParity,
      )
    } catch {
      nativeEnvironmentParity = undefined
    }
  }

  const channels: EwaTradeProviderBundle["expo"]["channels"] = []
  const builds: EwaTradeProviderBundle["expo"]["builds"] = []
  const updates: EwaTradeProviderBundle["expo"]["updates"] = []
  let collectedEnvironment: CollectedEnvironment | null = null

  for (const environment of [input.environment] as const) {
    const expected = MOBILE_TARGET[environment]
    const channelResult = await runJsonCommand(
      input.runReadOnly,
      input.projectDirectory,
      ["channel:view", expected.channel, "--json", "--limit", "50"],
    )
    const channelResponse = requireObject(
      channelResult,
      "EAS channel response is malformed.",
    )
    const channelPage = requireObject(
      channelResponse.currentPage,
      "EAS channel response is malformed.",
    )
    const channel = requireObject(
      channelPage,
      "EAS channel response is malformed.",
    )
    if (channel.name !== expected.channel || channel.isPaused !== false) {
      throw new Error(
        `${environment}: EAS channel is missing, paused, or unexpected.`,
      )
    }
    const mappedBranchId = directChannelBranchId(channel.branchMapping)
    const branch = mappedBranchId
      ? await findBranchById(input, mappedBranchId)
      : null
    if (!branch || branch.name !== expected.branch) {
      throw new Error(
        `${environment}: channel does not point directly to its owned release branch.`,
      )
    }
    channels.push({
      projectId: project.id,
      channel: expected.channel,
      branch: expected.branch,
    })

    const envOutput = await runRawCommand(
      input.runReadOnly,
      input.projectDirectory,
      ["env:list", environment, "--format", "long", "--scope", "project"],
    )
    collectedEnvironment = {
      environment,
      projectId: project.id,
      variables: parseEnvironmentMetadata(envOutput, environment),
    }

    for (const platform of MOBILE_TARGET.platforms) {
      const pageBuilds = await collectBuildPages(
        input,
        project.id,
        environment,
        platform,
      )
      builds.push(...pageBuilds)
      if (
        !pageBuilds.some(
          (record) => record.id === input.baselineBuildIds[platform],
        )
      ) {
        throw new Error(
          `${environment}/${platform}: owner-selected baseline build is absent from the authenticated EAS project.`,
        )
      }
    }

    const branchUpdates = await collectBranchUpdates(
      input,
      project.id,
      expected.branch,
      expected.channel,
    )
    updates.push(...branchUpdates)
  }

  const fingerprints = {
    android: input.sourceState.platforms.android.fingerprint,
    ios: input.sourceState.platforms.ios.fingerprint,
  }
  const runtimeVersions = {
    android: input.sourceState.platforms.android.runtimeVersion,
    ios: input.sourceState.platforms.ios.runtimeVersion,
  }
  const baselines = input.baselineBuildIds
  return {
    project,
    sourceState: input.sourceState,
    expo: {
      nativeEnvironment: input.sourceState.nativeEnvironment,
      nativeEnvironmentParity,
      nativeConfiguration: input.sourceState.nativeConfiguration,
      fingerprints,
      runtimeVersions,
      baselineBuildIds: baselines,
      newBuildIds: {},
      updateGroupIds: {},
      builds: dedupeBy(builds, (record) => record.id),
      updates: dedupeBy(
        updates,
        (record) => `${record.groupId}:${record.platform}`,
      ),
      channels,
    },
    releaseReady: false,
    observedAt: new Date().toISOString(),
    revision: input.revision,
    environment: input.environment,
    environmentMetadata:
      collectedEnvironment ??
      (() => {
        throw new Error("EAS environment metadata was not collected.")
      })(),
    unsupported: [
      "General EAS environment values are not exported; env:list exports project names, scopes, visibility and environment labels only. Native parameters are compared privately through a separate fixed-name query when committed profile data is available.",
      "EAS Update CLI metadata does not expose rollout state consistently per platform; this collector fails closed when the group rollout percentage is absent.",
      "The source-state artifact is not authenticated by this collector; orchestration must independently bind its source fingerprint and provenance.",
      ...(nativeEnvironmentParity
        ? []
        : [
            "Native environment provider/account/profile value parity is unverified; project-only metadata cannot establish effective build inputs.",
          ]),
    ],
  }
}

async function collectProjectIdentity(
  runReadOnly: ReadOnlyCommand,
  cwd: string,
) {
  const output = await runRawCommand(runReadOnly, cwd, ["project:info"])
  const fields = new Map<string, string>()
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9]*)\s*(?::\s*|\s{2,})(.+?)\s*$/.exec(
      line,
    )
    if (match?.[1] && match[2]) fields.set(match[1], match[2])
  }
  const fullName = /^@([^/\s]+)\/([^\s]+)$/.exec(fields.get("fullName") ?? "")
  const owner = fullName?.[1]
  const slug = fullName?.[2]
  const projectId = fields.get("ID")
  if (!owner || !slug || !projectId)
    throw new Error(
      "EAS project:info did not expose a verifiable owner, slug, and project ID.",
    )
  return { id: projectId, owner, slug }
}

async function collectBuildPages(
  input: CollectorInput,
  projectId: string,
  environment: "preview" | "production",
  platform: ExpoPlatform,
) {
  const expected = MOBILE_TARGET[environment]
  const records: EwaTradeProviderBundle["expo"]["builds"] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const raw = await runJsonCommand(
      input.runReadOnly,
      input.projectDirectory,
      [
        "build:list",
        "--platform",
        platform,
        "--status",
        "finished",
        "--build-profile",
        expected.profile,
        "--channel",
        expected.channel,
        "--limit",
        String(PAGE_SIZE),
        "--offset",
        String(page * PAGE_SIZE),
        "--json",
      ],
    )
    const items = requireArray(raw, "EAS build:list response is malformed.")
    records.push(...items.map((item) => normalizeBuild(item, projectId)))
    if (items.length < PAGE_SIZE) return records
  }
  throw new Error(
    "EAS build history exceeded the collector pagination limit; completeness cannot be established.",
  )
}

async function findBranchById(input: CollectorInput, id: string) {
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const items = requireArray(
      await runJsonCommand(input.runReadOnly, input.projectDirectory, [
        "branch:list",
        "--limit",
        String(PAGE_SIZE),
        "--offset",
        String(page * PAGE_SIZE),
        "--json",
      ]),
      "EAS branch:list response is malformed.",
    )
    const match = items
      .map((entry) => requireObject(entry, "EAS branch record is malformed."))
      .find((branch) => branch.id === id)
    if (match) return match
    if (items.length < PAGE_SIZE) return null
  }
  throw new Error("EAS branch history exceeded the collector pagination limit.")
}

function normalizeBuild(
  value: unknown,
  projectId: string,
): EwaTradeProviderBundle["expo"]["builds"][number] {
  const build = requireObject(value, "EAS build record is malformed.")
  const app = requireObject(
    build.app,
    "EAS build project ownership is unavailable.",
  )
  const owner = app.username
  if (app.id !== projectId || owner !== OWNER || app.slug !== SLUG) {
    throw new Error(
      "EAS build record is not owned by the expected Expo project.",
    )
  }
  const platform = normalizePlatform(build.platform)
  const channel = requireObject(
    build.updateChannel,
    "EAS build channel metadata is unavailable.",
  )
  const runtimeMetadata =
    build.runtime && typeof build.runtime === "object"
      ? requireObject(build.runtime, "EAS build runtime metadata is malformed.")
      : null
  const runtime =
    typeof build.runtimeVersion === "string"
      ? build.runtimeVersion
      : runtimeMetadata?.version
  const fingerprintMetadata =
    build.fingerprint && typeof build.fingerprint === "object"
      ? requireObject(
          build.fingerprint,
          "EAS build fingerprint metadata is malformed.",
        )
      : null
  const fingerprint = fingerprintMetadata?.hash
  const revision = build.gitCommitHash
  const artifactMetadata =
    build.artifacts && typeof build.artifacts === "object"
      ? requireObject(
          build.artifacts,
          "EAS build artifact metadata is malformed.",
        )
      : null
  const available =
    typeof artifactMetadata?.buildUrl === "string" &&
    /^https:\/\//.test(artifactMetadata.buildUrl)
  const status =
    typeof build.status === "string" ? build.status.toLowerCase() : ""
  if (
    !platform ||
    !isSha(revision, 40) ||
    !validExpoFingerprint(fingerprint) ||
    typeof runtime !== "string" ||
    !available
  ) {
    throw new Error(
      "EAS build record lacks source revision, native fingerprint, runtime, platform, or available HTTPS artifact metadata.",
    )
  }
  return {
    id: requireString(build.id, "EAS build ID is unavailable."),
    projectId,
    platform,
    profile: requireString(
      build.buildProfile,
      "EAS build profile is unavailable.",
    ),
    channel: requireString(
      channel.name,
      "EAS build channel name is unavailable.",
    ),
    revision,
    runtimeVersion: runtime,
    appVersion: optionalBuildVersion(build.appVersion),
    appBuildVersion: optionalBuildVersion(build.appBuildVersion),
    fingerprint,
    status:
      status === "finished"
        ? "finished"
        : status === "failed"
          ? "failed"
          : "pending",
    availability: available ? "available" : "unavailable",
  }
}

function optionalBuildVersion(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !/^[0-9]+(?:\.[0-9]+){0,2}$/.test(value)
  )
    throw new Error("EAS build version metadata is malformed.")
  return value
}

async function collectBranchUpdates(
  input: CollectorInput,
  projectId: string,
  branch: string,
  channel: string,
) {
  const summaries: Record<string, unknown>[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const raw = await runJsonCommand(
      input.runReadOnly,
      input.projectDirectory,
      [
        "update:list",
        "--branch",
        branch,
        "--platform",
        "all",
        "--limit",
        String(PAGE_SIZE),
        "--offset",
        String(page * PAGE_SIZE),
        "--json",
      ],
    )
    const response = requireObject(
      raw,
      "EAS update:list response is malformed.",
    )
    const items = requireArray(
      response.currentPage,
      "EAS update:list current page is unavailable.",
    )
    summaries.push(
      ...items.map((item) =>
        requireObject(item, "EAS update summary is malformed."),
      ),
    )
    if (items.length < PAGE_SIZE) break
    if (page === MAX_PAGES - 1)
      throw new Error(
        "EAS update history exceeded the collector pagination limit.",
      )
  }

  const records: EwaTradeProviderBundle["expo"]["updates"] = []
  for (const summary of summaries) {
    const groupId = requireString(
      summary.group,
      "EAS update group ID is unavailable.",
    )
    const group = await runJsonCommand(
      input.runReadOnly,
      input.projectDirectory,
      ["update:view", groupId, "--json"],
    )
    for (const value of requireArray(
      group,
      "EAS update:view response is malformed.",
    )) {
      const update = requireObject(value, "EAS update record is malformed.")
      if (update.group !== groupId)
        throw new Error(
          "EAS update:view group identity differs from the requested group.",
        )
      const platform = normalizePlatform(update.platform)
      if (!platform) throw new Error("EAS update platform metadata is unknown.")
      const revision = update.gitCommitHash
      const runtimeVersion = update.runtimeVersion
      const branchName = update.branch
      if (
        !isSha(revision, 40) ||
        typeof runtimeVersion !== "string" ||
        branchName !== branch
      ) {
        throw new Error(
          "EAS update record lacks exact Git revision, runtime, or branch ownership metadata.",
        )
      }
      const rolloutPercentage = summary.rolloutPercentage
      if (
        typeof rolloutPercentage !== "number" ||
        !Number.isFinite(rolloutPercentage) ||
        rolloutPercentage < 0 ||
        rolloutPercentage > 100
      ) {
        throw new Error(
          `EAS update group ${groupId} has no corroborated rollout percentage; refusing to infer publication completeness.`,
        )
      }
      records.push({
        groupId,
        projectId,
        platform,
        channel,
        branch,
        revision,
        runtimeVersion,
        // update:list only contains server-published groups; update:view has no status field.
        status: "published",
        rolloutPercentage,
      })
    }
  }
  return records
}

export function parseEnvironmentMetadata(
  output: string,
  environment: "preview" | "production",
) {
  const variables: CollectedEnvironment["variables"] = []
  for (const block of output.split(/———|\n-{3,}\n/g)) {
    const fields = new Map<string, string>()
    for (const line of block.split(/\r?\n/)) {
      const match = /^(Name|Scope|Visibility|Environments)\s+(.+)$/.exec(
        line.trim(),
      )
      const fieldName = match?.[1]
      const fieldValue = match?.[2]
      if (fieldName && fieldValue) fields.set(fieldName, fieldValue.trim())
    }
    const name = fields.get("Name")
    if (!name) continue
    const scope = fields.get("Scope") ?? ""
    const visibility = fields.get("Visibility") ?? ""
    const environments = (fields.get("Environments") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    if (
      !scope ||
      !visibility ||
      !environments.some((item) => item.toLowerCase() === environment)
    ) {
      throw new Error(
        `EAS environment variable ${name} has incomplete scope/visibility/environment metadata.`,
      )
    }
    variables.push({ name, scope, visibility, environments })
  }
  if (!variables.length)
    throw new Error(
      `EAS ${environment} environment returned no project variable metadata.`,
    )
  return variables.sort((a, b) => a.name.localeCompare(b.name))
}

function directChannelBranchId(mapping: unknown): string | null {
  if (typeof mapping !== "string") return null
  try {
    const parsed = JSON.parse(mapping)
    if (
      parsed.version === 0 &&
      Array.isArray(parsed.data) &&
      parsed.data.length === 1 &&
      parsed.data[0]?.branchMappingLogic === "true" &&
      typeof parsed.data[0]?.branchId === "string"
    ) {
      return parsed.data[0].branchId
    }
    return null
  } catch {
    return null
  }
}

async function runJsonCommand(
  run: ReadOnlyCommand,
  cwd: string,
  args: string[],
) {
  const text = await runRawCommand(run, cwd, args)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(
      `Read-only EAS command ${args[0]} did not return valid JSON.`,
    )
  }
}

async function runRawCommand(
  run: ReadOnlyCommand,
  cwd: string,
  args: string[],
) {
  const allowed = new Set([
    "project:info",
    "channel:view",
    "branch:list",
    "build:list",
    "env:list",
    "update:list",
    "update:view",
  ])
  if (!allowed.has(args[0] ?? ""))
    throw new Error(
      "Collector refused a command outside its read-only allowlist.",
    )
  const output = await run(args, cwd)
  if (typeof output !== "string" || output.length > 8 * 1024 * 1024)
    throw new Error(`EAS ${args[0]} output is unavailable or too large.`)
  return output
}

function normalizePlatform(platform: unknown): ExpoPlatform | null {
  if (platform === "android" || platform === "ANDROID") return "android"
  if (platform === "ios" || platform === "IOS") return "ios"
  return null
}

function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const values = new Map<string, T>()
  for (const item of items) values.set(keyOf(item), item)
  return [...values.values()]
}

function requireObject(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(message)
  return value as Record<string, unknown>
}

function requireArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(message)
  return value
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(message)
  return value
}

function isSha(value: unknown, length: number): value is string {
  return (
    typeof value === "string" &&
    new RegExp(`^[0-9a-f]{${length}}$`, "i").test(value)
  )
}

async function runEasReadOnly(args: string[], cwd: string): Promise<string> {
  const home = process.env.HOME
  if (!home)
    throw new Error("Authenticated read-only EAS session HOME is unavailable.")
  const proc = Bun.spawn({
    cmd: [process.env.EAS_CLI_PATH ?? "eas", ...args],
    cwd,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: home,
      EXPO_TOKEN: process.env.EXPO_TOKEN,
      CI: "1",
      NO_COLOR: "1",
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const timeout = setTimeout(() => proc.kill(), COMMAND_TIMEOUT_MS)
  let stdout = ""
  try {
    const [streams, status] = await Promise.all([
      Promise.all([
        readBoundedStream(proc.stdout, OUTPUT_LIMIT_BYTES),
        readBoundedStream(proc.stderr, 64 * 1024),
      ]),
      proc.exited,
    ])
    stdout = streams[0]
    if (status !== 0)
      throw new Error(`Read-only EAS ${args[0]} command failed.`)
  } catch (error) {
    proc.kill()
    throw error
  } finally {
    clearTimeout(timeout)
  }
  return stdout
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<string> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > limit) {
      await reader.cancel()
      throw new Error(
        "Read-only EAS command exceeded its bounded output limit.",
      )
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

async function main() {
  const args = Bun.argv.slice(2)
  if (
    args.length !== 6 ||
    args[0] !== "--environment" ||
    !["preview", "production"].includes(args[1]) ||
    args[2] !== "--revision" ||
    args[4] !== "--source-state"
  ) {
    throw new Error(
      "Use --environment preview|production --revision <SHA> --source-state <JSON path>.",
    )
  }
  const revision = args[3]
  const environmentValue = args[1]
  const sourceStatePath = args[5]
  if (!revision || !environmentValue || !sourceStatePath)
    throw new Error("Collector arguments are incomplete.")
  const environment = environmentValue as "preview" | "production"
  const sourceState = JSON.parse(
    await readFile(resolve(sourceStatePath), "utf8"),
  ) as ExpoSourceState
  const baselineBuildIds = JSON.parse(
    process.env.EWATRADE_EXPO_BASELINE_BUILD_IDS ?? "{}",
  ) as Partial<Record<ExpoPlatform, string | null>>
  const collection = await withNeutralExpoProject((projectDirectory) =>
    collectExpoProviderState({
      environment,
      revision,
      sourceState,
      baselineBuildIds,
      runReadOnly: runEasReadOnly,
      projectDirectory,
    }),
  )
  process.stdout.write(`${JSON.stringify(collection)}\n`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Expo collection failed closed.",
    )
    process.exitCode = 2
  })
}
