import { afterEach, beforeEach, expect, test } from "bun:test"
import { JOBS_TARGET } from "../.release/ewatrade-provider-bundle"
import { type ProviderGet, providerGetClient } from "./release-provider-http"
import { collectTriggerFacts } from "./release-trigger-collect"
import { EWATRADE_TRIGGER_TARGET } from "./release-trigger-target"

const organizationId = "org_ewatrade"
const projectId = "project_ewatrade"
const revision = "a".repeat(40)
const originalReadKey = process.env.TRIGGER_RELEASE_READ_KEY
beforeEach(() => {
  Reflect.deleteProperty(process.env, "TRIGGER_RELEASE_READ_KEY")
})
afterEach(() => {
  if (originalReadKey === undefined)
    Reflect.deleteProperty(process.env, "TRIGGER_RELEASE_READ_KEY")
  else process.env.TRIGGER_RELEASE_READ_KEY = originalReadKey
})

function mockProvider(
  options: { wrongOrganization?: boolean; organizationId?: string } = {},
) {
  const calls: string[] = []
  const get: ProviderGet = async (path) => {
    calls.push(path)
    if (path === `/api/v1/projects/${JOBS_TARGET.projectRef}`)
      return {
        id: projectId,
        externalRef: JOBS_TARGET.projectRef,
        organization: {
          id: options.wrongOrganization
            ? "org_foreign"
            : (options.organizationId ?? organizationId),
          slug: "ewatrade",
        },
        name: "EwaTrade jobs",
        createdAt: "2025-01-01T00:00:00.000Z",
      }
    if (
      path === `/api/v1/projects/${JOBS_TARGET.projectRef}/prod/workers/current`
    )
      return {
        worker: {
          id: "worker_current",
          version: "deployment-version-19",
          tasks: [
            { id: "task_record_cleanup", slug: "catalog-photo-cleanup" },
            { id: "task_record_alert", slug: "send-order-alert" },
          ],
        },
        urls: { runs: "https://example.invalid/runs" },
      }
    throw new Error(`Unexpected read path: ${path}`)
  }
  return { get, calls }
}

test("collects project ownership and current worker facts without claiming source or environment attribution", async () => {
  const mock = mockProvider()
  const result = await collectTriggerFacts({
    environment: "production",
    revision,
    expectedOrganizationId: organizationId,
    expectedProjectId: projectId,
    get: mock.get,
  })
  expect(mock.calls).toEqual([
    `/api/v1/projects/${JOBS_TARGET.projectRef}`,
    `/api/v1/projects/${JOBS_TARGET.projectRef}/prod/workers/current`,
  ])
  expect(result.project).toEqual({
    projectRef: JOBS_TARGET.projectRef,
    projectId,
    organizationId,
  })
  expect(result.currentWorker).toEqual({
    id: "worker_current",
    version: "deployment-version-19",
    taskIds: ["catalog-photo-cleanup", "send-order-alert"],
  })
  expect(result.environmentIdentity).toBeNull()
  expect(result.blockers.map(({ reason }) => reason)).toContain(
    "trigger-current-worker-source-sha-and-deploy-config-attribution-unavailable",
  )
  expect(result.releaseReady).toBe(false)
  expect(JSON.stringify(result)).not.toContain("example.invalid")
  expect(JSON.stringify(result)).not.toContain("task_record_cleanup")
})

test("defaults to the independently verified EwaTrade Trigger organization and project reference", async () => {
  const mock = mockProvider({
    organizationId: EWATRADE_TRIGGER_TARGET.organizationId,
  })
  const result = await collectTriggerFacts({
    environment: "production",
    revision,
    get: mock.get,
  })

  expect(JOBS_TARGET.projectRef).toBe(EWATRADE_TRIGGER_TARGET.projectRef)
  expect(mock.calls).toEqual([
    `/api/v1/projects/${EWATRADE_TRIGGER_TARGET.projectRef}`,
    `/api/v1/projects/${EWATRADE_TRIGGER_TARGET.projectRef}/prod/workers/current`,
  ])
  expect(result.project).toEqual({
    projectRef: EWATRADE_TRIGGER_TARGET.projectRef,
    projectId,
    organizationId: EWATRADE_TRIGGER_TARGET.organizationId,
  })
  expect(result.blockers.length).toBeGreaterThan(0)
  expect(result.releaseReady).toBe(false)
})

