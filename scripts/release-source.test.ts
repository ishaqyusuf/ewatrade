import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ReleaseManifest } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/plan"
import {
  assertReleaseRevision,
  assertSourceEvidence,
  assertTrustedTopology,
  committedManifest,
  committedSourceFingerprints,
  dirtyReleaseInputs,
} from "./release-source"

const fixtures: string[] = []
const manifest: ReleaseManifest = {
  version: 1,
  project: "ewatrade",
  targets: [
    {
      id: "dashboard-web",
      kind: "web",
      environments: ["preview", "production"],
      sourcePaths: ["app.ts", "release.manifest.json"],
    },
  ],
}
function fixture() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "ewatrade-release-source-")),
  )
  fixtures.push(root)
  writeFileSync(join(root, "release.manifest.json"), JSON.stringify(manifest))
  writeFileSync(
    join(root, "app.ts"),
    'throw new Error("candidate code must not execute")',
  )
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  git("init", "-q")
  git("config", "user.name", "Release Test")
  git("config", "user.email", "release@example.test")
  git("add", ".")
  git("commit", "-qm", "fixture")
  const revision = git("rev-parse", "HEAD")
  return { root, git, revision }
}
afterEach(() => {
  for (const root of fixtures.splice(0))
    rmSync(root, { recursive: true, force: true })
})

test("source fingerprints read Git objects without evaluating candidate code", () => {
  const { root, revision } = fixture()
  expect(assertReleaseRevision(root, revision)).toBe(root)
  const hashes = committedSourceFingerprints(
    root,
    revision,
    committedManifest(root, revision),
  )
  expect(hashes["dashboard-web"]).toMatch(/^[0-9a-f]{64}$/)
  expect(() => assertSourceEvidence(hashes, hashes)).not.toThrow()
  expect(() => assertSourceEvidence(hashes, undefined)).toThrow("missing")
  expect(() =>
    assertSourceEvidence(hashes, { "dashboard-web": "0".repeat(64) }),
  ).toThrow("differ")
})

test("fingerprints change with committed content and preserve exact revision", () => {
  const { root, revision, git } = fixture()
  const before = committedSourceFingerprints(root, revision, manifest)
  writeFileSync(join(root, "app.ts"), "changed")
  expect(dirtyReleaseInputs(root, manifest)).toEqual(["app.ts"])
  git("add", "app.ts")
  git("commit", "-qm", "change")
  const next = git("rev-parse", "HEAD")
  expect(committedSourceFingerprints(root, next, manifest)).not.toEqual(before)
  expect(() => assertReleaseRevision(root, revision)).toThrow("exact")
})

test("candidate topology cannot remove a target, environment, path or prerequisite", () => {
  const trusted: ReleaseManifest = {
    ...manifest,
    targets: [
      { ...manifest.targets[0], prerequisites: ["database"] },
      {
        id: "database",
        kind: "database",
        environments: ["preview", "production"],
        sourcePaths: ["schema.prisma"],
      },
    ],
  }
  expect(() => assertTrustedTopology(manifest, trusted)).toThrow("weakens")
  for (const replacement of [
    { sourcePaths: ["app.ts"] },
    { environments: ["preview"] as const },
    { prerequisites: [] },
  ]) {
    const candidate = JSON.parse(JSON.stringify(trusted))
    Object.assign(candidate.targets[0], replacement)
    expect(() => assertTrustedTopology(candidate, trusted)).toThrow("weakens")
  }
  expect(() => assertTrustedTopology(trusted, trusted)).not.toThrow()
})

test("dirty manifest and committed symlink inputs cannot certify a release", () => {
  const { root, revision, git } = fixture()
  writeFileSync(
    join(root, "release.manifest.json"),
    JSON.stringify({ ...manifest, project: "other" }),
  )
  expect(() => committedManifest(root, revision)).toThrow("differs")
  git("checkout", "--", "release.manifest.json")
  rmSync(join(root, "app.ts"))
  symlinkSync("release.manifest.json", join(root, "app.ts"))
  git("add", "app.ts")
  git("commit", "-qm", "symlink")
  expect(() =>
    committedSourceFingerprints(root, git("rev-parse", "HEAD"), manifest),
  ).toThrow("symlinks")
})
