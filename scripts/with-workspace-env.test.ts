import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"

const fixtures: string[] = []
afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true })
})

function createFixture(
  database = "postgresql://fixture@ep-dev.neon.tech/neondb",
) {
  const fixture = mkdtempSync(join(tmpdir(), "ewatrade-launcher-"))
  fixtures.push(fixture)
  const root = join(fixture, "repo")
  const bin = join(fixture, "bin")
  mkdirSync(join(root, "scripts"), { recursive: true })
  mkdirSync(bin)
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ workspaces: ["apps/*"] }),
  )
  writeFileSync(join(root, ".env.local"), `EWATRADE_DATABASE_URL=${database}\n`)
  writeFileSync(
    join(root, ".env.production"),
    "EWATRADE_DATABASE_URL=postgresql://fixture@ep-prod.neon.tech/neondb\n",
  )
  for (const file of [
    "with-workspace-env.mjs",
    "environment-profile.mjs",
    "database-profile.mjs",
  ]) {
    copyFileSync(join(import.meta.dir, file), join(root, "scripts", file))
  }
  symlinkSync(
    resolve(import.meta.dir, "../../local-infra-kit"),
    join(fixture, "local-infra-kit"),
  )
  const portless = join(bin, "portless")
  writeFileSync(
    portless,
    `#!/usr/bin/env node
const fs = require("node:fs");
const count = fs.existsSync(process.env.FIXTURE_MARKER) ? Number(fs.readFileSync(process.env.FIXTURE_MARKER, "utf8")) : 0;
fs.writeFileSync(process.env.FIXTURE_MARKER, String(count + 1));
if (process.argv.includes("--lock-fixture") && count === 0) {
  console.error("Failed to acquire route lock");
  process.exit(1);
}
fs.writeFileSync(process.env.FIXTURE_RESULT, JSON.stringify({
  invocations: count + 1,
  profile: process.env.DEV_PROFILE,
  mode: process.env.EWATRADE_ENV_MODE,
  verified: process.env.DATABASE_PROFILE_VERIFIED,
  legacyDatabase: process.env.DATABASE_URL ?? null,
  databaseHost: new URL(process.env.EWATRADE_DATABASE_URL).hostname,
  args: process.argv.slice(2),
}));
`,
  )
  chmodSync(portless, 0o755)
  return { root, bin, fixture }
}

async function launch(
  fixture: ReturnType<typeof createFixture>,
  args: string[],
) {
  const resultPath = join(fixture.fixture, "result.json")
  const child = spawnSync("node", ["scripts/with-workspace-env.mjs", ...args], {
    cwd: fixture.root,
    env: {
      PATH: [fixture.bin, process.env.PATH].join(delimiter),
      DEV_PROFILE: "local",
      DATABASE_URL: "postgresql://unrelated.example/wrong",
      FIXTURE_MARKER: join(fixture.fixture, "marker"),
      FIXTURE_RESULT: resultPath,
    },
    timeout: 10_000,
    stdio: "ignore",
  })
  return {
    output: existsSync(resultPath)
      ? JSON.parse(readFileSync(resultPath, "utf8"))
      : null,
    exitCode: child.status,
  }
}

describe("workspace env launch through local-infra", () => {
  test("the shared Portless launcher retries a lock conflict with validated EwaTrade env", async () => {
    const result = await launch(createFixture(), [
      "portless",
      "ewatrade-api",
      "--lock-fixture",
    ])
    expect(result.exitCode).toBe(0)
    expect(result.output).toEqual({
      invocations: 2,
      profile: "local",
      mode: "local",
      verified: "1",
      legacyDatabase: null,
      databaseHost: "ep-dev.neon.tech",
      args: ["ewatrade-api", "--lock-fixture"],
    })
  }, 10_000)

  test("rejects Docker before handing off to the shared launcher", async () => {
    const result = await launch(
      createFixture("postgresql://fixture@localhost:5432/app"),
      ["portless", "ewatrade-api"],
    )
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toBeNull()
  })

  test("rejects a local profile pointing at production before shared cleanup", async () => {
    const result = await launch(
      createFixture("postgresql://fixture@ep-prod.neon.tech/neondb"),
      ["portless", "ewatrade-api"],
    )
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toBeNull()
  })
})
