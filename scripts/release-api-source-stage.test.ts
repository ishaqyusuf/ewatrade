import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  materializeCommittedApiStage,
  parseApiDeployArguments,
  resolveApiSourceRevision,
} from "./release-api-source-stage.mjs"

const repositories: string[] = []
const stages: Array<{ stage: string; cleanup(): void }> = []

const baselineFiles: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "fixture",
    private: true,
    workspaces: ["apps/*", "packages/*", "tooling/*"],
  }),
  "bun.lock": "fixture lock content\n",
  "bunfig.toml": "install.ignore-scripts = true\n",
  "tsconfig.json": '{"extends":"./packages/tsconfig/base.json"}\n',
  "turbo.json": '{"tasks":{}}\n',
  ".gitignore": ".env.production\nnode_modules/\n",
  "apps/api/package.json": '{"name":"@ewatrade/api","dependencies":{}}\n',
  "apps/api/tsconfig.json": '{"compilerOptions":{}}\n',
  "apps/api/src/index.ts": "export const api = 'committed'\n",
  "apps/dashboard/package.json": '{"name":"@ewatrade/dashboard"}\n',
  "packages/tsconfig/package.json": '{"name":"@ewatrade/tsconfig"}\n',
  "packages/tsconfig/base.json": '{"compilerOptions":{"strict":true}}\n',
  "packages/api-core/package.json": '{"name":"@ewatrade/api-core"}\n',
  "packages/api-core/src/index.ts": "export const core = true\n",
  "scripts/build-api.mjs": "export const trustedBuildInput = true\n",
  "tooling/build-tools/package.json": '{"name":"@ewatrade/build-tools"}\n',
  "tooling/build-tools/src/index.ts": "export const tool = true\n",
  "patches/example.patch": "diff --git a/example b/example\n",
  "apps/api/tool.sh": "#!/bin/sh\nexit 0\n",
}

function fixture(extraFiles: Record<string, string> = {}) {
  const repository = realpathSync(
    mkdtempSync(path.join("/private/tmp", "ewatrade-api-stage-test-")),
  )
  repositories.push(repository)
  for (const [relative, value] of Object.entries({
    ...baselineFiles,
    ...extraFiles,
  })) {
    const file = path.join(repository, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, value)
  }
  chmodSync(path.join(repository, "apps/api/tool.sh"), 0o755)
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "core.fsmonitor=false", "-C", repository, ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim()
  git("init", "-q", "-b", "main")
  git("config", "user.name", "API Source Fixture")
  git("config", "user.email", "api-source@example.test")
  git("add", ".")
  for (const relative of Object.keys(extraFiles)) git("add", "-f", relative)
  git("commit", "-qm", "committed source")
  return { repository, git, revision: git("rev-parse", "HEAD") }
}

function stageFor(repository: string, revision: string) {
  const stage = materializeCommittedApiStage({ repository, revision })
  stages.push(stage)
  return stage
}

afterEach(() => {
  for (const stage of stages.splice(0)) stage.cleanup()
  for (const repository of repositories.splice(0))
    rmSync(repository, { recursive: true, force: true })
})

test("materializes exact committed workspace inputs with hash-only immutable inventory", () => {
  const { repository, revision } = fixture()
  const stage = stageFor(repository, revision)
  expect(stage.revision).toBe(revision)
  expect(stage.stage.startsWith("/private/tmp/ewatrade-api-source-")).toBe(true)
  expect(statSync(stage.stage).mode & 0o777).toBe(0o700)
  expect(
    readFileSync(path.join(stage.stage, "apps/api/src/index.ts"), "utf8"),
  ).toBe(baselineFiles["apps/api/src/index.ts"])
  expect(
    readFileSync(
      path.join(stage.stage, "packages/api-core/src/index.ts"),
      "utf8",
    ),
  ).toBe(baselineFiles["packages/api-core/src/index.ts"])
  expect(
    readFileSync(path.join(stage.stage, "apps/dashboard/package.json"), "utf8"),
  ).toBe(baselineFiles["apps/dashboard/package.json"])
  expect(existsSync(path.join(stage.stage, "apps/mobile/src/index.ts"))).toBe(
    false,
  )
  expect(
    statSync(path.join(stage.stage, "apps/api/tool.sh")).mode & 0o777,
  ).toBe(0o755)
  expect(stage.inventory.length).toBeGreaterThan(10)
  expect(
    stage.inventory.reduce((total, file) => total + file.bytes, 0),
  ).toBeGreaterThan(0)
  const sourceRecord = stage.inventory.find(
    (file) => file.path === "apps/api/src/index.ts",
  )
  expect(sourceRecord).toMatchObject({
    mode: "100644",
    bytes: Buffer.byteLength(baselineFiles["apps/api/src/index.ts"]),
    sha256: createHash("sha256")
      .update(baselineFiles["apps/api/src/index.ts"])
      .digest("hex"),
  })
  expect(stage.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/)
  expect(JSON.stringify(stage.inventory)).not.toContain("committed'")
  expect(
    stage.inventory.every((file) => /^[0-9a-f]{64}$/.test(file.sha256)),
  ).toBe(true)
  const sourceIndex = stage.inventory.findIndex(
    (file) => file.path === "apps/api/src/index.ts",
  )
  const packageIndex = stage.inventory.findIndex(
    (file) => file.path === "package.json",
  )
  expect(sourceIndex).toBeGreaterThanOrEqual(0)
  expect(packageIndex).toBeGreaterThanOrEqual(0)
  expect(stage.inventory[sourceIndex]?.path).toBe("apps/api/src/index.ts")
  expect(stage.inventory[packageIndex]?.path).toBe("package.json")
})

