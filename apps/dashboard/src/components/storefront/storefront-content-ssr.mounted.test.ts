import { expect, test } from "bun:test"

test("Studio content deep link server-renders the actual generator in an isolated window-free process", () => {
  // No window/document: the installed App loader takes its server render path.
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--env-file=/dev/null",
      "test",
      "./packages/assistant/evaluations/fixtures/dashboard-storefront-content-ssr.fixture.tsx",
    ],
    {
      cwd: new URL("../../../../../", import.meta.url).pathname,
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        EWATRADE_DATABASE_URL: "postgresql://inert@127.0.0.1:1/inert",
      },
      timeout: 15_000,
    },
  )
  if (result.exitCode !== 0)
    throw Error(
      new TextDecoder().decode(result.stderr) ||
        new TextDecoder().decode(result.stdout),
    )
  expect(result.exitCode).toBe(0)
}, 20_000)
