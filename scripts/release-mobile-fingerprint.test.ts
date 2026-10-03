import { expect, test } from "bun:test"
import {
  mobileNativeDigest,
  toolkitExpoFingerprint,
  validExpoFingerprint,
} from "./release-mobile-fingerprint"
const state = {
  projectId: "owned-project",
  environment: "preview" as const,
  profile: "preview",
  channel: "preview",
  branch: "preview",
  fingerprints: { android: "a".repeat(40), ios: "b".repeat(40) },
  runtimeVersions: { android: "1.0.0", ios: "1.0.0" },
}

test("raw SHA1 and SHA256 remain distinct native identities at toolkit boundary", () => {
  expect(validExpoFingerprint(state.fingerprints.android)).toBe(true)
  expect(validExpoFingerprint("c".repeat(64))).toBe(true)
  expect(validExpoFingerprint("d".repeat(41))).toBe(false)
  const digest = toolkitExpoFingerprint(state.fingerprints.android)
  expect(digest).toMatch(/^[a-f0-9]{64}$/)
  expect(digest).not.toBe(state.fingerprints.android)
  expect(digest).toBe(
    toolkitExpoFingerprint(state.fingerprints.android.toUpperCase()),
  )
  expect(digest).not.toBe(toolkitExpoFingerprint("a".repeat(64)))
})

test("mobile receipt digest binds every platform, runtime and owned scope", () => {
  const digest = mobileNativeDigest(state)
  expect(digest).toMatch(/^[a-f0-9]{64}$/)
  for (const changed of [
    { ...state, fingerprints: { ...state.fingerprints, ios: "c".repeat(40) } },
    {
      ...state,
      runtimeVersions: { ...state.runtimeVersions, android: "2.0.0" },
    },
    { ...state, projectId: "another-project" },
    { ...state, environment: "production" as const },
    { ...state, profile: "production" },
    { ...state, channel: "production" },
    { ...state, branch: "production" },
  ])
    expect(mobileNativeDigest(changed)).not.toBe(digest)
  expect(() =>
    mobileNativeDigest({
      ...state,
      fingerprints: { ...state.fingerprints, ios: null },
    }),
  ).toThrow("ios")
})
