import { expect, test } from "bun:test"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { matchesAny } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/manifest"
import {
  type ReleaseManifest,
  type ReleaseTargetChange,
  planRelease,
} from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/plan"

const root = resolve(import.meta.dir, "..")
const manifest = JSON.parse(
  readFileSync(resolve(root, "release.manifest.json"), "utf8"),
) as ReleaseManifest

type WorkspacePackage = {
  name: string
  path: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

function packagesIn(directory: "apps" | "packages" | "tooling") {
  if (!existsSync(resolve(root, directory))) return []
  return readdirSync(resolve(root, directory), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`
      const file = resolve(root, path, "package.json")
      if (!existsSync(file)) return []
      const pkg = JSON.parse(readFileSync(file, "utf8")) as Omit<
        WorkspacePackage,
        "path"
      >
      return [{ ...pkg, path }]
    })
}

const workspacePackages = [
  ...packagesIn("apps"),
  ...packagesIn("packages"),
  ...packagesIn("tooling"),
]
const packageByName = new Map(workspacePackages.map((pkg) => [pkg.name, pkg]))

function dependencyClosure(entry: string) {
  const seen = new Set<string>()
  const pending = [entry]
  while (pending.length > 0) {
    const name = pending.pop()
    if (name === undefined) break
    if (seen.has(name)) continue
    seen.add(name)
    const pkg = packageByName.get(name)
    if (!pkg) continue
    for (const dependency of Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
    })) {
      if (packageByName.has(dependency)) pending.push(dependency)
    }
  }
  return [...seen].flatMap((name) => {
    const pkg = packageByName.get(name)
    return pkg ? [pkg.path] : []
  })
}

test("deployed targets cover every transitive workspace dependency", () => {
  const roots: Record<string, string> = {
    "api-web": "@ewatrade/api",
    "dashboard-web": "@ewatrade/dashboard",
    "marketing-web": "@ewatrade/marketing",
    mobile: "@ewatrade/mobile",
    jobs: "@ewatrade/jobs",
  }

  for (const [targetId, entryPackage] of Object.entries(roots)) {
    const target = manifest.targets.find((item) => item.id === targetId)
    expect(target, `${targetId} target exists`).toBeDefined()
    if (!target) throw new Error(`Missing release target ${targetId}`)
    expect(packageByName.has(entryPackage)).toBe(true)
    for (const workspacePath of dependencyClosure(entryPackage)) {
      expect(
        matchesAny(`${workspacePath}/package.json`, target.sourcePaths),
        `${targetId} sourcePaths cover ${workspacePath}`,
      ).toBe(true)
    }
  }
})

test("representative source edits select the expected release targets", () => {
  const allChanges = (path: string): Record<string, ReleaseTargetChange> =>
    Object.fromEntries(
      manifest.targets.map((target) => [
        target.id,
        {
          baseRevision: "a".repeat(40),
          changedPaths: [path],
          ...(target.id === "mobile"
            ? {
                nativeFingerprint: {
                  base: "b".repeat(64),
                  current: "b".repeat(64),
                },
              }
            : {}),
        },
      ]),
    )
  const selected = (path: string) =>
    planRelease(manifest, {
      environment: "preview",
      revision: "c".repeat(40),
      targetChanges: allChanges(path),
    }).actions.map((action) => action.targetId)

  expect(
    selected("packages/db/prisma/migrations/20261003_example/migration.sql"),
  ).toEqual(["api-web", "dashboard-web", "marketing-web", "mobile", "jobs"])
  expect(selected("packages/catalog/src/photos.ts")).toEqual([
    "api-web",
    "dashboard-web",
    "marketing-web",
    "mobile",
    "jobs",
  ])
  expect(selected("packages/private-media/src/storage.ts")).toEqual([
    "api-web",
    "dashboard-web",
    "marketing-web",
    "mobile",
    "jobs",
  ])
  expect(selected("packages/notifications/src/index.ts")).toEqual([
    "api-web",
    "dashboard-web",
    "marketing-web",
    "mobile",
    "jobs",
  ])
  expect(selected("apps/mobile/src/app/index.tsx")).toEqual(["mobile"])
  expect(selected("apps/mobile/ios/EwaTrade/Info.plist")).toEqual(["mobile"])
  const nativePlan = planRelease(manifest, {
    environment: "preview",
    revision: "c".repeat(40),
    targetChanges: allChanges("apps/mobile/ios/EwaTrade/Info.plist"),
  })
  expect(
    nativePlan.actions.find((action) => action.targetId === "mobile")?.action,
  ).toBe("mobile-build")
  const javascriptPlan = planRelease(manifest, {
    environment: "preview",
    revision: "c".repeat(40),
    targetChanges: allChanges("apps/mobile/src/app/index.tsx"),
  })
  expect(
    javascriptPlan.actions.find((action) => action.targetId === "mobile")
      ?.action,
  ).toBe("mobile-update")
  expect(selected("scripts/deploy-api.mjs")).toEqual([
    "api-web",
    "dashboard-web",
    "marketing-web",
  ])
  expect(selected("apps/api/src/trpc/routers/_app.ts")).toContain("mobile")
})

test("shared lockfile and build orchestrator affect every deployed target", () => {
  const deployed = manifest.targets.filter((target) => target.id !== "database")
  for (const path of ["package.json", "bun.lock", "turbo.json"]) {
    expect(
      deployed
        .filter((target) => matchesAny(path, target.sourcePaths))
        .map((target) => target.id),
    ).toEqual(["api-web", "dashboard-web", "marketing-web", "mobile", "jobs"])
  }
  const mobile = manifest.targets.find((target) => target.id === "mobile")
  if (!mobile) throw new Error("Missing mobile target")
  expect(
    matchesAny(
      "patches/react-native-css@3.0.1.patch",
      mobile.nativeCandidatePaths ?? [],
    ),
  ).toBe(true)
  for (const path of [
    ".release/ewatrade-provider-bundle.ts",
    ".release/release-adapter.ts",
    "release.manifest.json",
    "scripts/release.ts",
    "scripts/release-run.ts",
    "scripts/release-verify.ts",
    "scripts/release-baselines.ts",
    "scripts/release-expo-collect.ts",
    "scripts/release-provider-http.ts",
    "scripts/release-vercel-collect.ts",
    "scripts/release-notify.ts",
    "scripts/release-trigger-collect.ts",
    "scripts/release-collect.ts",
    "scripts/release-mobile-fingerprint.ts",
    "scripts/release-mobile-source.ts",
    "scripts/release-mobile-sandbox.ts",
    "scripts/release-mobile-snapshot.ts",
    "scripts/release-mobile-toolchain.ts",
    "scripts/release-mobile-runtime.ts",
    "scripts/release-mobile-build-policy.ts",
    "scripts/release-mobile-build-preflight.ts",
    ".release/policy.json",
    ".github/workflows/release-assurance.yml",
    ".github/workflows/release-collect.yml",
  ]) {
    expect(
      manifest.targets.every((target) => matchesAny(path, target.sourcePaths)),
      path,
    ).toBe(true)
  }
  for (const target of manifest.targets.filter((item) => item.kind === "web")) {
    expect(matchesAny(".vercelignore", target.sourcePaths), target.id).toBe(
      true,
    )
  }
  for (const path of [
    "scripts/environment-profile.mjs",
    "scripts/database-profile.mjs",
    "scripts/with-workspace-env.mjs",
  ]) {
    for (const targetId of ["api-web", "jobs"]) {
      const target = manifest.targets.find((item) => item.id === targetId)
      if (!target) throw new Error(`Missing release target ${targetId}`)
      expect(matchesAny(path, target.sourcePaths), `${targetId}: ${path}`).toBe(
        true,
      )
    }
  }
})

test("API preparation covers its complete committed snapshot selection", () => {
  const api = manifest.targets.find((target) => target.id === "api-web")
  if (!api) throw new Error("Missing API target")
  for (const source of [
    "apps/dashboard/package.json",
    "apps/mobile/package.json",
    "packages/unreferenced-workspace/src/index.ts",
    "tooling/build-tools/package.json",
    "patches/dependency.patch",
    "scripts/release-api-build.mjs",
    "tsconfig.json",
    "bunfig.toml",
    "biome.json",
    "biome.jsonc",
  ])
    expect(matchesAny(source, api.sourcePaths), source).toBe(true)
  expect(matchesAny("apps/mobile/src/app/index.tsx", api.sourcePaths)).toBe(
    false,
  )
})

test("DB push is outside the five-target application gate while Prisma source still affects apps", () => {
  expect(manifest.targets.map((target) => target.id)).toEqual([
    "api-web",
    "dashboard-web",
    "marketing-web",
    "mobile",
    "jobs",
  ])
  expect(
    manifest.targets.every(
      (target) => !(target.prerequisites ?? []).includes("database"),
    ),
  ).toBe(true)
  for (const id of ["api-web", "jobs"]) {
    expect(
      manifest.targets.some(
        (target) =>
          target.id === id &&
          matchesAny("packages/db/prisma/schema.prisma", target.sourcePaths),
      ),
    ).toBe(true)
  }
})
