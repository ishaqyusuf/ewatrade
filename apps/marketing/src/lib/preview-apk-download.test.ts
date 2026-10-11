import { expect, test } from "bun:test"
import { APP_UPDATE_SCOPE } from "@ewatrade/utils/app-update"
import { previewApkDownload } from "./preview-apk-download"

const build = {
  ...APP_UPDATE_SCOPE,
  schemaVersion: 1,
  buildNumber: 26,
  appVersion: "1.0.0",
  artifactUrl: "https://expo.dev/artifacts/eas/preview26.apk",
  sha256: "a".repeat(64),
  sizeBytes: 100,
  notes: "",
  revision: 1,
  active: true,
  publishedAt: "2026-10-11T00:00:00Z",
}

test("download follows publication, replacement and withdrawal without caching", async () => {
  let current: unknown = null
  const download = () => previewApkDownload("preview", async () => current)
  expect((await download()).status).toBe(404)
  current = build
  const first = await download()
  expect(first.status).toBe(307)
  expect(first.headers.get("location")).toBe(build.artifactUrl)
  expect(first.headers.get("cache-control")).toBe("no-store")
  current = {
    ...build,
    buildNumber: 27,
    revision: 2,
    artifactUrl: "https://expo.dev/artifacts/eas/preview27.apk",
  }
  expect((await download()).headers.get("location")).toContain("preview27.apk")
  current = { ...build, active: false, revision: 3 }
  const withdrawn = await download()
  expect(withdrawn.status).toBe(404)
  expect(withdrawn.headers.get("location")).toBeNull()
  expect(withdrawn.headers.get("cache-control")).toBe("no-store")
})

test("non-Preview deployments never read or serve the Preview registry", async () => {
  for (const environment of [undefined, "production", "local", "development"]) {
    let reads = 0
    const response = await previewApkDownload(environment, async () => {
      reads++
      return build
    })
    expect(response.status).toBe(404)
    expect(reads).toBe(0)
    expect(response.headers.get("location")).toBeNull()
  }
})

test("invalid scope, unsafe artifact URLs and database failures fail closed", async () => {
  for (const value of [
    { ...build, channel: "production" },
    { ...build, artifactUrl: "https://example.com/app.apk" },
    {
      ...build,
      artifactUrl: "https://expo.dev/artifacts/eas/app.apk?token=secret",
    },
  ]) {
    const response = await previewApkDownload("preview", async () => value)
    expect(response.status).toBe(503)
    expect(response.headers.get("location")).toBeNull()
  }
  const failed = await previewApkDownload("preview", async () => {
    throw new Error("private database details")
  })
  expect(failed.status).toBe(503)
  expect(failed.headers.get("cache-control")).toBe("no-store")
  expect(failed.headers.get("retry-after")).toBe("60")
  expect(await failed.text()).not.toContain("private database")
})
