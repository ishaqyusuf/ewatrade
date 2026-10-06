import { expect, test } from "bun:test"
import { WEB_TARGETS } from "../.release/ewatrade-provider-bundle"
import { type ProviderGet, providerGetClient } from "./release-provider-http"
import { collectVercelFacts } from "./release-vercel-collect"

const roots: Record<string, string> = {
  "dashboard-web": "apps/dashboard",
  "api-web": "apps/api",
  "marketing-web": "apps/marketing",
}
function fetchStub(
  read: (
    url: Parameters<typeof fetch>[0],
    options?: RequestInit,
  ) => Promise<Response>,
): typeof fetch {
  return Object.assign(read, { preconnect: () => {} })
}
const deploymentIds = Object.fromEntries(
  WEB_TARGETS.map((target) => [
    target.targetId,
    `dpl_${target.targetId.replaceAll("-", "_")}`,
  ]),
)
function mockProvider(
  options: {
    production?: boolean
    missingSource?: boolean
    metadataOnly?: boolean
    wrongProject?: boolean
    conflictingSource?: boolean
    deploymentFields?: Record<string, unknown>
  } = {},
): ProviderGet {
  return async (path, query) => {
    const target = WEB_TARGETS.find(
      (target) =>
        path.includes(target.projectId) ||
        path.endsWith(deploymentIds[target.targetId]) ||
        path.endsWith(target.productionDomain ?? ""),
    )
    if (!target || query?.teamId !== target.teamId)
      throw new Error("Provider scope missing")
    if (path.startsWith("/v9/projects/"))
      return {
        id: options.wrongProject ? "foreign" : target.projectId,
        accountId: target.teamId,
        rootDirectory: roots[target.targetId],
        env: [{ value: "private-env-value-never-export" }],
      }
    if (path.startsWith("/v4/aliases/"))
      return {
        alias: target.productionDomain,
        projectId: target.projectId,
        deploymentId: deploymentIds[target.targetId],
        updatedAt: Date.now() - 1000,
        created: "2020-01-01T00:00:00.000Z",
        protectionBypass: "secret-bypass",
      }
    if (path.startsWith("/v13/deployments/")) {
      expect(query?.withGitRepoInfo).toBe("true")
      return {
        id: deploymentIds[target.targetId],
        projectId: target.projectId,
        ownerId: target.teamId,
        team: { id: target.teamId },
        createdAt: Date.now() - 3000,
        ready: Date.now() - 2000,
        readyState: "READY",
        target: options.production ? "production" : null,
        url: `${deploymentIds[target.targetId].replaceAll("_", "-")}.vercel.app`,
        ...(options.missingSource || options.metadataOnly
          ? {}
          : { gitSource: { sha: "a".repeat(40) } }),
        ...(options.metadataOnly
          ? { meta: { githubCommitSha: "a".repeat(40) } }
          : options.conflictingSource
            ? { meta: { githubCommitSha: "b".repeat(40) } }
            : {}),
        env: { API_SECRET: "deployment-private-env" },
        ...options.deploymentFields,
      }
    }
    throw new Error("Unexpected endpoint")
  }
}

test("collects all owned Preview deployments and exports only bounded public proof fields", async () => {
  const result = await collectVercelFacts({
    environment: "preview",
    previewDeploymentIds: deploymentIds,
    get: mockProvider(),
  })
  expect(result.projects).toHaveLength(3)
  expect(result.deployments).toHaveLength(3)
  expect(
    result.deploymentLifecycles.every((item) => item.completedAt !== null),
  ).toBe(true)
  expect(result.blockers).toEqual([])
  expect(result.releaseReady).toBe(false)
  expect(JSON.stringify(result)).not.toContain("private-env")
  expect(JSON.stringify(result)).not.toContain("API_SECRET")
})

test("completion needs owned chronological provider timestamps, never observation time", async () => {
  for (const deploymentFields of [
    { ready: undefined },
    { ready: true },
    { ready: Date.now() + 60000 },
    { ready: Date.now() - 5000 },
    { ready: Number.NaN },
    { ownerId: undefined },
    { createdAt: undefined },
    { createdAt: "2026-01-01T00:00:00Z" },
    { createdAt: 0, ready: 0 },
  ]) {
    const result = await collectVercelFacts({
      environment: "preview",
      previewDeploymentIds: deploymentIds,
      get: mockProvider({ deploymentFields }),
    })
    expect(
      result.deploymentLifecycles.every((item) => item.completedAt === null),
    ).toBe(true)
    expect(
      result.blockers.filter(
        (item) => item.reason === "deployment-completion-time-unverified",
      ),
    ).toHaveLength(3)
    expect(result.releaseReady).toBe(false)
  }
  for (const deploymentFields of [
    { ownerId: "foreign" },
    { team: { id: "foreign" } },
    { target: "preview" },
  ])
    await expect(
      collectVercelFacts({
        environment: "preview",
        previewDeploymentIds: deploymentIds,
        get: mockProvider({ deploymentFields }),
      }),
    ).rejects.toThrow("owned Ready environment")
})

