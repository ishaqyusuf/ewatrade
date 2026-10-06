import { createHash } from "node:crypto"
import { lstatSync, readFileSync, realpathSync } from "node:fs"
import path from "node:path"

const MAX_INVENTORY_FILES = 50_000
const MAX_WORKSPACES = 2_048
const MAX_MANIFEST_BYTES = 1024 * 1024
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const WORKSPACE_PATH =
  /^(apps|packages|tooling)\/[a-z0-9][a-z0-9._-]*\/package\.json$/

function fail(reason) {
  throw new Error(`API_BUILD_WORKSPACE_INVALID_${reason}`)
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasControlCharacters(value) {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function safeName(value) {
  return (
    typeof value === "string" &&
    value.length <= 214 &&
    PACKAGE_NAME.test(value) &&
    !hasControlCharacters(value) &&
    !value.split("/").some((part) => part === "." || part === "..")
  )
}

function safeRelativePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4096 &&
    !path.isAbsolute(value) &&
    !value.includes("\\") &&
    !hasControlCharacters(value) &&
    value.split("/").every((part) => part && part !== "." && part !== "..")
  )
}

function uniqueJsonKeys(source) {
  const tokens = source.match(/"(?:[^"\\]|\\.)*"|[{}[\],:]|[^\s{}[\],:]+/g)
  const containers = []
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token === "{") containers.push(new Set())
    else if (token === "[") containers.push(null)
    else if (token === "}" || token === "]") containers.pop()
    else if (token.startsWith('"') && tokens[index + 1] === ":") {
      const keys = containers.at(-1)
      const key = JSON.parse(token)
      if (keys.has(key)) fail("DUPLICATE_JSON_KEY")
      keys.add(key)
    }
    if (containers.length > 64) fail("METADATA_DEPTH")
  }
}

function dependencies(value) {
  if (value === undefined) return []
  if (!record(value)) fail("DEPENDENCIES")
  return Object.entries(value).map(([name, version]) => {
    if (
      !safeName(name) ||
      typeof version !== "string" ||
      !version ||
      version.length > 2048 ||
      version.trim() !== version ||
      hasControlCharacters(version)
    )
      fail("DEPENDENCIES")
    if (
      version.startsWith("workspace:") &&
      !/^workspace:(?:\*|\^|~|[~^]?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)$/.test(
        version,
      )
    )
      fail("WORKSPACE_RANGE")
    return { name, workspace: version.startsWith("workspace:") }
  })
}

function readManifest(stage, item) {
  if (
    !["100644", "100755"].includes(item.mode) ||
    !Number.isSafeInteger(item.bytes) ||
    item.bytes < 2 ||
    item.bytes > MAX_MANIFEST_BYTES ||
    typeof item.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(item.sha256)
  )
    fail("INVENTORY_METADATA")
  const parts = item.path.split("/")
  let filename = stage
  try {
    for (let index = 0; index < parts.length; index++) {
      filename = path.join(filename, parts[index])
      const stat = lstatSync(filename)
      if (stat.isSymbolicLink()) fail("SYMLINK")
      if (index < parts.length - 1) {
        if (!stat.isDirectory()) fail("PATH")
      } else if (!stat.isFile() || stat.size !== item.bytes) fail("FILE")
    }
    const bytes = readFileSync(filename)
    if (
      bytes.length !== item.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== item.sha256
    )
      fail("CHANGED_MANIFEST")
    const source = bytes.toString("utf8")
    if (!Buffer.from(source, "utf8").equals(bytes)) fail("ENCODING")
    let manifest
    try {
      manifest = JSON.parse(source)
    } catch {
      fail("JSON")
    }
    uniqueJsonKeys(source)
    if (!record(manifest) || !safeName(manifest.name)) fail("NAME")
    if (
      (Object.hasOwn(manifest, "private") &&
        typeof manifest.private !== "boolean") ||
      (Object.hasOwn(manifest, "version") &&
        (typeof manifest.version !== "string" || !manifest.version.trim()))
    )
      fail("METADATA")
    return {
      name: manifest.name,
      directory: parts.slice(0, -1).join("/"),
      dependencies: [
        ...dependencies(manifest.dependencies),
        ...dependencies(manifest.devDependencies),
      ],
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("API_BUILD_WORKSPACE_INVALID_")
    )
      throw error
    fail("FILE")
  }
}

/** Select compiler dependencies from committed inventory, never host packages. */
export function apiBuildWorkspaceFilters({ stage, inventory }) {
  if (
    typeof stage !== "string" ||
    !path.isAbsolute(stage) ||
    path.resolve(stage) !== stage ||
    !Array.isArray(inventory) ||
    inventory.length > MAX_INVENTORY_FILES
  )
    fail("INPUT")
  try {
    if (!lstatSync(stage).isDirectory() || realpathSync(stage) !== stage)
      fail("STAGE")
  } catch {
    fail("STAGE")
  }
  const seenPaths = new Set()
  const byName = new Map()
  const byDirectory = new Map()
  for (const item of inventory) {
    if (!record(item) || !safeRelativePath(item.path)) fail("PATH")
    if (seenPaths.has(item.path)) fail("DUPLICATE_PATH")
    seenPaths.add(item.path)
    // Other committed files are not read. A top-level workspace manifest must
    // have a literal directory name that cannot expand Bun's filter grammar.
    if (!/^(apps|packages|tooling)\/[^/]+\/package\.json$/.test(item.path))
      continue
    if (!WORKSPACE_PATH.test(item.path)) fail("FILTER_PATH")
    const workspace = readManifest(stage, item)
    if (byName.has(workspace.name)) fail("DUPLICATE_NAME")
    byName.set(workspace.name, workspace)
    byDirectory.set(workspace.directory, workspace)
    if (byName.size > MAX_WORKSPACES) fail("COUNT")
  }
  for (const [directory, name] of [
    ["apps/api", "@ewatrade/api"],
    ["packages/db", "@ewatrade/db"],
  ]) {
    if (byDirectory.get(directory)?.name !== name) fail("REQUIRED")
  }
  const selected = new Set()
  const pending = ["@ewatrade/api", "@ewatrade/db"]
  while (pending.length) {
    const name = pending.pop()
    if (selected.has(name)) continue
    const workspace = byName.get(name)
    selected.add(name)
    for (const dependency of workspace.dependencies) {
      if (byName.has(dependency.name)) pending.push(dependency.name)
      else if (dependency.workspace) fail("UNRESOLVED")
    }
  }
  return Object.freeze(
    [...selected]
      .map((name) => `--filter=./${byName.get(name).directory}`)
      .sort(),
  )
}