test("revision resolution pins current HEAD and refuses dirty API inputs while materialization reads committed blobs", () => {
  const { repository, revision } = fixture()
  expect(resolveApiSourceRevision(repository)).toBe(revision)
  writeFileSync(path.join(repository, "docs-not-in-snapshot.md"), "unrelated\n")
  expect(resolveApiSourceRevision(repository)).toBe(revision)
  writeFileSync(
    path.join(repository, "apps/api/src/index.ts"),
    "export const api = 'working tree only'\n",
  )
  writeFileSync(path.join(repository, ".env.production"), "local-only-secret\n")
  mkdirSync(path.join(repository, "node_modules"), { recursive: true })
  writeFileSync(
    path.join(repository, "node_modules/local-only.txt"),
    "ignored\n",
  )
  expect(() => resolveApiSourceRevision(repository)).toThrow(
    "API release inputs",
  )
  expect(() => resolveApiSourceRevision(repository, revision)).toThrow(
    "API release inputs",
  )
  const stage = stageFor(repository, revision)
  expect(
    readFileSync(path.join(stage.stage, "apps/api/src/index.ts"), "utf8"),
  ).toBe(baselineFiles["apps/api/src/index.ts"])
  expect(existsSync(path.join(stage.stage, ".env.production"))).toBe(false)
  expect(
    existsSync(path.join(stage.stage, "node_modules/local-only.txt")),
  ).toBe(false)
})

test("rejects refs, abbreviations, and noncommit inputs", () => {
  const { repository, revision, git } = fixture()
  for (const invalid of [revision.slice(0, 12), "main", `${revision}^{tree}`]) {
    expect(() => resolveApiSourceRevision(repository, invalid)).toThrow(
      "full Git commit SHA",
    )
  }
  writeFileSync(
    path.join(repository, "apps/api/src/index.ts"),
    "export const api = 'new commit'\n",
  )
  git("add", "apps/api/src/index.ts")
  git("commit", "-qm", "new current head")
  expect(() => resolveApiSourceRevision(repository, revision)).toThrow(
    "equal current HEAD",
  )
})

test("rejects committed environment, provider, cache, dependency, and credential artifacts", () => {
  for (const forbidden of [
    "apps/api/.env.production",
    "apps/api/.vercel/project.json",
    "packages/api-core/node_modules/pkg/index.js",
    "scripts/private-key.pem",
    "packages/api-core/.cache/generated.js",
  ]) {
    const { repository, revision } = fixture({
      [forbidden]: "must not stage\n",
    })
    expect(() =>
      materializeCommittedApiStage({ repository, revision }),
    ).toThrow("forbidden environment or artifact path")
  }
})

test("rejects selected symlinks and Git submodules", () => {
  const symbolic = fixture()
  symlinkSync(
    "src/index.ts",
    path.join(symbolic.repository, "apps/api/link.ts"),
  )
  symbolic.git("add", "apps/api/link.ts")
  symbolic.git("commit", "-qm", "tracked symlink")
  const symbolicRevision = symbolic.git("rev-parse", "HEAD")
  expect(() =>
    materializeCommittedApiStage({
      repository: symbolic.repository,
      revision: symbolicRevision,
    }),
  ).toThrow("symbolic links")

  const submodule = fixture()
  submodule.git(
    "update-index",
    "--add",
    "--cacheinfo",
    `160000,${submodule.revision},apps/api/submodule`,
  )
  submodule.git("commit", "-qm", "tracked submodule")
  const submoduleRevision = submodule.git("rev-parse", "HEAD")
  expect(() =>
    materializeCommittedApiStage({
      repository: submodule.repository,
      revision: submoduleRevision,
    }),
  ).toThrow("submodules")
})

