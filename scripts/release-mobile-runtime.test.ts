import { expect, test } from "bun:test"
import {
  assertExpoConfigOwnership,
  declaredRuntimePolicy,
  parseExpoFingerprint,
  parseResolvedRuntime,
  resolveRuntimeVersion,
} from "./release-mobile-runtime"

const hash = "a".repeat(40)
test("refuses native source configured for a fallback or foreign Expo project", () => {
  const expected = { projectId: "owned", owner: "primary", slug: "app" }
  const config = {
    owner: "primary",
    slug: "app",
    extra: { eas: { projectId: "owned" } },
  }
  expect(() => assertExpoConfigOwnership(config, expected)).not.toThrow()
  expect(() =>
    assertExpoConfigOwnership({ ...config, owner: "fallback" }, expected),
  ).toThrow("owned primary project")
  expect(() =>
    assertExpoConfigOwnership(
      { ...config, extra: { eas: { projectId: "foreign" } } },
      expected,
    ),
  ).toThrow("owned primary project")
})
function fingerprint(platform: "android" | "ios") {
  return {
    hash,
    sources: [
      "expoConfig",
      "package:react-native",
      `expoAutolinkingConfig:${platform}`,
      `rncoreAutolinkingConfig:${platform}`,
    ].map((id) => ({ type: "contents", id, hash })),
  }
}

test("refuses aggregate hashes after Expo silently omitted native contributors", () => {
  expect(
    parseExpoFingerprint(JSON.stringify(fingerprint("android")), "android"),
  ).toBe(hash)
  const missing = fingerprint("android")
  missing.sources.pop()
  expect(() =>
    parseExpoFingerprint(JSON.stringify(missing), "android"),
  ).toThrow("required native fingerprint contributor")
  expect(() => parseExpoFingerprint(JSON.stringify({ hash }), "ios")).toThrow(
    "source inventory",
  )
  expect(() =>
    parseExpoFingerprint(JSON.stringify(fingerprint("android")), "ios"),
  ).toThrow("required native fingerprint contributor")
})

test("honors platform runtime overrides and resolves appVersion from the top-level version", () => {
  const config = {
    version: "2.0.0",
    runtimeVersion: { policy: "appVersion" },
    android: {
      version: "wrong-platform-version",
      runtimeVersion: "android-native",
    },
  }
  expect(resolveRuntimeVersion(config, "android", hash)).toBe("android-native")
  expect(declaredRuntimePolicy(config, "android")).toBe("explicit")
  expect(declaredRuntimePolicy(config, "ios")).toBe("appVersion")
  expect(
    declaredRuntimePolicy({ runtimeVersion: { policy: "fingerprint" } }, "ios"),
  ).toBe("fingerprint")
  expect(
    declaredRuntimePolicy(
      { runtimeVersion: { policy: "nativeVersion" } },
      "ios",
    ),
  ).toBeNull()
  expect(resolveRuntimeVersion(config, "ios", hash)).toBe("2.0.0")
  expect(
    resolveRuntimeVersion(
      { runtimeVersion: { policy: "fingerprint" } },
      "ios",
      hash,
    ),
  ).toBe(hash)
  expect(() =>
    resolveRuntimeVersion(
      { runtimeVersion: { policy: "nativeVersion" } },
      "ios",
      hash,
    ),
  ).toThrow("unsupported")
})

test("requires the installed runtime resolver to return the exact platform workflow", () => {
  expect(
    parseResolvedRuntime(
      JSON.stringify({ runtimeVersion: "2.0.0", workflow: "managed" }),
      "android",
      "managed",
    ),
  ).toBe("2.0.0")
  expect(() =>
    parseResolvedRuntime(
      JSON.stringify({ runtimeVersion: "2.0.0", workflow: "generic" }),
      "android",
      "managed",
    ),
  ).toThrow("mismatched")
  expect(() =>
    parseResolvedRuntime(
      JSON.stringify({ runtimeVersion: null, workflow: "managed" }),
      "ios",
      "managed",
    ),
  ).toThrow("missing")
})
