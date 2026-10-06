import { expect, test } from "bun:test"
import { OpenAPIHono } from "@hono/zod-openapi"
import {
  APP_UPDATE_SCOPE,
  parsePublishedBuild,
} from "@ewatrade/utils/app-update"
import { registerAppUpdateRoutes } from "./routes"
const build = parsePublishedBuild({
  ...APP_UPDATE_SCOPE,
  schemaVersion: 1,
  buildNumber: 12,
  appVersion: "1.2.0",
  artifactUrl: "https://expo.dev/artifacts/eas/example.apk",
  sha256: "a".repeat(64),
  sizeBytes: 100,
  notes: "",
  revision: 1,
  active: true,
  publishedAt: "2026-10-03T00:00:00Z",
})
const secret = "test-only-publisher-token-123456789"
function setup(active = true) {
  const app = new OpenAPIHono()
  let writes = 0
  registerAppUpdateRoutes(app, {
    token: () => secret,
    backend: () => "preview",
    read: async () => ({ ...build, active }),
    publish: async () => {
      writes++
      return build
    },
    withdraw: async () => {
      writes++
      return { ...build, active: false }
    },
  })
  return { app, writes: () => writes }
}
test("only exact preview scope receives newer builds; withdrawn/equal builds disappear", async () => {
  const { app } = setup()
  const query = new URLSearchParams({ ...APP_UPDATE_SCOPE, buildNumber: "9" })
  expect(
    (await (await app.request(`/api/mobile/builds/check?${query}`)).json())
      .build.buildNumber,
  ).toBe(12)
  for (const changed of [
    { buildNumber: "12" },
    { channel: "production" },
    { applicationId: "com.ewatrade" },
    { platform: "ios" },
  ]) {
    expect(
      await (
        await app.request(
          `/api/mobile/builds/check?${new URLSearchParams({ ...APP_UPDATE_SCOPE, buildNumber: "9", ...changed })}`,
        )
      ).json(),
    ).toEqual({ build: null })
  }
  expect(
    await (
      await setup(false).app.request(`/api/mobile/builds/check?${query}`)
    ).json(),
  ).toEqual({ build: null })
})
test("publisher requires token, backend match and valid CAS payload", async () => {
  const { app, writes } = setup()
  const headers = {
    Authorization: `Bearer ${secret}`,
    "x-app-update-backend": "preview",
    "Content-Type": "application/json",
  }
  expect((await app.request("/api/internal/mobile/builds")).status).toBe(401)
  expect(
    (
      await app.request("/api/internal/mobile/builds", {
        headers: { ...headers, "x-app-update-backend": "production" },
      })
    ).status,
  ).toBe(409)
  expect(
    (
      await app.request("/api/internal/mobile/builds", {
        method: "POST",
        headers,
        body: JSON.stringify({ build, expectedRevision: -1 }),
      })
    ).status,
  ).toBe(400)
  expect(writes()).toBe(0)
  const result = await app.request("/api/internal/mobile/builds", {
    method: "POST",
    headers,
    body: JSON.stringify({ build, expectedRevision: 0 }),
  })
  expect(result.status).toBe(200)
  expect(result.headers.get("cache-control")).toBe("no-store")
  expect(writes()).toBe(1)
})
