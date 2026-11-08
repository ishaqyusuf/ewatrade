import { expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  assertSmokeReceipt,
  freshReceipt,
  requiredSmokeSurfaces,
  validFastReceipt,
} from "./qa-release"
import {
  assertEquivalentComponentSource,
  assertMaestroReport,
  inspectPreviewDeployment,
  parseExpoUpdateManifest,
  readSmokeConfig,
  verifyAndroidBuild,
  verifyAndroidDocumentationSource,
  verifyAndroidUpdate,
} from "./qa-smoke"

const sha = "a".repeat(40)
const time = Date.parse("2026-10-26T09:00:00Z")
const completedAt = new Date(time).toISOString()

test("Android accepts only known ancestor source with documentation-only differences", () => {
  const directory = mkdtempSync(join(tmpdir(), "qa-android-source-"))
  const run = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], {
      cwd: directory,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
    })
    if (result.exitCode !== 0)
      throw new Error(`Fixture Git failed: ${result.stderr}`)
    return result.stdout.toString().trim()
  }
  const commit = (path: string) => {
    mkdirSync(join(directory, path, ".."), { recursive: true })
    writeFileSync(join(directory, path), `${path}\n`)
    run("add", "--", path)
    run(
      "-c",
      "user.name=QA",
      "-c",
      "user.email=qa@example.test",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture",
    )
    return run("rev-parse", "HEAD")
  }
  try {
    run("init", "-q")
    const deployed = commit("apps/mobile/index.ts")
    expect(deployed).toMatch(/^[a-f0-9]{40}$/)
    expect(
      verifyAndroidDocumentationSource(directory, deployed, deployed),
    ).toBe(deployed)
    commit("docs/verification/result.md")
    const documented = commit("AGENT_CHAT.md")
    expect(
      verifyAndroidDocumentationSource(directory, deployed, documented),
    ).toBe(deployed)
    expect(() =>
      verifyAndroidDocumentationSource(directory, documented, deployed),
    ).toThrow()
    for (const unknown of [undefined, "HEAD", "bad", "f".repeat(40)])
      expect(() =>
        verifyAndroidDocumentationSource(directory, unknown, documented),
      ).toThrow()
    // Every non-document path is refused, including harness and dependency edits.
    let parent = documented
    for (const path of [
      ".maestro/smoke.yaml",
      "scripts/qa-smoke.ts",
      "bun.lock",
      "release.config.ts",
      "apps/mobile/next.ts",
      "docs/runtime.json",
      "unexpected.md",
      " docs/disguised.md",
    ]) {
      const changed = commit(path)
      expect(() =>
        verifyAndroidDocumentationSource(directory, parent, changed),
      ).toThrow()
      parent = changed
    }
    run("mv", "apps/mobile/index.ts", "docs/verification/renamed.md")
    run(
      "-c",
      "user.name=QA",
      "-c",
      "user.email=qa@example.test",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "rename source",
    )
    expect(() =>
      verifyAndroidDocumentationSource(
        directory,
        parent,
        run("rev-parse", "HEAD"),
      ),
    ).toThrow()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("unchanged deployed dependencies can qualify while changed component source cannot", () => {
  expect(() => assertEquivalentComponentSource("older", sha, [])).not.toThrow()
  expect(() =>
    assertEquivalentComponentSource("older", sha, ["apps/api/src/index.ts"]),
  ).toThrow()
  expect(() => assertEquivalentComponentSource(sha, sha, [])).not.toThrow()
})

test("an empty, failed or skipped native report cannot earn a passing receipt", () => {
  expect(() =>
    assertMaestroReport(
      '<testsuite tests="1"><testcase name="smoke"/></testsuite>',
    ),
  ).not.toThrow()
  for (const report of [
    "",
    '<testsuite tests="0"/>',
    "<testcase><failure/></testcase>",
    "<testcase><skipped/></testcase>",
    '<testsuite errors="1"><testcase/></testsuite>',
  ])
    expect(() => assertMaestroReport(report)).toThrow()
})

test("release verification selects only required surfaces and never treats iOS as Android", () => {
  expect(requiredSmokeSurfaces(["dashboard", "api"])).toEqual(["web"])
  expect(requiredSmokeSurfaces(["mobile"])).toEqual(["android"])
  expect(requiredSmokeSurfaces(["mobile", "database"])).toEqual([
    "web",
    "android",
  ])
  expect(requiredSmokeSurfaces([])).toEqual([])
})
test("source evidence must be clean, successful, fresh and exactly the candidate", () => {
  const receipt = {
    version: 1,
    sha,
    status: "passed",
    clean: true,
    completedAt,
  }
  expect(validFastReceipt(receipt, sha, time)).toBe(true)
  expect(validFastReceipt(receipt, sha, time, "changed-toolkit")).toBe(false)
  for (const edit of [
    { sha: "b".repeat(40) },
    { clean: false },
    { status: "failed" },
    { completedAt: "invalid" },
    { completedAt: new Date(time - 25 * 3600000).toISOString() },
  ])
    expect(validFastReceipt({ ...receipt, ...edit }, sha, time)).toBe(false)
  expect(freshReceipt(new Date(time + 120000).toISOString(), time)).toBe(false)
})
test("Production refuses stale/config-mismatched/local/unknown/failed smoke", () => {
  const receipt = {
    version: 1,
    sha,
    surface: "web",
    target: "preview",
    status: "passed",
    clean: true,
    runtimeVerified: true,
    runtimeIds: ["dpl_fixture"],
    configHash: "config",
    completedAt,
  }
  expect(() =>
    assertSmokeReceipt(receipt, sha, "web", "config", time),
  ).not.toThrow()
  for (const edit of [
    { target: "local" },
    { runtimeVerified: false },
    { runtimeIds: [] },
    { status: "failed" },
    { configHash: "another" },
    { surface: "android" },
    { sha: "b".repeat(40) },
    { clean: false },
    { completedAt: "invalid" },
  ])
    expect(() =>
      assertSmokeReceipt({ ...receipt, ...edit }, sha, "web", "config", time),
    ).toThrow()
})
test("Preview web binding requires owned Ready deployment with provider source, not descriptive metadata", () => {
  const good = {
    id: "dpl_fixture",
    url: "fixture.vercel.app",
    projectId: "prj_fixture",
    ownerId: "team_fixture",
    target: null,
    createdAt: Date.now() - 2000,
    ready: Date.now() - 1000,
    readyState: "READY",
    gitSource: { sha },
  }
  const expected = { sha, projectId: "prj_fixture", teamId: "team_fixture" }
  expect(inspectPreviewDeployment(good, expected)).toBe("dpl_fixture")
  for (const edit of [
    { ownerId: "other" },
    { projectId: "other" },
    { readyState: "BUILDING" },
    { target: "production" },
    { gitSource: undefined, meta: { githubCommitSha: sha } },
  ])
    expect(() =>
      inspectPreviewDeployment({ ...good, ...edit }, expected),
    ).toThrow()
})
test("Android build and active OTA source cannot stand in for each other", () => {
  const build = {
    id: "build",
    status: "FINISHED",
    platform: "ANDROID",
    channel: "preview",
    projectId: "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b",
    gitCommitHash: sha,
    appBuildVersion: "35",
  }
  expect(() => verifyAndroidBuild(build, sha, "build", "35")).not.toThrow()
  expect(() => verifyAndroidBuild(build, sha, "build", "34")).toThrow()
  expect(() =>
    verifyAndroidBuild({ ...build, gitCommitHash: "old" }, sha, "build", "35"),
  ).toThrow()
  const update = {
    id: "update",
    group: "group",
    platform: "android",
    branch: "preview",
    gitCommitHash: sha,
    manifestPermalink:
      "https://u.expo.dev/532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b?updateId=update",
    isRollBackToEmbedded: false,
  }
  expect(verifyAndroidUpdate([update], sha, "group")).toBe("update")
  for (const edit of [
    { gitCommitHash: "old" },
    { branch: "production" },
    { manifestPermalink: "https://u.expo.dev/other" },
    { isRollBackToEmbedded: true },
  ])
    expect(() =>
      verifyAndroidUpdate([{ ...update, ...edit }], sha, "group"),
    ).toThrow()
})
test("current Expo permalink proves project, update and runtime from its manifest", () => {
  const id = "01a1b78d-f40a-7649-a632-4ce07bbc200f"
  const update = {
    id,
    group: "group",
    platform: "android",
    branch: "preview",
    gitCommitHash: sha,
    runtimeVersion: "native-fingerprint",
    manifestPermalink: `https://u.expo.dev/update/${id}`,
  }
  const manifest = {
    id,
    runtimeVersion: update.runtimeVersion,
    extra: { eas: { projectId: "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b" } },
  }
  const part = `\r\nContent-Disposition: form-data; name="manifest"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(manifest)}\r\n`
  const multipart = `--ExpoBoundary${part}--ExpoBoundary--\r\n`
  expect(parseExpoUpdateManifest(multipart)).toEqual(manifest)
  expect(parseExpoUpdateManifest(JSON.stringify(manifest))).toEqual(manifest)
  expect(
    verifyAndroidUpdate(
      [update],
      sha,
      "group",
      parseExpoUpdateManifest(multipart),
    ),
  ).toBe(id)
  for (const body of [
    undefined,
    {},
    { ...manifest, id: "other" },
    { ...manifest, runtimeVersion: "other" },
    { ...manifest, extra: { eas: { projectId: "other-project" } } },
  ])
    expect(() => verifyAndroidUpdate([update], sha, "group", body)).toThrow()
  for (const edit of [
    { gitCommitHash: "old" },
    { branch: "production" },
    { group: "other" },
    { isRollBackToEmbedded: true },
    { manifestPermalink: "https://u.expo.dev/update/other" },
    { manifestPermalink: `http://u.expo.dev/update/${id}` },
  ])
    expect(() =>
      verifyAndroidUpdate([{ ...update, ...edit }], sha, "group", manifest),
    ).toThrow()
  expect(() =>
    parseExpoUpdateManifest(
      `--ExpoBoundary${part}--ExpoBoundary${part}--ExpoBoundary--`,
    ),
  ).toThrow()
  expect(() => parseExpoUpdateManifest("not a manifest")).toThrow()
})
test("smoke rejects Production origins/apps instead of creating new QA data", () => {
  const directory = mkdtempSync(join(tmpdir(), "qa-smoke-config-"))
  const file = join(directory, "config.json")
  const good = {
    qaDomain: "test.qa.test",
    web: {
      origin: "https://ewatrade-dashboard.localhost",
      profileLabel: "owner",
      catalogItem: "Item",
      expectedTotal: "₦500",
    },
  }
  try {
    writeFileSync(file, JSON.stringify(good))
    expect(readSmokeConfig(file, "local").qaDomain).toBe("test.qa.test")
    writeFileSync(
      file,
      JSON.stringify({
        ...good,
        web: { ...good.web, origin: "https://dash.ewatrade.com" },
      }),
    )
    expect(() => readSmokeConfig(file, "local")).toThrow()
    writeFileSync(
      file,
      JSON.stringify({
        ...good,
        android: { appId: "com.ewatrade.app", device: "device" },
      }),
    )
    expect(() => readSmokeConfig(file, "local")).toThrow()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
