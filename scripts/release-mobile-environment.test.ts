import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  NATIVE_ENVIRONMENT_KEYS,
  type NativeEnvironmentBinding,
  type NativeEnvironmentContext,
  type NativeEnvironmentValues,
  assertNativeEasEnvironment,
  assertNativeEnvironmentState,
  assertNativeEnvironmentValues,
  assertNativeProfileEnvironment,
  emptyNativeEnvironmentValues,
  loadNativeEnvironmentBinding,
  nativeEnvironmentFingerprint,
  nativeEnvironmentOverrides,
  resolveNativeEnvironment,
} from "./release-mobile-environment"

const now = Date.parse("2026-10-02T12:00:00.000Z")
const context: NativeEnvironmentContext = {
  revision: "a".repeat(40),
  environment: "preview",
  sourceFingerprint: "b".repeat(64),
}
const baseValues: NativeEnvironmentValues = {
  EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND: "true",
  EXPO_PUBLIC_AUTO_UPDATE_FOREGROUND_COOLDOWN_MS: "60000",
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "1234567890-abc.apps.googleusercontent.com",
  GOOGLE_IOS_CLIENT_ID: "1234567890-abc.apps.googleusercontent.com",
  EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "chat.example.com",
}

function protectedBinding(overrides: Partial<NativeEnvironmentBinding> = {}) {
  const binding: NativeEnvironmentBinding = {
    version: 1,
    projectId: "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b",
    revision: context.revision,
    environment: context.environment,
    sourceFingerprint: context.sourceFingerprint,
    reviewedBy: "release-reviewer",
    reviewedAt: "2026-10-01T12:00:00.000Z",
    expiresAt: "2026-10-08T12:00:00.000Z",
    values: baseValues,
    ...overrides,
  }
  const json = JSON.stringify(binding)
  return {
    binding,
    configuration: {
      EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON: json,
      EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256: createHash("sha256")
        .update(json)
        .digest("hex"),
    },
  }
}

describe("protected native environment binding", () => {
  test("accepts exact scoped bytes with a review no older than seven days", () => {
    const { binding, configuration } = protectedBinding()
    const loaded = loadNativeEnvironmentBinding(context, configuration, now)
    expect(loaded?.binding).toEqual(binding)
    expect(loaded?.byteFingerprint).toBe(
      configuration.EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256,
    )
    expect(Object.isFrozen(loaded?.binding)).toBe(true)
    expect(Object.isFrozen(loaded?.binding.values)).toBe(true)
  })

  test("keeps explicit null distinct from omitted keys", () => {
    const values = emptyNativeEnvironmentValues()
    expect(assertNativeEnvironmentValues(values)).toBeUndefined()
    expect(() =>
      assertNativeEnvironmentValues({
        ...values,
        GOOGLE_IOS_CLIENT_ID: undefined,
      }),
    ).toThrow()
    expect(() =>
      assertNativeEnvironmentValues({
        ...values,
        EXPO_PUBLIC_CUSTOMER_CHAT_HOST: undefined,
      }),
    ).toThrow()
  })

  test("requires both protected JSON and matching full SHA-256 bytes", () => {
    expect(loadNativeEnvironmentBinding(context, {}, now)).toBeNull()
    for (const configuration of [
      { EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON: "" },
      { EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256: "" },
      {
        EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON: "",
        EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256: "",
      },
    ])
      expect(() =>
        loadNativeEnvironmentBinding(context, configuration, now),
      ).toThrow("bytes/digest")
    expect(() =>
      loadNativeEnvironmentBinding(
        context,
        {
          EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON: "{}",
        },
        now,
      ),
    ).toThrow()
    expect(() =>
      loadNativeEnvironmentBinding(
        context,
        {
          EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256: "a".repeat(64),
        },
        now,
      ),
    ).toThrow()

    const { configuration } = protectedBinding()
    expect(() =>
      loadNativeEnvironmentBinding(
        context,
        {
          ...configuration,
          EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256: "0".repeat(64),
        },
        now,
      ),
    ).toThrow()
  })

  test("rejects mismatched environment, project, revision, source, reviewer, or time bindings", () => {
    const mismatches: Array<Partial<NativeEnvironmentBinding>> = [
      { projectId: "other-project" },
      { revision: "c".repeat(40) },
      { environment: "production" },
      { sourceFingerprint: "d".repeat(64) },
      { reviewedBy: " \n " },
      { reviewedAt: "2026-10-02T12:00:00Z" },
      { reviewedAt: "2026-10-02T12:00:00.001Z" },
      {
        reviewedAt: "2026-09-25T11:59:59.999Z",
        expiresAt: "2026-10-02T12:00:00.001Z",
      },
      { expiresAt: "2026-10-02T12:00:00.000Z" },
      { expiresAt: "2026-10-01T11:59:59.000Z" },
      { expiresAt: "2026-10-10T12:00:00.000Z" },
    ]
    for (const mismatch of mismatches) {
      const { configuration } = protectedBinding(mismatch)
      expect(() =>
        loadNativeEnvironmentBinding(context, configuration, now),
      ).toThrow()
    }
  })

  test("rejects missing or unknown binding and parameter keys before values are accepted", () => {
    const valid = protectedBinding().binding
    const { GOOGLE_IOS_CLIENT_ID: _omittedGoogleClientId, ...remainingValues } =
      baseValues
    const missingValueKey = { ...valid, values: remainingValues }
    const withSelector = {
      ...valid,
      values: { ...baseValues, selectedEnvironment: "production" },
    }
    const withCredential = {
      ...valid,
      values: { ...baseValues, EXPO_TOKEN: "should-never-be-accepted" },
    }
    const withBindingField = { ...valid, ownerSelector: "other-owner" }
    for (const malformed of [
      missingValueKey,
      withSelector,
      withCredential,
      withBindingField,
    ]) {
      const json = JSON.stringify(malformed)
      const configuration = {
        EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON: json,
        EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256: createHash("sha256")
          .update(json)
          .digest("hex"),
      }
      expect(() =>
        loadNativeEnvironmentBinding(context, configuration, now),
      ).toThrow()
    }
  })

  test("permits only five reviewed native parameters and projects no ambient credential or selector", () => {
    const values = { ...baseValues }
    const overrides = nativeEnvironmentOverrides(values)
    expect(Object.keys(overrides).sort()).toEqual(
      [...NATIVE_ENVIRONMENT_KEYS].filter((key) => values[key] !== null).sort(),
    )
    expect(overrides).not.toHaveProperty("EXPO_TOKEN")
    expect(overrides).not.toHaveProperty("NODE_OPTIONS")
    expect(overrides).not.toHaveProperty("selectedEnvironment")
    const unapproved = { ...values, EXPO_TOKEN: "x" }
    expect(() => nativeEnvironmentOverrides(unapproved)).toThrow()
  })
})

