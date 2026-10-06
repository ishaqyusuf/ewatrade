import { createHash } from "node:crypto"
import { WEB_TARGETS } from "../.release/ewatrade-provider-bundle"
import {
  type ProviderGet,
  providerGetClient,
  providerRecord,
} from "./release-provider-http"

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const SHA256 = /^[0-9a-f]{64}$/
const MAX_FILES = 64
const MAX_TREE_NODES = 2048
const MAX_FILE_BYTES = 3 * 1024 * 1024
const MAX_TOTAL_BYTES = 12 * 1024 * 1024
const MAX_TREE_DEPTH = 64
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9_-]{1,124}$/
const REGULAR_MODES = new Set([0o100644, 0o100755])
const TARGET_ROOTS: Record<string, string> = {
  "dashboard-web": "apps/dashboard",
  "api-web": "apps/api",
  "marketing-web": "apps/marketing",
}

export type ExpectedVercelFile = {
  path: string
  sha256: string
  mode: number
}

export type VercelFileObservation = {
  version: 1
  provider: "vercel"
  targetId: string
  environment: "preview" | "production"
  deploymentId: string
  projectId: string
  teamId: string
  observedAt: string
  files: Array<{
    path: string
    expectedSha256: string
    observedSha256: string | null
    expectedMode: number
    observedMode: number | null
    matches: boolean
  }>
  treeFingerprint: string
  matchedFileCount: number
  treeComplete: false
  inventoryComplete: false
  sourceVerified: false
  releaseReady: false
  blockers: string[]
}

function fail(message = "Vercel file observation is invalid."): never {
  throw new Error(message)
}

