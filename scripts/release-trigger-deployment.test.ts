import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { type ProviderGet, providerGetClient } from "./release-provider-http"
import { collectTriggerFacts } from "./release-trigger-collect"
import {
  collectTriggerActiveDeployment,
  normalizeTriggerWorker,
} from "./release-trigger-deployment"

const revision = "a".repeat(40)
const completedAt = new Date(Date.now() - 2_000).toISOString()
const createdAt = new Date(Date.parse(completedAt) - 10_000).toISOString()
const deploymentId = "deployment_42"
const version = "20261003.7"
const worker = normalizeTriggerWorker({
  id: "worker_current",
  version,
  tasks: [
    { id: "private_row_a", slug: "orders.process" },
    { id: "private_row_b", slug: "notifications.send" },
  ],
})

function fixture(
  options: {
    firstCurrent?: Record<string, unknown>
    secondCurrent?: Record<string, unknown>
    detail?: Record<string, unknown>
    initialWorker?: typeof worker
    finalWorker?: typeof worker
    currentError?: boolean
  } = {},
) {
  let currentCalls = 0
  let workerCalls = 0
  const calls: string[] = []
  const defaultCurrent = {
    id: deploymentId,
    version,
    status: "DEPLOYED",
    createdAt,
    deployedAt: completedAt,
    commitSHA: revision,
  }
  const defaultDetail = {
    ...defaultCurrent,
    worker: {
      id: worker.id,
      version: worker.version,
      tasks: [
        { id: "detail_private_a", slug: "orders.process" },
        { id: "detail_private_b", slug: "notifications.send" },
      ],
    },
    contentHash: "opaque-content-fingerprint-123",
    privateEnv: { API_SECRET: "do-not-export" },
    token: "do-not-export-either",
  }
  const get: ProviderGet = async (path) => {
    calls.push(path)
    if (path === "/api/v1/deployments/current") {
      currentCalls += 1
      if (options.currentError) throw new Error("sensitive current response")
      return currentCalls === 1
        ? (options.firstCurrent ?? defaultCurrent)
        : (options.secondCurrent ?? defaultCurrent)
    }
    if (path === `/api/v1/deployments/${deploymentId}`)
      return options.detail ?? defaultDetail
    throw new Error(`Unexpected safe fixture path: ${path}`)
  }
  const readCurrentWorker = async () => {
    workerCalls += 1
    return options.finalWorker ?? options.initialWorker ?? worker
  }
  return { get, readCurrentWorker, calls }
}

function digestReportedContentHash(value: string) {
  return createHash("sha256")
    .update("ewatrade:trigger:reported-content-hash:v1\0")
    .update(value)
    .digest("hex")
}

test("collects exact active deployment and emits only bounded non-authoritative metadata", async () => {
  const f = fixture()
  const result = await collectTriggerActiveDeployment({
    revision,
    worker,
    get: f.get,
    readCurrentWorker: f.readCurrentWorker,
  })
  expect(f.calls).toEqual([
    "/api/v1/deployments/current",
    `/api/v1/deployments/${deploymentId}`,
    "/api/v1/deployments/current",
  ])
  expect(result).toEqual({
    id: deploymentId,
    version,
    status: "DEPLOYED",
    completedAt: new Date(completedAt).toISOString(),
    workerId: worker.id,
    reportedContentHashDigest: digestReportedContentHash(
      "opaque-content-fingerprint-123",
    ),
    reportedRevision: revision,
    reportedRevisionMatchesCandidate: true,
    sourceVerified: false,
    configurationFingerprint: null,
  })
  expect(JSON.stringify(result)).not.toContain("opaque-content-fingerprint")
  expect(JSON.stringify(result)).not.toContain("private_row")
  expect(JSON.stringify(result)).not.toContain("API_SECRET")
  expect(JSON.stringify(result)).not.toContain("do-not-export")
})

test("worker task ordering does not affect the active-worker comparison", async () => {
  const f = fixture({
    detail: {
      id: deploymentId,
      version,
      status: "DEPLOYED",
      createdAt,
      deployedAt: completedAt,
      contentHash: "opaque-hash",
      worker: {
        id: worker.id,
        version,
        tasks: [
          { id: "other-private-b", slug: "notifications.send" },
          { id: "other-private-a", slug: "orders.process" },
        ],
      },
    },
  })
  const result = await collectTriggerActiveDeployment({
    revision,
    worker,
    get: f.get,
    readCurrentWorker: f.readCurrentWorker,
  })
  expect(result.status).toBe("DEPLOYED")
})

