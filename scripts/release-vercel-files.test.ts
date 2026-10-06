import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { WEB_TARGETS } from "../.release/ewatrade-provider-bundle"
import type { ProviderGet } from "./release-provider-http"
import {
  type ExpectedVercelFile,
  observeVercelDeploymentFiles,
} from "./release-vercel-files"

const target = (() => {
  const configured = WEB_TARGETS.find((item) => item.targetId === "api-web")
  if (!configured) throw new Error("API Vercel fixture is missing.")
  return configured
})()
const deploymentId = "dpl_file_observer_test"
const teamId = target.teamId
if (!teamId) throw new Error("Vercel team fixture is missing.")
const bytes = Buffer.from('{"name":"public-api-artifact"}\n')
const digest = createHash("sha256").update(bytes).digest("hex")
const mode = 33188
const fileUid = "opaque_file_id_not_a_digest"
const filePath = "src/package.json"
const expectedFiles: ExpectedVercelFile[] = [
  { path: filePath, sha256: digest, mode },
]

function tree(children: unknown[] = []) {
  return [
    {
      name: "src",
      type: "directory",
      mode: 16877,
      children,
    },
    {
      name: "out",
      type: "directory",
      mode: 16877,
      children: [],
    },
  ]
}

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    id: deploymentId,
    projectId: target.projectId,
    ownerId: teamId,
    readyState: "READY",
    target: null,
    url: "api-preview.example.vercel.app",
    createdAt: 1_790_000_000_000,
    ready: 1_790_000_000_500,
    gitSource: { sha: "a".repeat(40) },
    builds: [{ src: "src/package.json", use: "@vercel/static" }],
    ...overrides,
  }
}

function adapter(
  options: {
    fileTree?: unknown
    content?: unknown
    project?: Record<string, unknown>
    firstDeployment?: Record<string, unknown>
    secondDeployment?: Record<string, unknown>
    onGet?: (path: string, query: Record<string, string>) => void
  } = {},
) {
  const calls: Array<{ path: string; query: Record<string, string> }> = []
  let detailCount = 0
  const get: ProviderGet = async (path, query = {}) => {
    calls.push({ path, query })
    options.onGet?.(path, query)
    if (path === `/v9/projects/${target.projectId}`)
      return {
        id: target.projectId,
        accountId: teamId,
        rootDirectory: "apps/api",
        ...options.project,
      }
    if (path === `/v13/deployments/${deploymentId}`) {
      detailCount += 1
      return detailCount === 1
        ? { ...deployment(), ...options.firstDeployment }
        : { ...deployment(), ...options.secondDeployment }
    }
    if (path === `/v6/deployments/${deploymentId}/files`)
      return (
        options.fileTree ??
        tree([{ name: "package.json", type: "file", mode, uid: fileUid }])
      )
    if (path.startsWith(`/v8/deployments/${deploymentId}/files/`))
      return options.content ?? { data: bytes.toString("base64") }
    throw new Error(`Unexpected read path: ${path}`)
  }
  return { get, calls }
}

function input(
  overrides: Partial<Parameters<typeof observeVercelDeploymentFiles>[0]> = {},
) {
  return {
    targetId: "api-web",
    environment: "preview" as const,
    deploymentId,
    expectedFiles,
    now: () => 1_790_000_001_000,
    ...overrides,
  }
}

test("reads only allowlisted bytes after ownership checks and returns hash-only incomplete evidence", async () => {
  const fixture = adapter()
  const result = await observeVercelDeploymentFiles({
    ...input(),
    get: fixture.get,
  })
  expect(fixture.calls.map(({ path }) => path)).toEqual([
    `/v9/projects/${target.projectId}`,
    `/v13/deployments/${deploymentId}`,
    `/v6/deployments/${deploymentId}/files`,
    `/v8/deployments/${deploymentId}/files/${fileUid}`,
    `/v13/deployments/${deploymentId}`,
  ])
  expect(fixture.calls.every(({ query }) => query.teamId === teamId)).toBe(true)
  expect(result).toMatchObject({
    targetId: "api-web",
    environment: "preview",
    deploymentId,
    projectId: target.projectId,
    teamId,
    matchedFileCount: 1,
    treeComplete: false,
    inventoryComplete: false,
    sourceVerified: false,
    releaseReady: false,
    files: [
      {
        path: filePath,
        expectedSha256: digest,
        observedSha256: digest,
        expectedMode: mode,
        observedMode: mode,
        matches: true,
      },
    ],
  })
  expect(result.blockers).toContain("deployment-inventory-not-complete")
  expect(JSON.stringify(result)).not.toContain(bytes.toString())
  expect(JSON.stringify(result)).not.toContain(fileUid)
  expect(JSON.stringify(result)).not.toContain("gitSource")
})

