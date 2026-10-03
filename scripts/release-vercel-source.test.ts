import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { WEB_TARGETS } from "../.release/ewatrade-provider-bundle"
import type { VercelCollection } from "./release-vercel-collect"
import { bindVercelSource as bindSource } from "./release-vercel-source"

function bindVercelSource(
  input: Omit<Parameters<typeof bindSource>[0], "environment">,
) {
  return bindSource({ ...input, environment: input.collection.environment })
}

const fixtures: string[] = []
const roots: Record<string, string> = {
  "dashboard-web": "apps/dashboard",
  "api-web": "apps/api",
  "marketing-web": "apps/marketing",
}
function fixture() {
  const repository = realpathSync(
    mkdtempSync(join(tmpdir(), "ewatrade-web-source-")),
  )
  fixtures.push(repository)
  writeFileSync(
    join(repository, "release.manifest.json"),
    readFileSync(resolve(import.meta.dir, "../release.manifest.json")),
  )
  for (const root of Object.values(roots)) {
    mkdirSync(join(repository, root), { recursive: true })
    writeFileSync(
      join(repository, root, "index.ts"),
      "export const fixture = 1\n",
    )
  }
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "core.fsmonitor=false", ...args], {
      cwd: repository,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  git("init", "-q", "-b", "main")
  git("config", "user.name", "Web Source Test")
  git("config", "user.email", "web-source@example.test")
  git("add", ".")
  git("commit", "-qm", "committed web source")
  return { repository, git, revision: git("rev-parse", "HEAD") }
}
function facts(
  revision: string,
  environment: "preview" | "production" = "preview",
): VercelCollection {
  return {
    provider: "vercel",
    environment,
    observedAt: new Date().toISOString(),
    projects: WEB_TARGETS.map((target) => ({
      targetId: target.targetId,
      projectId: target.projectId,
      teamId: target.teamId ?? "",
      rootDirectory: roots[target.targetId],
    })),
    deploymentIds: Object.fromEntries(
      WEB_TARGETS.map((target) => [
        target.targetId,
        `dpl_${target.targetId.replaceAll("-", "_")}`,
      ]),
    ),
    deployments: WEB_TARGETS.map((target) => ({
      id: `dpl_${target.targetId.replaceAll("-", "_")}`,
      projectId: target.projectId,
      readyState: "READY",
      target: environment === "production" ? "production" : null,
      url: "owned.vercel.app",
      gitSource: { sha: revision },
    })),
    aliases: [],
    deploymentLifecycles: [],
    blockers: [],
    releaseReady: false,
  }
}
afterEach(() => {
  for (const repository of fixtures.splice(0))
    rmSync(repository, { recursive: true, force: true })
})

test("corroborates exact Git source for every owned target without issuing readiness", () => {
  const { repository, revision } = fixture()
  for (const environment of ["preview", "production"] as const) {
    const collection = facts(revision, environment)
    Object.assign(collection, { token: "private-collector-token" })
    Object.assign(collection.deployments[0], {
      env: { API_SECRET: "private-deployment-environment" },
    })
    const result = bindVercelSource({ repository, revision, collection })
    expect(JSON.stringify(result)).not.toContain("private-")
    expect(JSON.stringify(result)).not.toContain("API_SECRET")
    expect(result).toHaveLength(3)
    for (const binding of result) {
      expect(binding).toMatchObject({
        candidateRevision: revision,
        providerRevision: revision,
        compatible: true,
        reason: null,
      })
      expect(binding.providerSourceFingerprint).toBe(
        binding.candidateSourceFingerprint,
      )
      expect(binding.providerSourceFingerprint).toMatch(/^[0-9a-f]{64}$/)
      expect(binding).not.toHaveProperty("completedAt")
      expect(binding).not.toHaveProperty("configurationFingerprint")
    }
    expect(collection.releaseReady).toBe(false)
  }
})

test("an unchanged ancestor remains compatible at a different candidate revision", () => {
  const { repository, revision: deployed, git } = fixture()
  writeFileSync(join(repository, "README.md"), "unrelated documentation\n")
  git("add", ".")
  git("commit", "-qm", "documentation")
  const revision = git("rev-parse", "HEAD")
  const result = bindVercelSource({
    repository,
    revision,
    collection: facts(deployed),
  })
  expect(revision).not.toBe(deployed)
  expect(
    result.every(
      (item) =>
        item.compatible &&
        item.providerRevision === deployed &&
        item.candidateRevision === revision,
    ),
  ).toBe(true)
})

test("changed API inputs block every dependent web target", () => {
  const { repository, revision: deployed, git } = fixture()
  writeFileSync(
    join(repository, "apps/api/index.ts"),
    "export const fixture = 2\n",
  )
  git("add", ".")
  git("commit", "-qm", "changed API")
  const result = bindVercelSource({
    repository,
    revision: git("rev-parse", "HEAD"),
    collection: facts(deployed),
  })
  expect(result.map((item) => item.reason)).toEqual(
    Array(3).fill("provider-target-source-changed"),
  )
  expect(
    result.every(
      (item) =>
        !item.compatible &&
        item.providerSourceFingerprint !== item.candidateSourceFingerprint,
    ),
  ).toBe(true)
})

test("target-specific changes preserve compatibility only for unaffected targets", () => {
  const { repository, revision: deployed, git } = fixture()
  writeFileSync(
    join(repository, "apps/dashboard/index.ts"),
    "export const fixture = 2\n",
  )
  git("add", ".")
  git("commit", "-qm", "changed Dashboard")
  const result = bindVercelSource({
    repository,
    revision: git("rev-parse", "HEAD"),
    collection: facts(deployed),
  })
  expect(result.find((item) => item.targetId === "dashboard-web")?.reason).toBe(
    "provider-target-source-changed",
  )
  expect(
    result
      .filter((item) => item.targetId !== "dashboard-web")
      .every((item) => item.compatible),
  ).toBe(true)
})

