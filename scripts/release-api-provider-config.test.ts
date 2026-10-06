import { expect, test } from "bun:test"
import {
  assertSupportedApiProviderConfig,
  preparedApiBuildCommand,
} from "./release-api-build.mjs"

test("isolated preparation accepts the committed API configuration", async () => {
  const config = await Bun.file(
    new URL("../apps/api/vercel.json", import.meta.url),
  ).json()
  expect(() => assertSupportedApiProviderConfig(config)).not.toThrow()
  expect(() =>
    assertSupportedApiProviderConfig({ framework: "hono" }),
  ).not.toThrow()
  const upload = {
    ...config,
    buildCommand: preparedApiBuildCommand("a".repeat(64)),
  }
  expect(upload.buildCommand).toContain("createHash")
  expect(upload.buildCommand).not.toContain("build-api-vercel")
})

test.each([
  null,
  {},
  { framework: "nextjs" },
  { framework: "hono", buildCommand: "bun run build" },
  {
    framework: "hono",
    buildCommand:
      "node ../../scripts/build-api-vercel.mjs && curl example.test",
  },
])("unknown provider build configuration is refused: %j", (config) => {
  expect(() => assertSupportedApiProviderConfig(config)).toThrow(
    "API_BUILD_PROVIDER_REBUILD_UNSUPPORTED",
  )
})