test("does not read content when project or deployment ownership is wrong", async () => {
  for (const fixture of [
    adapter({ project: { accountId: "foreign-team" } }),
    adapter({ firstDeployment: { ownerId: "foreign-team" } }),
    adapter({ firstDeployment: { projectId: "foreign-project" } }),
    adapter({ firstDeployment: { readyState: "BUILDING" } }),
  ]) {
    await expect(
      observeVercelDeploymentFiles({ ...input(), get: fixture.get }),
    ).rejects.toThrow()
    expect(
      fixture.calls.some(({ path }) => path.startsWith("/v8/deployments/")),
    ).toBe(false)
  }
})

test("rejects a deployment routed to the wrong application environment", async () => {
  const fixture = adapter({ firstDeployment: { target: "production" } })
  await expect(
    observeVercelDeploymentFiles({ ...input(), get: fixture.get }),
  ).rejects.toThrow("ownership or lifecycle")
  expect(
    fixture.calls.some(({ path }) => path.startsWith("/v8/deployments/")),
  ).toBe(false)
  const production = adapter()
  await expect(
    observeVercelDeploymentFiles({
      ...input({ environment: "production" }),
      get: production.get,
    }),
  ).rejects.toThrow("ownership or lifecycle")
})

test("missing nested children remain unknown and are never treated as empty", async () => {
  const fixture = adapter({
    fileTree: [
      { name: "src", type: "directory", mode: 16877 },
      { name: "out", type: "directory", mode: 16877, children: [] },
    ],
  })
  const result = await observeVercelDeploymentFiles({
    ...input(),
    get: fixture.get,
  })
  expect(result.files[0]).toMatchObject({
    observedSha256: null,
    observedMode: null,
    matches: false,
  })
  expect(result.blockers).toContain("directory-children-unavailable")
  expect(result.blockers).toContain("requested-public-file-unavailable")
  expect(
    fixture.calls.some(({ path }) => path.startsWith("/v8/deployments/")),
  ).toBe(false)
  expect(result.inventoryComplete).toBe(false)
})

test("does not interpret UID as a content hash and rejects ambiguous tree paths or IDs", async () => {
  const uidIsHash = adapter({
    fileTree: tree([{ name: "package.json", type: "file", mode, uid: digest }]),
  })
  const result = await observeVercelDeploymentFiles({
    ...input(),
    get: uidIsHash.get,
  })
  expect(result.files[0].matches).toBe(true)
  expect(uidIsHash.calls.some(({ path }) => path.endsWith(`/${digest}`))).toBe(
    true,
  )
  for (const fileTree of [
    tree([
      { name: "package.json", type: "file", mode, uid: fileUid },
      { name: "package.json", type: "file", mode, uid: "other_file_id" },
    ]),
    tree([{ name: "package.json", type: "file", mode, uid: "bad/file" }]),
  ]) {
    const fixture = adapter({ fileTree })
    await expect(
      observeVercelDeploymentFiles({ ...input(), get: fixture.get }),
    ).rejects.toThrow()
    expect(
      fixture.calls.some(({ path }) => path.startsWith("/v8/deployments/")),
    ).toBe(false)
  }
  const sharedUid = adapter({
    fileTree: tree([
      { name: "first.json", type: "file", mode, uid: fileUid },
      { name: "second.json", type: "file", mode, uid: fileUid },
    ]),
  })
  const shared = await observeVercelDeploymentFiles({
    ...input({
      expectedFiles: [
        { path: "src/first.json", sha256: digest, mode },
        { path: "src/second.json", sha256: digest, mode },
      ],
    }),
    get: sharedUid.get,
  })
  expect(shared.matchedFileCount).toBe(2)
  expect(
    sharedUid.calls.filter(({ path }) => path.startsWith("/v8/deployments/")),
  ).toHaveLength(2)
})

