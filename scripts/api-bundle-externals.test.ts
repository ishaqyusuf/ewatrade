import { afterEach, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  API_BUNDLE_EXTERNALS,
  apiBundleExternalArgs,
} from "./api-bundle-externals.mjs"
import { API_BUILD_RECIPE } from "./release-api-build.mjs"

const root = path.resolve(import.meta.dir, "..")
const scratch: string[] = []

afterEach(() => {
  for (const directory of scratch.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

test("both API bundle paths keep native packages external", () => {
  expect(API_BUNDLE_EXTERNALS).toEqual(["@napi-rs/canvas", "sharp"])
  const api = JSON.parse(
    readFileSync(path.join(root, "apps/api/package.json"), "utf8"),
  )
  // Externals resolve from apps/api/src/bundle.js, so apps/api must link them.
  for (const name of API_BUNDLE_EXTERNALS)
    expect(api.dependencies[name]).toBeString()
  for (const arg of apiBundleExternalArgs())
    expect(API_BUILD_RECIPE.bundle).toContain(arg)
  expect(
    readFileSync(path.join(root, "scripts/build-api-vercel.mjs"), "utf8"),
  ).toContain("...apiBundleExternalArgs()")
})

// Needs installed dependencies and a generated Prisma client (bun run db:generate).
test.skipIf(
  !existsSync(path.join(root, "packages/db/generated/prisma/client.ts")),
)(
  "the API bundles to one file and loads canvas only for receipt images",
  () => {
    const out = mkdtempSync(path.join(tmpdir(), "ewatrade-api-bundle-"))
    scratch.push(out)
    const outfile = path.join(out, "bundle.js")
    const result = spawnSync(
      process.execPath,
      [
        "build",
        "--target=bun",
        "--packages=bundle",
        "--env=disable",
        ...apiBundleExternalArgs(),
        `--outfile=${outfile}`,
        "apps/api/src/index.ts",
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    )
    expect(result.status, result.stderr).toBe(0)
    const bundle = readFileSync(outfile, "utf8")
    // A static import would load canvas's native binary when the API starts.
    expect(bundle).not.toMatch(/^import[^;]*from\s*["']@napi-rs\/canvas["']/m)
    expect(bundle).toContain('import("@napi-rs/canvas")')
    // sharp stays a runtime import instead of inlined code with a broken binary path.
    expect(bundle).toMatch(/^import[^;]*from\s*["']sharp["']/m)
  },
  120_000,
)