test("missing source SHA stays metadata-only and a mismatching SHA never verifies", async () => {
  for (const commitSHA of [undefined, null, "b".repeat(40)]) {
    const f = fixture({
      detail: {
        id: deploymentId,
        version,
        status: "DEPLOYED",
        createdAt,
        deployedAt: completedAt,
        contentHash: "opaque-hash",
        ...(commitSHA === undefined ? {} : { commitSHA }),
        worker: {
          id: worker.id,
          version,
          tasks: [
            { id: "r1", slug: "orders.process" },
            { id: "r2", slug: "notifications.send" },
          ],
        },
      },
    })
    const result = await collectTriggerActiveDeployment({
      revision,
      worker,
      get: f.get,
      readCurrentWorker: f.readCurrentWorker,
    })
    expect(result.reportedRevisionMatchesCandidate).toBe(false)
    expect(result.sourceVerified).toBe(false)
    expect(result.configurationFingerprint).toBeNull()
    expect(result.reportedRevision).toBe(
      typeof commitSHA === "string" ? commitSHA : null,
    )
  }
})

test("refuses changed current deployment or current worker during observation", async () => {
  const changedCurrent = fixture({
    secondCurrent: {
      id: "deployment_43",
      version,
      status: "DEPLOYED",
      createdAt,
      deployedAt: completedAt,
    },
  })
  await expect(
    collectTriggerActiveDeployment({
      revision,
      worker,
      get: changedCurrent.get,
      readCurrentWorker: changedCurrent.readCurrentWorker,
    }),
  ).rejects.toThrow("changed during observation")

  const changedWorker = fixture({
    finalWorker: normalizeTriggerWorker({
      id: "worker_replaced",
      version,
      tasks: [{ id: "replacement", slug: "orders.process" }],
    }),
  })
  await expect(
    collectTriggerActiveDeployment({
      revision,
      worker,
      get: changedWorker.get,
      readCurrentWorker: changedWorker.readCurrentWorker,
    }),
  ).rejects.toThrow("changed during observation")
})

test("refuses unavailable or malformed worker and task metadata", async () => {
  const invalidWorkers = [
    null,
    { id: "bad id", version, tasks: [] },
    { id: worker.id, version, tasks: "not-an-array" },
    { id: worker.id, version, tasks: [{ id: "row", slug: "bad slug" }] },
    {
      id: worker.id,
      version,
      tasks: [
        { id: "same-row", slug: "orders.process" },
        { id: "same-row", slug: "notifications.send" },
      ],
    },
    {
      id: worker.id,
      version,
      tasks: [
        { id: "row-a", slug: "orders.process" },
        { id: "row-b", slug: "orders.process" },
      ],
    },
  ]
  for (const malformed of invalidWorkers) {
    const f = fixture({
      detail: {
        id: deploymentId,
        version,
        status: "DEPLOYED",
        createdAt,
        deployedAt: completedAt,
        contentHash: "opaque-hash",
        worker: malformed,
      },
    })
    await expect(
      collectTriggerActiveDeployment({
        revision,
        worker,
        get: f.get,
        readCurrentWorker: f.readCurrentWorker,
      }),
    ).rejects.toThrow()
  }
})

test("refuses foreign id/version/worker, wrong status, and unavailable content hash", async () => {
  const variants: Record<string, unknown>[] = [
    { id: "deployment_foreign" },
    { version: "other-version" },
    { status: "BUILDING" },
    { contentHash: undefined },
    { contentHash: null },
    { contentHash: "-" },
    { contentHash: "" },
    { contentHash: "x".repeat(257) },
    { contentHash: "bad\nvalue" },
    { commitSHA: "short-sha" },
    {
      worker: {
        id: "foreign-worker",
        version,
        tasks: [{ id: "row", slug: "orders.process" }],
      },
    },
    {
      worker: {
        id: worker.id,
        version: "foreign-worker-version",
        tasks: [
          { id: "row-a", slug: "orders.process" },
          { id: "row-b", slug: "notifications.send" },
        ],
      },
    },
    {
      worker: {
        id: worker.id,
        version,
        tasks: [{ id: "row", slug: "foreign.task" }],
      },
    },
  ]
  for (const override of variants) {
    const f = fixture({
      detail: {
        id: deploymentId,
        version,
        status: "DEPLOYED",
        createdAt,
        deployedAt: completedAt,
        contentHash: "opaque-hash",
        worker: {
          id: worker.id,
          version,
          tasks: [
            { id: "r1", slug: "orders.process" },
            { id: "r2", slug: "notifications.send" },
          ],
        },
        ...override,
      },
    })
    await expect(
      collectTriggerActiveDeployment({
        revision,
        worker,
        get: f.get,
        readCurrentWorker: f.readCurrentWorker,
      }),
    ).rejects.toThrow()
  }
})