function hash(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

function boundedString(value: unknown, max = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
}

function hasControlCharacter(value: string) {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function lexical(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 32) fail()
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value)
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value)
  if (Array.isArray(value)) {
    if (value.length > 4096) fail()
    return `[${value.map((item) => canonicalJson(item, depth + 1)).join(",")}]`
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => lexical(left, right),
    )
    if (entries.length > 4096) fail()
    return `{${entries
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${canonicalJson(item, depth + 1)}`,
      )
      .join(",")}}`
  }
  fail()
}

function deploymentProjection(record: Record<string, unknown>) {
  const projection: Record<string, unknown> = {}
  for (const key of [
    "id",
    "projectId",
    "ownerId",
    "target",
    "readyState",
    "url",
    "createdAt",
    "ready",
    "gitSource",
    "meta",
    "builds",
    "functions",
    "routes",
    "config",
  ]) {
    if (Object.hasOwn(record, key)) projection[key] = record[key]
  }
  const encoded = canonicalJson(projection)
  if (Buffer.byteLength(encoded) > 1024 * 1024) fail()
  return hash(encoded)
}

function assertDeployment(
  value: unknown,
  input: {
    id: string
    projectId: string
    teamId: string
    environment: "preview" | "production"
  },
) {
  const record = providerRecord(value)
  const projectId = record.projectId ?? providerRecord(record.project).id
  if (
    record.id !== input.id ||
    projectId !== input.projectId ||
    record.ownerId !== input.teamId ||
    record.readyState !== "READY" ||
    (input.environment === "production"
      ? record.target !== "production"
      : record.target !== null) ||
    !boundedString(record.url, 253) ||
    !/^[a-z0-9.-]+\.vercel\.app$/.test(record.url)
  )
    fail("Vercel deployment ownership or lifecycle changed.")
  return { url: record.url, fingerprint: deploymentProjection(record) }
}

function safePublicPath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    hasControlCharacter(value)
  )
    return false
  const parts = value.split("/")
  if (
    parts.some(
      (part) => !part || part === "." || part === ".." || part.startsWith("."),
    )
  )
    return false
  const lower = value.toLowerCase()
  return !(
    parts.some((part) =>
      /^(?:credentials?|secrets?|private|keys?|node_modules|\.trigger|\.cache|\.next|\.expo|\.turbo|dist|build)$/i.test(
        part,
      ),
    ) ||
    /(^|\/)(?:\.env(?:\.|$)|id_rsa(?:\.pub)?$|.*\.(?:pem|p12|pfx|key))/.test(
      lower,
    ) ||
    /(^|\/)(?:credentials?|secrets?|private[-_]?key)(?:\.|$)/.test(lower)
  )
}

type TreeEntry = {
  path: string
  type: string
  mode: number
  uid: string | null
}

function inspectTree(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_TREE_NODES)
    fail("Vercel deployment file tree is unavailable or oversized.")
  const entries: TreeEntry[] = []
  const blockers = new Set<string>()
  const paths = new Set<string>()
  const visit = (nodes: unknown[], parent: string, depth: number) => {
    if (
      depth > MAX_TREE_DEPTH ||
      nodes.length + entries.length > MAX_TREE_NODES
    )
      fail("Vercel deployment file tree is oversized.")
    for (const item of nodes) {
      const node = providerRecord(item)
      const name = node.name
      if (
        !boundedString(name, 255) ||
        name.includes("/") ||
        name.includes("\\") ||
        name === "." ||
        name === ".." ||
        hasControlCharacter(name) ||
        !Number.isSafeInteger(node.mode) ||
        (node.mode as number) < 0 ||
        typeof node.type !== "string"
      )
        fail("Vercel deployment file tree is malformed.")
      const path = parent ? `${parent}/${name}` : name
      if (paths.has(path)) fail("Vercel deployment file tree is ambiguous.")
      paths.add(path)
      const type = node.type
      const uid = node.uid
      if (type === "file") {
        if (
          !boundedString(uid, 128) ||
          !ID.test(uid) ||
          !REGULAR_MODES.has(node.mode as number)
        )
          fail("Vercel deployment file identifier is invalid.")
      } else if (type === "directory") {
        if (((node.mode as number) & 0o170000) !== 0o040000)
          fail("Vercel deployment directory mode is invalid.")
        if (Object.hasOwn(node, "children")) {
          if (!Array.isArray(node.children))
            fail("Vercel deployment directory listing is malformed.")
        } else {
          blockers.add("directory-children-unavailable")
        }
      } else {
        blockers.add("unsupported-deployment-file-node")
      }
      entries.push({
        path,
        type,
        mode: node.mode as number,
        uid: type === "file" ? (uid as string) : null,
      })
      if (entries.length > MAX_TREE_NODES)
        fail("Vercel deployment file tree is oversized.")
      if (type === "directory" && Array.isArray(node.children))
        visit(node.children, path, depth + 1)
    }
  }
  visit(value, "", 0)
  const normalized = entries
    .slice()
    .sort((a, b) => lexical(a.path, b.path))
    .map((entry) => [entry.path, entry.type, entry.mode, entry.uid])
  return {
    entries,
    blockers,
    fingerprint: hash(
      `ewatrade-vercel-file-tree-v1\n${canonicalJson(normalized)}`,
    ),
  }
}

function decodeCanonicalBase64(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    fail("Vercel deployment file content is malformed.")
  const bytes = Buffer.from(value, "base64")
  if (bytes.byteLength > MAX_FILE_BYTES || bytes.toString("base64") !== value)
    fail("Vercel deployment file content is oversized or noncanonical.")
  return bytes
}

/** Reads only allowlisted public files and never claims complete artifact provenance. */
export async function observeVercelDeploymentFiles(input: {
  targetId: string
  environment: "preview" | "production"
  deploymentId: string
  expectedFiles: ExpectedVercelFile[]
  get?: ProviderGet
  now?: () => number
}): Promise<VercelFileObservation> {
  const target = WEB_TARGETS.find((item) => item.targetId === input.targetId)
  if (
    !target ||
    !target.teamId ||
    !["preview", "production"].includes(input.environment) ||
    !DEPLOYMENT_ID.test(input.deploymentId) ||
    !Array.isArray(input.expectedFiles) ||
    input.expectedFiles.length < 1 ||
    input.expectedFiles.length > MAX_FILES
  )
    fail("Vercel file observation input is invalid.")
  const seen = new Set<string>()
  for (const file of input.expectedFiles) {
    if (
      !safePublicPath(file?.path) ||
      seen.has(file.path) ||
      !SHA256.test(file.sha256) ||
      !REGULAR_MODES.has(file.mode)
    )
      fail("Expected public deployment file is invalid.")
    seen.add(file.path)
  }
  const get =
    input.get ?? providerGetClient("vercel", process.env.VERCEL_TOKEN ?? "")
  const query = { teamId: target.teamId }
  const project = providerRecord(
    await get(`/v9/projects/${target.projectId}`, query),
  )
  if (
    project.id !== target.projectId ||
    project.accountId !== target.teamId ||
    project.rootDirectory !== TARGET_ROOTS[target.targetId]
  )
    fail("Vercel project ownership mismatch.")
  const deploymentPath = `/v13/deployments/${input.deploymentId}`
  const first = assertDeployment(
    await get(deploymentPath, { ...query, withGitRepoInfo: "true" }),
    {
      id: input.deploymentId,
      projectId: target.projectId,
      teamId: target.teamId,
      environment: input.environment,
    },
  )
  const tree = inspectTree(
    await get(`/v6/deployments/${input.deploymentId}/files`, query),
  )
  const entryByPath = new Map(tree.entries.map((entry) => [entry.path, entry]))
  const files: VercelFileObservation["files"] = []
  let totalBytes = 0
  const blockers = new Set(tree.blockers)
  for (const expected of input.expectedFiles) {
    const entry = entryByPath.get(expected.path)
    if (!entry || entry.type !== "file" || !entry.uid) {
      files.push({
        path: expected.path,
        expectedSha256: expected.sha256,
        observedSha256: null,
        expectedMode: expected.mode,
        observedMode: entry?.mode ?? null,
        matches: false,
      })
      blockers.add("requested-public-file-unavailable")
      continue
    }
    if (entry.mode !== expected.mode) {
      files.push({
        path: expected.path,
        expectedSha256: expected.sha256,
        observedSha256: null,
        expectedMode: expected.mode,
        observedMode: entry.mode,
        matches: false,
      })
      blockers.add("requested-public-file-mode-mismatch")
      continue
    }
    const content = providerRecord(
      await get(
        `/v8/deployments/${input.deploymentId}/files/${entry.uid}`,
        query,
      ),
    )
    if (Object.keys(content).length !== 1 || !Object.hasOwn(content, "data"))
      fail("Vercel deployment file response is malformed.")
    const bytes = decodeCanonicalBase64(content.data)
    totalBytes += bytes.byteLength
    if (totalBytes > MAX_TOTAL_BYTES)
      fail("Requested deployment file bytes exceed the observation limit.")
    const observedSha256 = hash(bytes)
    const matches = observedSha256 === expected.sha256
    if (!matches) blockers.add("requested-public-file-content-mismatch")
    files.push({
      path: expected.path,
      expectedSha256: expected.sha256,
      observedSha256,
      expectedMode: expected.mode,
      observedMode: entry.mode,
      matches,
    })
  }
  const second = assertDeployment(
    await get(deploymentPath, { ...query, withGitRepoInfo: "true" }),
    {
      id: input.deploymentId,
      projectId: target.projectId,
      teamId: target.teamId,
      environment: input.environment,
    },
  )
  if (first.url !== second.url || first.fingerprint !== second.fingerprint)
    fail(
      "Vercel deployment identity or selected state changed during observation.",
    )
  blockers.add("deployment-inventory-not-complete")
  const now = (input.now ?? Date.now)()
  if (!Number.isSafeInteger(now) || now < 0) fail()
  return {
    version: 1,
    provider: "vercel",
    targetId: input.targetId,
    environment: input.environment,
    deploymentId: input.deploymentId,
    projectId: target.projectId,
    teamId: target.teamId,
    observedAt: new Date(now).toISOString(),
    files,
    treeFingerprint: tree.fingerprint,
    matchedFileCount: files.filter((file) => file.matches).length,
    treeComplete: false,
    inventoryComplete: false,
    sourceVerified: false,
    releaseReady: false,
    blockers: [...blockers].sort(),
  }
}