test("Production observes the owned active alias and rechecks it after deployment reads", async () => {
  const paths: string[] = []
  const aliasBase = mockProvider({ production: true })
  const result = await collectVercelFacts({
    environment: "production",
    get: async (path, query) => {
      paths.push(path)
      return aliasBase(path, query)
    },
  })
  expect(result.aliases).toHaveLength(3)
  expect(result.deployments).toHaveLength(3)
  expect(result).not.toHaveProperty("promotionGates")
  expect(paths.filter((path) => path.startsWith("/v4/aliases/"))).toHaveLength(
    6,
  )
  expect(paths.some((path) => path.startsWith("/v2/projects/"))).toBe(false)
  expect(result.blockers.map((item) => item.reason)).toEqual(
    Array(3).fill("promotion-assignment-time-unverified"),
  )
  const base = mockProvider({ production: true })
  let aliases = 0
  await expect(
    collectVercelFacts({
      environment: "production",
      get: async (path, query) => {
        const value = await base(path, query)
        if (path.startsWith("/v4/aliases/") && ++aliases === 2)
          return {
            ...(value as Record<string, unknown>),
            deploymentId: "dpl_replaced",
          }
        return value
      },
    }),
  ).rejects.toThrow("alias changed")
})

test("Ready without source identity or alias assignment time stays incomplete", async () => {
  const preview = await collectVercelFacts({
    environment: "preview",
    previewDeploymentIds: deploymentIds,
    get: mockProvider({ missingSource: true }),
  })
  expect(preview.blockers.map((item) => item.reason)).toEqual(
    Array(3).fill("immutable-cli-source-attribution-missing"),
  )
  const production = await collectVercelFacts({
    environment: "production",
    get: mockProvider({ production: true }),
  })
  expect(production.aliases).toHaveLength(3)
  expect(production.aliases.every((item) => !("assignedAt" in item))).toBe(true)
  expect(
    production.blockers.filter(
      (item) => item.reason === "promotion-assignment-time-unverified",
    ),
  ).toHaveLength(3)
  expect(JSON.stringify(production)).not.toContain("secret-bypass")
})

test("present alias deletion or redirect metadata never qualifies as an active Production binding", async () => {
  const base = mockProvider({ production: true })
  for (const fields of [{ deletedAt: 0 }, { redirect: "" }]) {
    await expect(
      collectVercelFacts({
        environment: "production",
        get: async (path, query) => {
          const value = await base(path, query)
          return path.startsWith("/v4/aliases/")
            ? { ...(value as Record<string, unknown>), ...fields }
            : value
        },
      }),
    ).rejects.toThrow("active Production alias ownership mismatch")
  }
})

test("caller-supplied CLI commit metadata never fills missing source provenance", async () => {
  const result = await collectVercelFacts({
    environment: "preview",
    previewDeploymentIds: deploymentIds,
    get: mockProvider({ metadataOnly: true }),
  })
  expect(result.deployments.every((item) => !item.gitSource)).toBe(true)
  expect(
    result.deployments.every(
      (item) => item.meta?.githubCommitSha === "a".repeat(40),
    ),
  ).toBe(true)
  expect(result.blockers.map((item) => item.reason)).toEqual(
    Array(3).fill("immutable-cli-source-attribution-missing"),
  )
  expect(result.releaseReady).toBe(false)
})

test("refuses project confusion, ambiguous source and missing Preview artifact IDs", async () => {
  await expect(
    collectVercelFacts({
      environment: "preview",
      previewDeploymentIds: deploymentIds,
      get: mockProvider({ wrongProject: true }),
    }),
  ).rejects.toThrow("ownership mismatch")
  await expect(
    collectVercelFacts({
      environment: "preview",
      previewDeploymentIds: deploymentIds,
      get: mockProvider({ conflictingSource: true }),
    }),
  ).rejects.toThrow("source attribution")
  await expect(
    collectVercelFacts({ environment: "preview", get: mockProvider() }),
  ).rejects.toThrow("exact provider deployment ID")
})

test("HTTP transport fixes origin/method, refuses redirects and redacts error bodies", async () => {
  const requests: Array<{ url: string; options: RequestInit }> = []
  const fetchRead = fetchStub(async (url, options) => {
    requests.push({ url: String(url), options: options ?? {} })
    return Response.json({ safe: true })
  })
  const get = providerGetClient("vercel", "test-read-key", fetchRead)
  expect(await get("/v9/projects/prj_owned", { teamId: "team_owned" })).toEqual(
    { safe: true },
  )
  expect(requests[0].url).toBe(
    "https://api.vercel.com/v9/projects/prj_owned?teamId=team_owned",
  )
  expect(requests[0].options.method).toBe("GET")
  expect(requests[0].options.redirect).toBe("error")
  await expect(get("//attacker.test/secret")).rejects.toThrow("path is invalid")
  const failing = providerGetClient(
    "vercel",
    "test-read-key",
    fetchStub(async () => new Response("private-env-value", { status: 403 })),
  )
  await expect(failing("/v9/projects/prj_owned")).rejects.toThrow("HTTP 403")
  const redirected = providerGetClient(
    "vercel",
    "test-read-key",
    fetchStub(async () => {
      throw new Error("test-read-key redirected to foreign host")
    }),
  )
  await expect(redirected("/v9/projects/prj_owned")).rejects.toThrow(
    "authenticated read failed",
  )
  const oversized = providerGetClient(
    "vercel",
    "test-read-key",
    fetchStub(async () => new Response("x".repeat(5 * 1024 * 1024 + 1))),
  )
  await expect(oversized("/v9/projects/prj_owned")).rejects.toThrow("oversized")
})
