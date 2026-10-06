import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"

const SNAPSHOT_PARENT = "/private/tmp"
const SNAPSHOT_PREFIX = "ewatrade-api-source-"
const SHA1 = /^[0-9a-f]{40}$/
const OBJECT_ID = /^[0-9a-f]{40}$/
const MAX_TREE_BYTES = 64 * 1024 * 1024
const MAX_SOURCE_BYTES = 512 * 1024 * 1024
const MAX_SOURCE_FILES = 50_000
const MAX_OBJECT_OUTPUT = MAX_SOURCE_BYTES + MAX_SOURCE_FILES * 96
const GIT_TIMEOUT_MS = 120_000
const EXPECTED_ROOT_FILES = [
  "package.json",
  "bun.lock",
  "apps/api/package.json",
]

const GIT_ENV = Object.freeze({
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  HOME: "/private/tmp",
  LC_ALL: "C",
  LANG: "C",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_NO_LAZY_FETCH: "1",
  GIT_TERMINAL_PROMPT: "0",
  GIT_ATTR_NOSYSTEM: "1",
})

function fail(message = "Committed API source snapshot is invalid.") {
  throw new Error(message)
}

function runGit(repository, args, options = {}) {
  try {
    return execFileSync(
      "git",
      [
        "--no-replace-objects",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.hooksPath=/dev/null",
        "-C",
        repository,
        ...args,
      ],
      {
        env: GIT_ENV,
        encoding: options.encoding ?? "buffer",
        input: options.input,
        maxBuffer: options.maxBuffer ?? MAX_TREE_BYTES,
        timeout: GIT_TIMEOUT_MS,
        stdio: ["pipe", "pipe", "ignore"],
      },
    )
  } catch {
    fail("Committed Git source could not be read within bounds.")
  }
}

function repositoryRoot(repository) {
  let resolved
  try {
    resolved = realpathSync(repository)
  } catch {
    fail("Git repository is unavailable.")
  }
  const top = String(
    runGit(resolved, ["rev-parse", "--show-toplevel"], { encoding: "utf8" }),
  ).trim()
  if (!top) fail("Git repository root is unavailable.")
  return realpathSync(top)
}