test("refuses private paths before any provider read", async () => {
  const fixture = adapter()
  for (const path of [
    ".env.production",
    "config/.env",
    "secrets/token.txt",
    "credentials.json",
    "private/key.pem",
    ".trigger/tmp/credentials.json",
    "node_modules/pkg/package.json",
    ".next/cache/trace",
    "src/../public.json",
    "/public.json",
    "src\\public.json",
  ]) {
    await expect(
      observeVercelDeploymentFiles({
        ...input({ expectedFiles: [{ path, sha256: digest, mode }] }),
        get: fixture.get,
      }),
    ).rejects.toThrow("Expected public deployment file")
  }
  expect(fixture.calls).toHaveLength(0)
  await expect(
    observeVercelDeploymentFiles({
      ...input({ deploymentId: "not-a-deployment-id" }),
      get: fixture.get,
    }),
  ).rejects.toThrow("input is invalid")
  expect(fixture.calls).toHaveLength(0)
})

test("requires exact canonical base64 response and matching bytes", async () => {
  for (const content of [
    { data: bytes.toString("base64"), private: "unexpected" },
    { data: "%%%=" },
    { data: bytes.toString("base64").replace(/=+$/, "") },
    {},
    { data: 17 },
  ]) {
    const fixture = adapter({ content })
    await expect(
      observeVercelDeploymentFiles({ ...input(), get: fixture.get }),
    ).rejects.toThrow()
  }
  const mismatch = adapter({
    content: { data: Buffer.from("different").toString("base64") },
  })
  const result = await observeVercelDeploymentFiles({
    ...input(),
    get: mismatch.get,
  })
  expect(result.files[0].matches).toBe(false)
  expect(result.blockers).toContain("requested-public-file-content-mismatch")
  expect(JSON.stringify(result)).not.toContain("different")
})

test("rejects malformed, unsupported, or oversized tree/content records", async () => {
  for (const fileTree of [
    [{ name: "bad/name", type: "file", mode, uid: fileUid }],
    [{ name: "src", type: "directory", mode, children: "unknown" }],
  ]) {
    const fixture = adapter({ fileTree })
    await expect(
      observeVercelDeploymentFiles({ ...input(), get: fixture.get }),
    ).rejects.toThrow()
    expect(
      fixture.calls.some(({ path }) => path.startsWith("/v8/deployments/")),
    ).toBe(false)
  }
  const unsupported = adapter({
    fileTree: [{ name: "link", type: "symlink", mode, uid: fileUid }],
  })
  const partial = await observeVercelDeploymentFiles({
    ...input(),
    get: unsupported.get,
  })
  expect(partial.blockers).toContain("unsupported-deployment-file-node")
  expect(
    unsupported.calls.some(({ path }) => path.startsWith("/v8/deployments/")),
  ).toBe(false)
  const tooManyNodes = adapter({
    fileTree: [
      {
        name: "src",
        type: "directory",
        mode: 16877,
        children: Array.from({ length: 2048 }, (_, index) => ({
          name: `file-${index}.json`,
          type: "file",
          mode,
          uid: `file_${index}`,
        })),
      },
    ],
  })
  await expect(
    observeVercelDeploymentFiles({ ...input(), get: tooManyNodes.get }),
  ).rejects.toThrow("oversized")
  expect(
    tooManyNodes.calls.some(({ path }) => path.startsWith("/v8/deployments/")),
  ).toBe(false)
  const oversized = adapter({
    content: {
      data: Buffer.alloc(3 * 1024 * 1024 + 1, 0x61).toString("base64"),
    },
  })
  await expect(
    observeVercelDeploymentFiles({ ...input(), get: oversized.get }),
  ).rejects.toThrow("oversized")
})

