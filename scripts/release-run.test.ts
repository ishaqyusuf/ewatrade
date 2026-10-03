import { expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  type ReleaseStep,
  releaseRunEnvironment,
  releaseRunSchemaFingerprint,
  runRelease,
} from "./release-run"

function fixture(codes: number[] = [], env: NodeJS.ProcessEnv = {}) {
  const calls: ReleaseStep[] = []
  const messages: string[] = []
  return {
    calls,
    messages,
    dependencies: {
      env,
      log: (message: string) => {
        messages.push(message)
      },
      execute: async (step: ReleaseStep) => {
        calls.push(step)
        return codes.shift() ?? 0
      },
    },
  }
}

test("local and selected environment must finish before the default advisory plan", async () => {
  for (const environment of ["preview", "production"]) {
    const f = fixture()
    expect(await runRelease(["--env", environment], f.dependencies)).toBe(0)
    expect(f.calls.map((step) => step.argv)).toEqual([
      ["bun", "--env-file=/dev/null", "run", "db:push", "--local"],
      [
        "bun",
        "--env-file=/dev/null",
        "run",
        "db:push",
        environment === "preview" ? "--preview" : "--prod",
      ],
      [
        "bun",
        "--env-file=/dev/null",
        "run",
        "release:plan",
        "--env",
        environment,
      ],
    ])
  }
})

test("failure or cancellation preserves exit status and prevents every later stage", async () => {
  for (const codes of [[1], [130], [0, 1], [0, 130], [0, 0, 7]]) {
    const expectedCalls = codes.length
    const expectedCode = codes.at(-1)
    if (expectedCode === undefined) throw new Error("Missing failure fixture")
    const f = fixture([...codes])
    expect(
      await runRelease(
        ["--env", "production", "--then", "api:deploy"],
        f.dependencies,
      ),
    ).toBe(expectedCode)
    expect(f.calls.length).toBe(expectedCalls)
  }
})

test("chosen deployment is bound to the selected environment before any DB command", async () => {
  for (const [environment, script] of [
    ["preview", "api:preview:deploy"],
    ["production", "api:deploy"],
    ["production", "jobs:deploy"],
  ]) {
    const f = fixture()
    expect(
      await runRelease(
        ["--env", environment, "--then", script],
        f.dependencies,
      ),
    ).toBe(0)
    expect(f.calls[2]?.argv).toEqual([
      "bun",
      "--env-file=/dev/null",
      "run",
      script,
    ])
  }
  for (const args of [
    ["--env", "preview", "--then", "api:deploy"],
    ["--env", "production", "--then", "api:preview:deploy"],
    ["--env", "preview", "--then", "jobs:deploy"],
    ["--env", "production", "--then", "db:push"],
    ["--env", "production", "--then", "release:run"],
    ["--env", "production", "--accept-data-loss"],
    ["--env", "production", "--", "--force-reset"],
    ["--env", "production", "--env", "preview"],
    ["--env", "local"],
  ]) {
    const f = fixture()
    await expect(runRelease(args, f.dependencies)).rejects.toThrow()
    expect(f.calls).toEqual([])
  }
})

test("dry-run and help are readonly; mutation is refused in CI", async () => {
  for (const args of [["--help"], ["--env", "production", "--dry-run"]]) {
    const f = fixture([], { CI: "true" })
    expect(await runRelease(args, f.dependencies)).toBe(0)
    expect(f.calls).toEqual([])
    expect(f.messages.length).toBeGreaterThan(0)
  }
  const f = fixture([], { CI: "true" })
  await expect(
    runRelease(["--env", "production"], f.dependencies),
  ).rejects.toThrow("outside CI")
  expect(f.calls).toEqual([])
})

test("a carried-over DATABASE_URL cannot override explicit infra profile selection", () => {
  const parent = {
    DATABASE_URL: "postgres://wrong.invalid/example",
    PATH: "/fake/path",
    PREVIEW_DATABASE_URL: "selected-profile-value",
  }
  const child = releaseRunEnvironment(parent)
  expect(child.DATABASE_URL).toBeUndefined()
  expect(child.PREVIEW_DATABASE_URL).toBe(parent.PREVIEW_DATABASE_URL)
  expect(child.PATH).toBe(parent.PATH)
  expect(parent.DATABASE_URL).toBeDefined()
})

test("schema edits between stages prevent a hosted push or application continuation", async () => {
  for (const changeAfter of [1, 2]) {
    const calls: ReleaseStep[] = []
    let source = "locally-tested-schema"
    await expect(
      runRelease(["--env", "preview"], {
        env: {},
        log: () => {},
        schemaFingerprint: () => source,
        execute: async (step) => {
          calls.push(step)
          if (calls.length === changeAfter) source = "concurrent-new-schema"
          return 0
        },
      }),
    ).rejects.toThrow("schema changed")
    expect(calls.length).toBe(changeAfter)
  }
})

test("the schema snapshot binds file contents, membership and Prisma configuration", () => {
  const root = mkdtempSync(join(tmpdir(), "ewatrade-release-schema-"))
  const schema = join(root, "packages/db/prisma")
  mkdirSync(schema, { recursive: true })
  const config = join(root, "packages/db/prisma.config.ts")
  const first = join(schema, "schema.prisma")
  const extra = join(schema, "extra.prisma")
  try {
    writeFileSync(config, "// fixture config\n")
    writeFileSync(first, "// first schema\n")
    const baseline = releaseRunSchemaFingerprint(root)
    writeFileSync(first, "// modified schema\n")
    expect(releaseRunSchemaFingerprint(root)).not.toBe(baseline)
    writeFileSync(first, "// first schema\n")
    expect(releaseRunSchemaFingerprint(root)).toBe(baseline)
    writeFileSync(extra, "// new model file\n")
    expect(releaseRunSchemaFingerprint(root)).not.toBe(baseline)
    rmSync(extra)
    writeFileSync(config, "// changed schema path\n")
    expect(releaseRunSchemaFingerprint(root)).not.toBe(baseline)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
