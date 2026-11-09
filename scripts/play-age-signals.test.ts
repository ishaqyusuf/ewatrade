import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

test("actual native adapter handles non-Android, missing/old bridge and disabled access without import-time calls", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--no-env-file",
      fileURLToPath(
        new URL(
          "../apps/mobile/src/lib/fixtures/play-age-native-scenario.ts",
          import.meta.url,
        ),
      ),
    ],
    {
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
      encoding: "utf8",
      timeout: 10000,
    },
  )
  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).toBe("")
  expect(result.stdout.trim()).toBe("play-age-native: passed")
})