test("ignores replacement refs but refuses grafted history metadata", () => {
  const replacement = fixture()
  writeFileSync(
    path.join(replacement.repository, "apps/api/src/index.ts"),
    "export const api = 'replacement commit'\n",
  )
  replacement.git("add", ".")
  replacement.git("commit", "-qm", "replacement object")
  const replacementRevision = replacement.git("rev-parse", "HEAD")
  replacement.git("replace", replacement.revision, replacementRevision)
  expect(replacementRevision).not.toBe(replacement.revision)
  const stage = stageFor(replacement.repository, replacement.revision)
  expect(
    readFileSync(path.join(stage.stage, "apps/api/src/index.ts"), "utf8"),
  ).toBe(baselineFiles["apps/api/src/index.ts"])

  const grafted = fixture()
  const gitDir = grafted.git("rev-parse", "--absolute-git-dir")
  writeFileSync(
    path.join(gitDir, "info/grafts"),
    `${grafted.revision} ${"0".repeat(40)}\n`,
  )
  expect(() =>
    resolveApiSourceRevision(grafted.repository, grafted.revision),
  ).toThrow("graft metadata")
})

test("cleanup removes only the owned stage and is idempotent", () => {
  const { repository, revision } = fixture()
  const stage = stageFor(repository, revision)
  expect(existsSync(stage.stage)).toBe(true)
  stage.cleanup()
  expect(existsSync(stage.stage)).toBe(false)
  expect(() => stage.cleanup()).not.toThrow()
})

test("strict deploy argument parser accepts only supported environment flags", () => {
  const revision = "a".repeat(40)
  expect(parseApiDeployArguments([], "preview")).toEqual({
    prepareOnly: false,
    verifyOnly: false,
  })
  expect(parseApiDeployArguments(["--revision", revision], "preview")).toEqual({
    revision,
    prepareOnly: false,
    verifyOnly: false,
  })
  expect(parseApiDeployArguments(["--prepare-only"], "preview")).toEqual({
    prepareOnly: true,
    verifyOnly: false,
  })
  expect(parseApiDeployArguments(["--verify-only"], "preview")).toEqual({
    prepareOnly: false,
    verifyOnly: true,
  })
  expect(
    parseApiDeployArguments(["--revision", revision], "production"),
  ).toEqual({
    revision,
    prepareOnly: false,
    verifyOnly: false,
  })
  expect(() =>
    parseApiDeployArguments(["--prepare-only"], "production"),
  ).toThrow()
  expect(() =>
    parseApiDeployArguments(["--verify-only"], "production"),
  ).toThrow()
})

test("Preview can select a clean worktree only with an explicit revision", () => {
  const revision = "a".repeat(40)
  const source = ["--source-repository", "/private/tmp/ewatrade-reviewed"]
  expect(
    parseApiDeployArguments([...source, "--revision", revision], "preview"),
  ).toEqual({
    sourceRepository: source[1],
    revision,
    prepareOnly: false,
    verifyOnly: false,
  })
  for (const args of [
    source,
    [...source, "--verify-only"],
    [...source, ...source, "--revision", revision],
    ["--source-repository", "relative", "--revision", revision],
  ]) {
    expect(() => parseApiDeployArguments(args, "preview")).toThrow()
  }
  expect(() =>
    parseApiDeployArguments([...source, "--revision", revision], "production"),
  ).toThrow()
})

test("strict deploy argument parser rejects duplicates, revisions, and unknown flags before effects", () => {
  const revision = "b".repeat(40)
  const invalid: Array<[string[], "preview" | "production"]> = [
    [["--revision", revision, "--revision", revision], "preview"],
    [["--revision", "short"], "preview"],
    [[`--revision=${revision}`], "preview"],
    [["--revision"], "production"],
    [["--prepare-only", "--prepare-only"], "preview"],
    [["--prepare-only", "--verify-only"], "preview"],
    [["--verify-only", "--revision", revision], "preview"],
    [["--revision", revision, "--verify-only"], "preview"],
    [["--unknown"], "preview"],
  ]
  for (const [args, environment] of invalid)
    expect(() => parseApiDeployArguments(args, environment)).toThrow()
  expect(() => parseApiDeployArguments([], "staging" as never)).toThrow(
    "arguments are invalid",
  )
})