test("refuses missing fields and invalid chronology", async () => {
  const variants: Record<string, unknown>[] = [
    { id: undefined },
    { version: undefined },
    { status: "FAILED" },
    { createdAt: "invalid" },
    { createdAt: "2026-02-30T10:00:00.000Z" },
    { createdAt: "2026-10-03T24:00:00.000Z" },
    { deployedAt: "invalid" },
    { deployedAt: "2026-02-30T10:00:00.000Z" },
    { deployedAt: "2026-10-03T24:00:00.000Z" },
    { createdAt: new Date(Date.now() + 60_000).toISOString() },
    { deployedAt: new Date(Date.now() + 60_000).toISOString() },
    { deployedAt: new Date(Date.parse(createdAt) - 1).toISOString() },
  ]
  for (const override of variants) {
    const f = fixture({
      firstCurrent: {
        ...{
          id: deploymentId,
          version,
          status: "DEPLOYED",
          createdAt,
          deployedAt: completedAt,
          commitSHA: revision,
        },
        ...override,
      },
    })
    await expect(
      collectTriggerActiveDeployment({
        revision,
        worker,
        get: f.get,
        readCurrentWorker: f.readCurrentWorker,
      }),
    ).rejects.toThrow()
  }
})

test("rejects a foreign detail worker before rechecking current state", async () => {
  const f = fixture({
    detail: {
      id: deploymentId,
      version,
      status: "DEPLOYED",
      createdAt,
      deployedAt: completedAt,
      contentHash: "opaque-hash",
      worker: {
        id: "different-worker",
        version,
        tasks: [{ id: "row", slug: "orders.process" }],
      },
    },
  })
  await expect(
    collectTriggerActiveDeployment({
      revision,
      worker,
      get: f.get,
      readCurrentWorker: f.readCurrentWorker,
    }),
  ).rejects.toThrow("active deployment and owned current worker do not match")
  expect(f.calls).toEqual([
    "/api/v1/deployments/current",
    `/api/v1/deployments/${deploymentId}`,
  ])
})

test("invalid expected revision and failed current endpoint fail closed", async () => {
  const f = fixture()
  await expect(
    collectTriggerActiveDeployment({
      revision: "short",
      worker,
      get: f.get,
      readCurrentWorker: f.readCurrentWorker,
    }),
  ).rejects.toThrow("Expected release revision is invalid")
  expect(f.calls).toEqual([])

  const failed = fixture({ currentError: true })
  await expect(
    collectTriggerActiveDeployment({
      revision,
      worker,
      get: failed.get,
      readCurrentWorker: failed.readCurrentWorker,
    }),
  ).rejects.toThrow("sensitive current response")
  expect(failed.calls).toEqual(["/api/v1/deployments/current"])

  const request = Object.assign(
    async () => new Response("private token body", { status: 503 }),
    { preconnect: () => {} },
  ) as typeof fetch
  const sanitizedGet = providerGetClient("trigger", "fixture-only-key", request)
  await expect(
    collectTriggerActiveDeployment({
      revision,
      worker,
      get: sanitizedGet,
      readCurrentWorker: async () => worker,
    }),
  ).rejects.toThrow("trigger: authenticated read returned HTTP 503")
})

test("collector uses injected selected-environment getter and separate PAT worker getter", async () => {
  const projectRef = "proj_pdnthdiwdevukelgmvzc"
  const projectCalls: string[] = []
  const environmentCalls: string[] = []
  const projectGet: ProviderGet = async (path) => {
    projectCalls.push(path)
    if (path === `/api/v1/projects/${projectRef}`)
      return {
        id: "project_test",
        externalRef: projectRef,
        organization: { id: "org_test" },
      }
    if (path === `/api/v1/projects/${projectRef}/prod/workers/current`)
      return {
        worker: {
          id: worker.id,
          version,
          tasks: [
            { id: "row-a", slug: "orders.process" },
            { id: "row-b", slug: "notifications.send" },
          ],
        },
      }
    throw new Error("Unexpected project getter path")
  }
  const deploymentFixture = fixture()
  const environmentGet: ProviderGet = async (path, query) => {
    environmentCalls.push(path)
    return deploymentFixture.get(path, query)
  }
  const result = await collectTriggerFacts({
    environment: "production",
    revision,
    expectedOrganizationId: "org_test",
    expectedProjectId: "project_test",
    get: projectGet,
    environmentGet,
  })
  expect(projectCalls).toEqual([
    `/api/v1/projects/${projectRef}`,
    `/api/v1/projects/${projectRef}/prod/workers/current`,
    `/api/v1/projects/${projectRef}/prod/workers/current`,
  ])
  expect(environmentCalls).toEqual([
    "/api/v1/deployments/current",
    `/api/v1/deployments/${deploymentId}`,
    "/api/v1/deployments/current",
  ])
  expect(result.activeDeployment?.reportedRevisionMatchesCandidate).toBe(true)
  expect(result.activeDeployment?.sourceVerified).toBe(false)
  expect(result.releaseReady).toBe(false)
})
