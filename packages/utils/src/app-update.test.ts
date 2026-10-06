import { describe, expect, test } from "bun:test"
import {
  APP_UPDATE_SCOPE,
  isNewerBuild,
  parseBuildNumber,
  parseMobileBuild,
  parsePublishedBuild,
} from "./app-update"
export const fixture = {
  ...APP_UPDATE_SCOPE,
  schemaVersion: 1,
  buildNumber: 12,
  appVersion: "1.2.0",
  artifactUrl: "https://expo.dev/artifacts/eas/example.apk",
  sha256: "a".repeat(64),
  sizeBytes: 100,
  notes: "Preview changes",
}
describe("native build contract", () => {
  test("compares native numbers, not app versions", () => {
    const build = parsePublishedBuild({
      ...fixture,
      revision: 1,
      active: true,
      publishedAt: "2026-10-03T00:00:00Z",
    })
    expect(isNewerBuild(build, { ...APP_UPDATE_SCOPE, buildNumber: 9 })).toBe(
      true,
    )
    expect(isNewerBuild(build, { ...APP_UPDATE_SCOPE, buildNumber: 12 })).toBe(
      false,
    )
    expect(
      isNewerBuild(
        { ...build, active: false },
        { ...APP_UPDATE_SCOPE, buildNumber: 9 },
      ),
    ).toBe(false)
  })
  test.each([0, -1, "", "01", "1.1", "1e2", 2100000001, null])(
    "rejects invalid build number %j",
    (value) => expect(() => parseBuildNumber(value)).toThrow(),
  )
  test.each([
    { applicationId: "com.ewatrade" },
    { channel: "production" },
    { platform: "ios" },
    { distribution: "store" },
    { artifactUrl: "http://expo.dev/artifacts/eas/example.apk" },
    { artifactUrl: "https://evil.test/example.apk" },
    { artifactUrl: "https://expo.dev/artifacts/eas/example.apk?token=secret" },
    { sha256: "bad" },
    { sizeBytes: 536870913 },
  ])("rejects unsupported or unsafe metadata %j", (override) =>
    expect(() => parseMobileBuild({ ...fixture, ...override })).toThrow(),
  )
})
