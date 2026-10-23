import { expect, test } from "bun:test"

test("Store contact dialog lifecycle passes in an isolated mounted runtime", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--env-file=/dev/null",
      "test",
      "./apps/dashboard/src/components/stores/store-contact-row.fixture.tsx",
    ],
    {
      cwd: new URL("../../../../../", import.meta.url).pathname,
      timeout: 10_000,
      env: {
        ...process.env,
        DATABASE_URL: undefined,
        EWATRADE_DATABASE_URL: undefined,
      },
    },
  )
  if (result.exitCode !== 0)
    throw Error(new TextDecoder().decode(result.stderr))
  expect(result.exitCode).toBe(0)
}, 15_000)