function assertNoGrafts(repository) {
  const gitDir = String(
    runGit(repository, ["rev-parse", "--absolute-git-dir"], {
      encoding: "utf8",
    }),
  ).trim()
  if (!gitDir) fail("Git metadata directory is unavailable.")
  const candidate = path.join(gitDir, "info", "grafts")
  try {
    const stat = lstatSync(candidate)
    if (!stat.isFile() || stat.isSymbolicLink())
      fail("Git graft metadata is not supported for source snapshots.")
    if (readFileSync(candidate).byteLength > 0)
      fail("Git graft metadata is not supported for source snapshots.")
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
}

function validateCommit(repository, revision) {
  if (typeof revision !== "string" || !SHA1.test(revision))
    fail("An exact full Git commit SHA is required.")
  const actual = String(
    runGit(repository, ["rev-parse", "--verify", `${revision}^{commit}`], {
      encoding: "utf8",
    }),
  ).trim()
  if (actual !== revision) fail("The requested Git revision is not exact.")
  const kind = String(
    runGit(repository, ["cat-file", "-t", revision], { encoding: "utf8" }),
  ).trim()
  if (kind !== "commit") fail("The requested Git revision is not a commit.")
  return revision
}

function isEnvironmentOrSecretPath(filePath) {
  const parts = filePath.split("/")
  const base = (parts.at(-1) ?? "").toLowerCase()
  const lowerParts = parts.map((part) => part.toLowerCase())
  return (
    lowerParts.some((part) => part.startsWith(".") && part !== ".gitignore") ||
    lowerParts.some((part) =>
      /^(?:\.env(?:\..*)?|\.vercel|\.expo|\.eas|\.trigger|\.git|\.turbo|\.cache|\.next|\.bun|node_modules|\.pnpm|\.yarn|coverage|dist|build|vendor)$/.test(
        part,
      ),
    ) ||
    /^(?:credentials?|secrets?|private[-_]?key|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?)$/.test(
      base,
    ) ||
    /\.(?:pem|p12|pfx|key|keystore|mobileprovision)$/.test(base)
  )
}

function isSelected(filePath) {
  if (
    [
      "package.json",
      "bun.lock",
      "bunfig.toml",
      "tsconfig.json",
      "turbo.json",
      "biome.json",
      "biome.jsonc",
    ].includes(filePath)
  )
    return true
  return (
    /^apps\/[^/]+\/package\.json$/.test(filePath) ||
    /^apps\/api\/.+/.test(filePath) ||
    /^(?:packages|scripts|tooling|patches)\/.+/.test(filePath)
  )
}

function validateRelativePath(filePath) {
  if (
    typeof filePath !== "string" ||
    !filePath ||
    filePath.startsWith("/") ||
    filePath.includes("\\") ||
    filePath.includes("\0") ||
    hasControlCharacter(filePath) ||
    filePath.split("/").some((part) => !part || part === "." || part === "..")
  )
    fail("Git source contains an unsafe tracked path.")
}

function hasControlCharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function parseTree(tree) {
  if (tree.byteLength > MAX_TREE_BYTES)
    fail("Committed API source tree is oversized.")
  const decoded = tree.toString("utf8")
  if (!Buffer.from(decoded, "utf8").equals(tree))
    fail("Committed Git tree path encoding is not valid UTF-8.")
  const records = []
  const seen = new Set()
  for (const raw of decoded.split("\0")) {
    if (!raw) continue
    const tab = raw.indexOf("\t")
    if (tab < 0) fail("Committed Git tree record is malformed.")
    const [mode, kind, object] = raw.slice(0, tab).split(" ")
    const filePath = raw.slice(tab + 1)
    if (seen.has(filePath)) fail("Committed Git tree has duplicate paths.")
    seen.add(filePath)
    if (!isSelected(filePath)) continue
    validateRelativePath(filePath)
    if (isEnvironmentOrSecretPath(filePath))
      fail(
        "Committed API source contains a forbidden environment or artifact path.",
      )
    if (mode === "160000" || kind === "commit")
      fail("API source snapshot cannot include submodules.")
    if (mode === "120000")
      fail("API source snapshot cannot include symbolic links.")
    if (
      kind !== "blob" ||
      !["100644", "100755"].includes(mode) ||
      !OBJECT_ID.test(object ?? "")
    )
      fail("API source snapshot contains an unsupported Git object.")
    records.push({ path: filePath, mode, object })
    if (records.length > MAX_SOURCE_FILES)
      fail("Committed API source snapshot has too many files.")
  }
  const selectedPaths = new Set(records.map((record) => record.path))
  for (const expected of EXPECTED_ROOT_FILES) {
    if (!selectedPaths.has(expected))
      fail(
        "Committed API source snapshot is missing a required workspace input.",
      )
  }
  for (const root of ["apps", "packages", "tooling"]) {
    const workspaceDirs = new Set(
      records
        .filter((record) => record.path.startsWith(`${root}/`))
        .map((record) => record.path.split("/").slice(0, 2).join("/")),
    )
    for (const directory of workspaceDirs) {
      const manifest = `${directory}/package.json`
      if (!selectedPaths.has(manifest))
        fail(
          "Committed API source snapshot has an incomplete workspace manifest set.",
        )
    }
  }
  return records
}

function readBlobs(repository, records) {
  const objects = [...new Set(records.map((record) => record.object))]
  const input = `${objects.join("\n")}\n`
  const result = spawnSync(
    "git",
    [
      "--no-replace-objects",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.hooksPath=/dev/null",
      "-C",
      repository,
      "cat-file",
      "--batch",
    ],
    {
      env: GIT_ENV,
      input,
      maxBuffer: MAX_OBJECT_OUTPUT,
      timeout: GIT_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "ignore"],
    },
  )
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout))
    fail("Committed Git source blobs could not be read within bounds.")
  const output = result.stdout
  const blobs = new Map()
  let offset = 0
  for (const object of objects) {
    const headerEnd = output.indexOf(10, offset)
    if (headerEnd < 0) fail("Git object response header is malformed.")
    const [receivedObject, kind, sizeText] = output
      .toString("utf8", offset, headerEnd)
      .split(" ")
    const size = Number(sizeText)
    offset = headerEnd + 1
    if (
      receivedObject !== object ||
      kind !== "blob" ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > MAX_SOURCE_BYTES ||
      offset + size >= output.byteLength
    )
      fail("Git object response size or type is malformed.")
    const bytes = Buffer.from(output.subarray(offset, offset + size))
    blobs.set(object, bytes)
    offset += size + 1
    if (output[offset - 1] !== 10)
      fail("Git object response framing is malformed.")
  }
  if (offset !== output.byteLength)
    fail("Git object response contains trailing data.")
  return blobs
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex")
}

function ownedStage(pathname, identity) {
  const stat = lstatSync(pathname)
  const ownerMatches =
    typeof process.getuid !== "function" || stat.uid === process.getuid()
  return (
    stat.isDirectory() &&
    !stat.isSymbolicLink() &&
    (stat.mode & 0o777) === 0o700 &&
    ownerMatches &&
    (!identity ||
      (stat.dev === identity.dev &&
        stat.ino === identity.ino &&
        stat.uid === identity.uid)) &&
    path.dirname(pathname) === SNAPSHOT_PARENT &&
    path.basename(pathname).startsWith(SNAPSHOT_PREFIX)
  )
}

