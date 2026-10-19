import { expect, test } from "bun:test"

test("WhatsApp saved-chat attachment lifecycle passes in an isolated mounted runtime", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--env-file=/dev/null",
      "test",
      "./packages/assistant/evaluations/fixtures/whatsapp-chat-attachment-switch.fixture.tsx",
    ],
    {
      cwd: new URL("../../../", import.meta.url).pathname,
      timeout: 10_000,
      env: {
        ...process.env,
        DATABASE_URL: undefined,
        EWATRADE_DATABASE_URL:
          "postgresql://fixture:fixture@127.0.0.1:1/assistant_source_tests",
      },
    },
  )
  if (result.exitCode !== 0)
    throw Error(new TextDecoder().decode(result.stderr))
  expect(result.exitCode).toBe(0)
})