describe("native environment values and digest", () => {
  test("accepts the reviewed boolean, bounded cooldown, Google ID aliases, and canonical host", () => {
    expect(() => assertNativeEnvironmentValues(baseValues)).not.toThrow()
    expect(() =>
      assertNativeEnvironmentValues({
        ...baseValues,
        EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND: "TRUE",
      }),
    ).toThrow()
    expect(() =>
      assertNativeEnvironmentValues({
        ...baseValues,
        EXPO_PUBLIC_AUTO_UPDATE_FOREGROUND_COOLDOWN_MS: "1000000000",
      }),
    ).toThrow()
    expect(() =>
      assertNativeEnvironmentValues({
        ...baseValues,
        EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "not-an-oauth-client-id",
      }),
    ).toThrow()
    expect(() =>
      assertNativeEnvironmentValues({
        ...baseValues,
        GOOGLE_IOS_CLIENT_ID: "not-an-oauth-client-id",
      }),
    ).toThrow()
    expect(() =>
      assertNativeEnvironmentValues({
        ...baseValues,
        EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "-chat.example.com",
      }),
    ).toThrow()
  })

  test("hashes in canonical key order and changes with every bound input, including null versus non-null", () => {
    const baseline = nativeEnvironmentFingerprint(context, baseValues)
    const reordered = Object.fromEntries(
      [...NATIVE_ENVIRONMENT_KEYS]
        .reverse()
        .map((key) => [key, baseValues[key]]),
    ) as NativeEnvironmentValues
    expect(nativeEnvironmentFingerprint(context, reordered)).toBe(baseline)

    for (const key of NATIVE_ENVIRONMENT_KEYS) {
      const changed = { ...baseValues, [key]: null } as NativeEnvironmentValues
      expect(nativeEnvironmentFingerprint(context, changed)).not.toBe(baseline)
    }
    expect(
      nativeEnvironmentFingerprint(
        { ...context, environment: "production" },
        baseValues,
      ),
    ).not.toBe(baseline)
    expect(
      nativeEnvironmentFingerprint(
        { ...context, revision: "c".repeat(40) },
        baseValues,
      ),
    ).not.toBe(baseline)
    expect(
      nativeEnvironmentFingerprint(
        { ...context, sourceFingerprint: "d".repeat(64) },
        baseValues,
      ),
    ).not.toBe(baseline)
  })

  test("does not collapse explicit absent values into empty strings", () => {
    const absent = { ...baseValues, EXPO_PUBLIC_CUSTOMER_CHAT_HOST: null }
    const empty = { ...baseValues, EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "" }
    expect(() => assertNativeEnvironmentValues(absent)).not.toThrow()
    expect(() => assertNativeEnvironmentValues(empty)).toThrow()
    expect(nativeEnvironmentFingerprint(context, absent)).not.toBe(
      nativeEnvironmentFingerprint(context, baseValues),
    )
  })

  test("refuses IP addresses and noncanonical native host values", () => {
    for (const host of [
      "127.0.0.1",
      "::1",
      "Chat.example.com",
      "chat.example.com.",
      "https://chat.example.com",
      "chat..example.com",
    ])
      expect(() =>
        assertNativeEnvironmentValues({
          ...baseValues,
          EXPO_PUBLIC_CUSTOMER_CHAT_HOST: host,
        }),
      ).toThrow()
  })

  test("signed state must match current protected bytes, values, source and key set", () => {
    const configuration = protectedBinding({
      reviewedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }).configuration
    const { state } = resolveNativeEnvironment(context, configuration)
    expect(() =>
      assertNativeEnvironmentState(context, state, configuration),
    ).not.toThrow()
    const extra = { ...state, values: baseValues }
    expect(() =>
      assertNativeEnvironmentState(context, extra, configuration),
    ).toThrow("Signed native environment")
    for (const altered of [
      undefined,
      { ...state, bindingFingerprint: null },
      { ...state, fingerprint: "f".repeat(64) },
      { ...state, keys: [] },
      { ...state, keys: [...state.keys.slice(1), state.keys[1]] },
    ])
      expect(() =>
        assertNativeEnvironmentState(context, altered, configuration),
      ).toThrow("Signed native environment")
    expect(() => assertNativeEnvironmentState(context, state, {})).toThrow(
      "Signed native environment",
    )
    expect(() =>
      assertNativeEnvironmentState(
        { ...context, sourceFingerprint: "f".repeat(64) },
        state,
        configuration,
      ),
    ).toThrow("bindings")
  })

  test("profile-native inputs must equal reviewed values and cannot replace explicit absence", () => {
    expect(() =>
      assertNativeProfileEnvironment(
        {
          env: {
            APP_VARIANT: "preview",
            EXPO_PUBLIC_CUSTOMER_CHAT_HOST:
              baseValues.EXPO_PUBLIC_CUSTOMER_CHAT_HOST,
            SENTRY_DISABLE_AUTO_UPLOAD: "true",
          },
        },
        "preview",
        baseValues,
      ),
    ).not.toThrow()
    for (const profile of [
      { env: { EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "different.example.com" } },
      { env: { APP_ENV: "production" } },
      { env: { EAS_BUILD_PROFILE: "production" } },
      { env: { EXPO_PUBLIC_CUSTOMER_CHAT_HOST: 42 } },
      { env: [] },
      { env: "invalid" },
      { android: { env: {} } },
      { ios: { env: {} } },
      { android: "invalid" },
    ])
      expect(() =>
        assertNativeProfileEnvironment(profile, "preview", baseValues),
      ).toThrow()
    expect(() =>
      assertNativeProfileEnvironment(
        { env: { EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "chat.example.com" } },
        "preview",
        emptyNativeEnvironmentValues(),
      ),
    ).toThrow("protected native")
    expect(() =>
      assertNativeEasEnvironment(
        {
          build: {
            preview: {
              environment: "preview",
              channel: "preview",
              env: { APP_VARIANT: "preview" },
            },
          },
        },
        "preview",
        baseValues,
      ),
    ).not.toThrow()
    for (const eas of [
      undefined,
      {},
      { build: {} },
      { build: { preview: null } },
      { build: { preview: { environment: "production", channel: "preview" } } },
      {
        build: {
          preview: {
            extends: "production",
            environment: "preview",
            channel: "preview",
          },
        },
      },
    ])
      expect(() =>
        assertNativeEasEnvironment(eas, "preview", baseValues),
      ).toThrow()
  })
})