/** Resolve only the current full HEAD SHA after confirming selected API inputs are clean. */
export function resolveApiSourceRevision(repository, requestedRevision) {
  const root = repositoryRoot(repository)
  assertNoGrafts(root)
  if (
    requestedRevision !== undefined &&
    (typeof requestedRevision !== "string" || !SHA1.test(requestedRevision))
  )
    fail("An exact full Git commit SHA is required.")
  const head = String(
    runGit(root, ["rev-parse", "--verify", "HEAD"], { encoding: "utf8" }),
  ).trim()
  validateCommit(root, head)
  if (requestedRevision !== undefined && requestedRevision !== head)
    fail("The selected API source revision must equal current HEAD.")
  const status = runGit(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ])
  const entries = status.toString("utf8").split("\0").filter(Boolean)
  const dirtySources = []
  for (let index = 0; index < entries.length; index += 1) {
    const item = entries[index]
    const filePath = item.slice(3)
    if (isSelected(filePath)) dirtySources.push(filePath)
    const statusCode = item.slice(0, 2)
    if (/[RC]/.test(statusCode) && entries[index + 1]) {
      const previous = entries[index + 1]
      if (isSelected(previous)) dirtySources.push(previous)
      index += 1
    }
  }
  if (dirtySources.length)
    fail("Commit or remove changed API release inputs before source staging.")
  return validateCommit(root, head)
}

/** Strict pure parser for wrapper arguments; it performs no filesystem/provider effects. */
export function parseApiDeployArguments(args, environment) {
  if (
    !Array.isArray(args) ||
    args.length > 8 ||
    !["preview", "production"].includes(environment)
  )
    fail("API deployment arguments are invalid.")
  let revision
  let sourceRepository
  let prepareOnly = false
  let verifyOnly = false
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--source-repository" && environment === "preview") {
      const value = args[index + 1]
      if (
        sourceRepository !== undefined ||
        typeof value !== "string" ||
        !path.isAbsolute(value)
      )
        fail("API Preview source repository must be one absolute path.")
      sourceRepository = value
      index += 1
      continue
    }
    if (argument === "--revision") {
      if (revision !== undefined || index + 1 >= args.length)
        fail("API deployment revision argument is invalid.")
      const value = args[index + 1]
      if (typeof value !== "string" || !SHA1.test(value))
        fail("API deployment revision must be a full commit SHA.")
      revision = value
      index += 1
      continue
    }
    if (argument === "--prepare-only" && environment === "preview") {
      if (prepareOnly || verifyOnly)
        fail("API Preview preparation flags are mutually exclusive.")
      prepareOnly = true
      continue
    }
    if (argument === "--verify-only" && environment === "preview") {
      if (verifyOnly || prepareOnly || revision !== undefined)
        fail("API Preview verification flags cannot select a revision.")
      verifyOnly = true
      continue
    }
    fail("Unknown API deployment argument.")
  }
  if (verifyOnly && revision !== undefined)
    fail("API Preview verification cannot select a revision.")
  if (sourceRepository && (!revision || verifyOnly))
    fail(
      "API Preview source repository requires a pinned revision and cannot be used for verification.",
    )
  return {
    ...(revision ? { revision } : {}),
    ...(sourceRepository ? { sourceRepository } : {}),
    prepareOnly,
    verifyOnly,
  }
}

/** Materialize selected committed workspace inputs without consulting working-tree contents. */
export function materializeCommittedApiStage({ repository, revision }) {
  const root = repositoryRoot(repository)
  assertNoGrafts(root)
  validateCommit(root, revision)
  const tree = runGit(root, ["ls-tree", "-r", "-z", "--full-tree", revision])
  const records = parseTree(tree)
  const blobs = readBlobs(root, records)
  const totalBytes = records.reduce((total, record) => {
    const blob = blobs.get(record.object)
    if (!blob) fail("Committed source blob is missing.")
    return total + blob.byteLength
  }, 0)
  if (totalBytes > MAX_SOURCE_BYTES)
    fail("Committed API source snapshot is oversized.")

  const stage = mkdtempSync(path.join(SNAPSHOT_PARENT, SNAPSHOT_PREFIX))
  const stageIdentity = lstatSync(stage)
  try {
    const files = []
    for (const record of records) {
      const content = blobs.get(record.object)
      if (!content) fail("Committed source blob is missing.")
      const destination = path.join(stage, record.path)
      mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
      writeFileSync(destination, content, {
        flag: "wx",
        mode: record.mode === "100755" ? 0o755 : 0o644,
      })
      const stat = lstatSync(destination)
      const materialized = readFileSync(destination)
      const expectedMode = record.mode === "100755" ? 0o755 : 0o644
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        (stat.mode & 0o777) !== expectedMode ||
        !materialized.equals(content)
      )
        fail("Materialized source contains a nonregular file.")
      files.push({
        path: record.path,
        mode: record.mode,
        bytes: materialized.byteLength,
        sha256: hash(materialized),
      })
    }
    files.sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    )
    const inventory = Object.freeze(files.map((file) => Object.freeze(file)))
    const sourceFingerprint = hash(
      `ewatrade-api-source-stage-v1\n${JSON.stringify(inventory)}`,
    )
    if (!ownedStage(stage, stageIdentity))
      fail("Owned source stage directory is invalid.")
    let cleaned = false
    return Object.freeze({
      stage,
      revision,
      inventory,
      sourceFingerprint,
      cleanup() {
        if (cleaned) return
        if (!ownedStage(stage, stageIdentity))
          fail("Refusing to remove a source directory that is not owned.")
        rmSync(stage, { recursive: true, force: false })
        cleaned = true
      },
    })
  } catch (error) {
    if (ownedStage(stage, stageIdentity))
      rmSync(stage, { recursive: true, force: true })
    throw error
  }
}
