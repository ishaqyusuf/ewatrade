import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
const scenarioFile = join(
  import.meta.dir,
  "../apps/mobile/src/lib/fixtures/app-update-client-scenario.ts",
)

// Each process owns its native mocks and updater lock, keeping mocks out of
// unrelated Expo tests and exercising both optional-native-module lifetimes.
for (const scenario of [
  "legacy-install",
  "legacy-wrong-app",
  "legacy-missing-reader",
  "legacy-reader-retry",
  "legacy-withdrawn",
  "legacy-replaced",
  "legacy-offline",
  "production",
  "native-install",
  "native-withdrawn",
  "native-verification-failure",
  "native-permission-retry",
  "native-cancel-retry",
  "stale-offer-404",
  "snooze",
  "form-refusal",
  "operation-lock",
  "age-gate",
]) {
  const fixture =
    scenario === "age-gate"
      ? join(
          import.meta.dir,
          "../apps/mobile/src/lib/fixtures/app-update-age-gate-scenario.ts",
        )
      : scenarioFile
  const child = spawnSync(
    process.execPath,
    ["--env-file=/dev/null", fixture, scenario],
    {
      encoding: "utf8",
      timeout: 10000,
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
    },
  )
  const { status: code, stdout, stderr } = child
  assert.deepEqual(
    { code, stdout: stdout.trim(), stderr: stderr.trim() },
    {
      code: 0,
      stdout: `${scenario}: passed`,
      stderr: "",
    },
  )
  console.log(`${scenario}: passed`)
}