test("bounds aggregate bytes across individually permitted files", async () => {
  const large = Buffer.alloc(3 * 1024 * 1024, 0x61)
  const tiny = Buffer.from("x")
  const largeDigest = createHash("sha256").update(large).digest("hex")
  const tinyDigest = createHash("sha256").update(tiny).digest("hex")
  const items = Array.from({ length: 5 }, (_, index) => ({
    path: `src/file-${index}.json`,
    sha256: index === 4 ? tinyDigest : largeDigest,
    mode,
  }))
  const get: ProviderGet = async (path) => {
    if (path === `/v9/projects/${target.projectId}`)
      return {
        id: target.projectId,
        accountId: teamId,
        rootDirectory: "apps/api",
      }
    if (path === `/v13/deployments/${deploymentId}`) return deployment()
    if (path === `/v6/deployments/${deploymentId}/files`)
      return tree(
        items.map((_, index) => ({
          name: `file-${index}.json`,
          type: "file",
          mode,
          uid: `file_${index}`,
        })),
      )
    if (path.includes("/files/file_4")) return { data: tiny.toString("base64") }
    if (path.includes("/files/file_")) return { data: large.toString("base64") }
    throw new Error("Unexpected route")
  }
  await expect(
    observeVercelDeploymentFiles({
      ...input({ expectedFiles: items }),
      get,
    }),
  ).rejects.toThrow("observation limit")
})

test("rejects deployment state changes across content reads", async () => {
  const fixture = adapter({
    secondDeployment: { url: "changed-preview.example.vercel.app" },
  })
  await expect(
    observeVercelDeploymentFiles({ ...input(), get: fixture.get }),
  ).rejects.toThrow("state changed")
  expect(
    fixture.calls.filter(
      ({ path }) => path === `/v13/deployments/${deploymentId}`,
    ),
  ).toHaveLength(2)
})

test("compares selected config state canonically and rejects changed config", async () => {
  const same = adapter({
    firstDeployment: { config: { alpha: 1, beta: { one: true, two: false } } },
    secondDeployment: { config: { beta: { two: false, one: true }, alpha: 1 } },
  })
  const observed = await observeVercelDeploymentFiles({
    ...input(),
    get: same.get,
  })
  expect(observed.files[0].matches).toBe(true)
  const changed = adapter({
    firstDeployment: { config: { runtime: "nodejs20.x" } },
    secondDeployment: { config: { runtime: "nodejs22.x" } },
  })
  await expect(
    observeVercelDeploymentFiles({ ...input(), get: changed.get }),
  ).rejects.toThrow("state changed")
})

test("rejects project root mismatch and nonregular requested modes before bytes", async () => {
  const wrongRoot = adapter({ project: { rootDirectory: "apps/dashboard" } })
  await expect(
    observeVercelDeploymentFiles({ ...input(), get: wrongRoot.get }),
  ).rejects.toThrow("project ownership")
  expect(
    wrongRoot.calls.some(({ path }) => path.startsWith("/v8/deployments/")),
  ).toBe(false)
  for (const invalidMode of [0o040755, 0o120777, 0o100600]) {
    const noRead = adapter({
      fileTree: tree([
        { name: "package.json", type: "file", mode: invalidMode, uid: fileUid },
      ]),
    })
    await expect(
      observeVercelDeploymentFiles({
        ...input({
          expectedFiles: [{ path: filePath, sha256: digest, mode }],
        }),
        get: noRead.get,
      }),
    ).rejects.toThrow("file identifier")
    expect(
      noRead.calls.some(({ path }) => path.startsWith("/v8/deployments/")),
    ).toBe(false)
  }
})

test("accepts only a Production deployment for Production observation", async () => {
  const production = adapter({
    firstDeployment: { target: "production" },
    secondDeployment: { target: "production" },
  })
  const result = await observeVercelDeploymentFiles({
    ...input({ environment: "production" }),
    get: production.get,
  })
  expect(result.environment).toBe("production")
  expect(result.files[0].matches).toBe(true)
})

test("bounds allowlist size and aggregate returned bytes", async () => {
  const tooMany = Array.from({ length: 65 }, (_, index) => ({
    path: `public-${index}.json`,
    sha256: digest,
    mode,
  }))
  const fixture = adapter()
  await expect(
    observeVercelDeploymentFiles({
      ...input({ expectedFiles: tooMany }),
      get: fixture.get,
    }),
  ).rejects.toThrow("input is invalid")
  expect(fixture.calls).toHaveLength(0)
})