test("equal source on a nonancestor branch and unavailable commits cannot substitute", () => {
  const { repository, revision: baseline, git } = fixture()
  git("checkout", "-qb", "foreign")
  writeFileSync(join(repository, "foreign.md"), "foreign\n")
  git("add", ".")
  git("commit", "-qm", "foreign branch")
  const foreign = git("rev-parse", "HEAD")
  git("checkout", "-q", "main")
  writeFileSync(join(repository, "candidate.md"), "candidate\n")
  git("add", ".")
  git("commit", "-qm", "candidate branch")
  const revision = git("rev-parse", "HEAD")
  for (const source of [foreign, "f".repeat(40)]) {
    const result = bindVercelSource({
      repository,
      revision,
      collection: facts(source),
    })
    expect(
      result.every(
        (item) =>
          !item.compatible &&
          item.providerSourceFingerprint === null &&
          item.reason === "provider-git-source-not-ancestor-or-unavailable",
      ),
    ).toBe(true)
  }
  expect(
    bindVercelSource({
      repository,
      revision,
      collection: facts(baseline),
    }).every((item) => item.compatible),
  ).toBe(true)
})

test("metadata-only, malformed and conflicting source claims refuse", () => {
  const { repository, revision } = fixture()
  for (const mode of ["metadata", "short", "conflict"] as const) {
    const collection = facts(revision)
    for (const deployment of collection.deployments) {
      if (mode === "metadata") {
        deployment.gitSource = undefined
        deployment.meta = { githubCommitSha: revision }
      } else if (mode === "short")
        deployment.gitSource = { sha: revision.slice(0, 7) }
      else deployment.meta = { githubCommitSha: "f".repeat(40) }
    }
    const result = bindVercelSource({ repository, revision, collection })
    expect(result.map((item) => item.reason)).toEqual(
      Array(3).fill(
        mode === "conflict"
          ? "provider-git-source-conflict"
          : "provider-git-source-unavailable",
      ),
    )
    expect(result.every((item) => !item.compatible)).toBe(true)
  }
})

test("wrong ownership, environment, readiness and duplicate observations refuse", () => {
  const { repository, revision } = fixture()
  const mutations: Array<(collection: VercelCollection) => void> = [
    (collection) => {
      collection.projects[0].projectId = "foreign"
    },
    (collection) => {
      collection.projects[0].teamId = "foreign"
    },
    (collection) => {
      collection.projects[0].rootDirectory = "apps/foreign"
    },
    (collection) => {
      collection.projects.push(collection.projects[0])
    },
    (collection) => {
      collection.deployments[0].projectId = "foreign"
    },
    (collection) => {
      collection.deployments[0].target = "production"
    },
    (collection) => {
      collection.deployments[0].readyState = "BUILDING"
    },
    (collection) => {
      collection.deployments.push(collection.deployments[0])
    },
    (collection) => {
      collection.deploymentIds[WEB_TARGETS[0].targetId] = "dpl_invalid/control"
    },
  ]
  for (const mutate of mutations) {
    const collection = facts(revision)
    mutate(collection)
    const result = bindVercelSource({ repository, revision, collection })
    expect(result[0]).toMatchObject({
      compatible: false,
      providerSourceFingerprint: null,
      reason: "provider-deployment-binding-invalid",
    })
  }
})

test("noncommit Git objects, dirty inputs and a different checked-out revision refuse", () => {
  const { repository, revision, git } = fixture()
  git("tag", "-a", "fixture-tag", "-m", "annotated tag")
  const result = bindVercelSource({
    repository,
    revision,
    collection: facts(git("rev-parse", "fixture-tag")),
  })
  expect(
    result.every(
      (item) =>
        !item.compatible &&
        item.reason === "provider-git-source-not-ancestor-or-unavailable",
    ),
  ).toBe(true)
  expect(() =>
    bindVercelSource({
      repository,
      revision: "f".repeat(40),
      collection: facts(revision),
    }),
  ).toThrow("checked-out revision")
  writeFileSync(join(repository, "apps/api/index.ts"), "dirty\n")
  expect(() =>
    bindVercelSource({ repository, revision, collection: facts(revision) }),
  ).toThrow("clean committed release inputs")
})

test("the direct binder independently checks expected environment, provider and trusted coverage", () => {
  const { repository, revision, git } = fixture()
  const collection = facts(revision)
  expect(() =>
    bindSource({ repository, revision, environment: "production", collection }),
  ).toThrow("expected provider and release environment")
  Object.assign(collection, { provider: "foreign" })
  expect(() =>
    bindSource({ repository, revision, environment: "preview", collection }),
  ).toThrow("expected provider and release environment")
  const manifest = JSON.parse(
    readFileSync(join(repository, "release.manifest.json"), "utf8"),
  )
  manifest.targets.find(
    (target: { id: string }) => target.id === "dashboard-web",
  ).sourcePaths = ["apps/dashboard/**"]
  writeFileSync(
    join(repository, "release.manifest.json"),
    JSON.stringify(manifest),
  )
  git("add", ".")
  git("commit", "-qm", "weakened coverage")
  const weakened = git("rev-parse", "HEAD")
  expect(() =>
    bindSource({
      repository,
      revision: weakened,
      environment: "preview",
      collection: facts(weakened),
    }),
  ).toThrow("weakens trusted requirements")
})