test("exports logical dotted task identifiers instead of provider database row IDs", async () => {
  const mock = mockProvider()
  const get: ProviderGet = async (path, query) => {
    const response = await mock.get(path, query)
    if (path.endsWith("/workers/current"))
      return {
        worker: {
          id: "worker_current",
          version: "20260729.1",
          tasks: [
            { id: "task.row/one", slug: "domains.connection.verify" },
            { id: "task_row_two", slug: "notifications.dispatch" },
          ],
        },
      }
    return response
  }
  const result = await collectTriggerFacts({
    environment: "production",
    revision,
    expectedOrganizationId: organizationId,
    get,
  })
  expect(result.currentWorker?.taskIds).toEqual([
    "domains.connection.verify",
    "notifications.dispatch",
  ])
  expect(JSON.stringify(result)).not.toContain("task_row_")
  expect(JSON.stringify(result)).not.toContain("task.row/one")
  expect(result.environmentIdentity).toBeNull()
  expect(result.releaseReady).toBe(false)
})

test("refuses missing, invalid and duplicate task names or provider row IDs", async () => {
  const invalidTasks = [
    [{ id: "task_one" }],
    [{ id: "task_one", slug: "" }],
    [{ id: "task_one", slug: "a\nsecret" }],
    [{ id: "task_one", slug: "a".repeat(257) }],
    [{ id: "", slug: "domains.connection.verify" }],
    [{ id: "row\nsecret", slug: "domains.connection.verify" }],
    [{ id: "r".repeat(257), slug: "domains.connection.verify" }],
    [
      { id: "task_one", slug: "domains.connection.verify" },
      { id: "task_two", slug: "domains.connection.verify" },
    ],
    [
      { id: "task_one", slug: "domains.connection.verify" },
      { id: "task_one", slug: "notifications.dispatch" },
    ],
  ]
  for (const tasks of invalidTasks) {
    const mock = mockProvider()
    const get: ProviderGet = async (path, query) => {
      if (path.endsWith("/workers/current"))
        return { worker: { id: "worker_current", version: "v1", tasks } }
      return mock.get(path, query)
    }
    await expect(
      collectTriggerFacts({
        environment: "production",
        revision,
        expectedOrganizationId: organizationId,
        get,
      }),
    ).rejects.toThrow("task metadata is malformed")
  }
})

test("rejects an organization mismatch instead of exporting a foreign project", async () => {
  const mock = mockProvider({ wrongOrganization: true })
  await expect(
    collectTriggerFacts({
      environment: "production",
      revision,
      expectedOrganizationId: organizationId,
      get: mock.get,
    }),
  ).rejects.toThrow("ownership mismatch")
  expect(mock.calls).toHaveLength(1)
})

test("Preview remains unavailable and makes no Production project or worker request", async () => {
  const mock = mockProvider()
  const result = await collectTriggerFacts({
    environment: "preview",
    revision,
    expectedOrganizationId: organizationId,
    get: mock.get,
  })
  expect(mock.calls).toEqual([])
  expect(result.environment).toBe("preview")
  expect(result.project).toBeNull()
  expect(result.currentWorker).toBeNull()
  expect(result.blockers).toEqual([
    {
      targetId: "jobs",
      reason:
        "preview-environment-isolation-unverified; isolated waiver required",
    },
  ])
  expect(result.releaseReady).toBe(false)
})

test("requires explicit organization ownership input", async () => {
  await expect(
    collectTriggerFacts({
      environment: "production",
      revision,
      expectedOrganizationId: "",
      get: mockProvider().get,
    }),
  ).rejects.toThrow("organization ID is required")
})

test("missing or wrong-scope deployment read keys never reuse the ownership credential", async () => {
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = Object.assign(
    async () => {
      requests += 1
      throw new Error("No network in this fixture")
    },
    { preconnect: originalFetch.preconnect },
  )
  try {
    for (const key of [
      "",
      "tr_dev_sk_fixture",
      "tr_stg_sk_fixture",
      "ownership-token",
      "tr_prod_sk_fixture\ninvalid",
    ]) {
      process.env.TRIGGER_RELEASE_READ_KEY = key
      const mock = mockProvider()
      const result = await collectTriggerFacts({
        environment: "production",
        revision,
        expectedOrganizationId: organizationId,
        get: mock.get,
      })
      expect(mock.calls).toHaveLength(2)
      expect(result.activeDeployment).toBeNull()
      expect(result.blockers).toContainEqual({
        targetId: "jobs",
        reason: "trigger-selected-environment-read-credential-unavailable",
      })
      expect(result.releaseReady).toBe(false)
    }
    expect(requests).toBe(0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("default deployment transport uses only the separate selected environment key and sanitized GET observations", async () => {
  const originalFetch = globalThis.fetch
  const readKey = "tr_prod_sk_fixtureOnly"
  process.env.TRIGGER_RELEASE_READ_KEY = readKey
  const paths: string[] = []
  const current = {
    id: "deployment_current",
    version: "deployment-version-19",
    status: "DEPLOYED",
    createdAt: "2026-01-01T00:00:00Z",
    deployedAt: "2026-01-01T00:01:00Z",
    git: { secret: "private-git-fields" },
  }
  globalThis.fetch = Object.assign(
    async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const parsed = new URL(String(url))
      expect(parsed.origin).toBe("https://api.trigger.dev")
      expect(init?.method).toBe("GET")
      expect(init?.redirect).toBe("error")
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${readKey}`,
      )
      paths.push(parsed.pathname)
      if (parsed.pathname === "/api/v1/deployments/current")
        return Response.json(current)
      if (parsed.pathname === "/api/v1/deployments/deployment_current")
        return Response.json({
          ...current,
          contentHash: "opaque-provider-content-value",
          commitSHA: revision,
          env: { SECRET: "private-provider-values" },
          worker: {
            id: "worker_current",
            version: current.version,
            tasks: [
              { id: "task_row_one", slug: "send-order-alert" },
              { id: "task_row_two", slug: "catalog-photo-cleanup" },
            ],
          },
        })
      throw new Error("Unexpected fixture request")
    },
    { preconnect: originalFetch.preconnect },
  )
  try {
    const mock = mockProvider()
    const result = await collectTriggerFacts({
      environment: "production",
      revision,
      expectedOrganizationId: organizationId,
      get: mock.get,
    })
    expect(paths).toEqual([
      "/api/v1/deployments/current",
      "/api/v1/deployments/deployment_current",
      "/api/v1/deployments/current",
    ])
    expect(mock.calls).toHaveLength(3)
    expect(result.activeDeployment).toMatchObject({
      id: current.id,
      version: current.version,
      completedAt: "2026-01-01T00:01:00.000Z",
      workerId: "worker_current",
      reportedRevision: revision,
      reportedRevisionMatchesCandidate: true,
      sourceVerified: false,
      configurationFingerprint: null,
    })
    expect(result.activeDeployment?.reportedContentHashDigest).toMatch(
      /^[0-9a-f]{64}$/,
    )
    for (const privateValue of [
      readKey,
      "opaque-provider-content-value",
      "private-provider-values",
      "private-git-fields",
      "task_row_one",
    ])
      expect(JSON.stringify(result)).not.toContain(privateValue)
    expect(result.environmentIdentity).toBeNull()
    expect(result.releaseReady).toBe(false)
    expect(result.blockers).toContainEqual({
      targetId: "jobs",
      reason: "trigger-deployment-source-artifact-binding-unverified",
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("Trigger transport stays on its fixed API origin with GET and refuses Vercel paths", async () => {
  const calls: string[] = []
  const get = providerGetClient("trigger", "test-read-key", (async (
    url,
    init,
  ) => {
    expect(init?.method).toBe("GET")
    expect(init?.redirect).toBe("error")
    calls.push(String(url))
    return Response.json({ id: projectId })
  }) as typeof fetch)
  expect(await get(`/api/v1/projects/${JOBS_TARGET.projectRef}`)).toEqual({
    id: projectId,
  })
  expect(calls).toEqual([
    `https://api.trigger.dev/api/v1/projects/${JOBS_TARGET.projectRef}`,
  ])
  await expect(get("/v9/projects/prj_foreign")).rejects.toThrow(
    "path is invalid",
  )
})
