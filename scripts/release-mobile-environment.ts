import { createHash } from "node:crypto"
import { isIP } from "node:net"
import { MOBILE_TARGET } from "./release-mobile-target"

export const NATIVE_ENVIRONMENT_KEYS = [
  "EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND",
  "EXPO_PUBLIC_AUTO_UPDATE_FOREGROUND_COOLDOWN_MS",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
  "GOOGLE_IOS_CLIENT_ID",
  "EXPO_PUBLIC_CUSTOMER_CHAT_HOST",
] as const
export type NativeEnvironmentKey = (typeof NATIVE_ENVIRONMENT_KEYS)[number]
export type NativeEnvironmentValues = Record<
  NativeEnvironmentKey,
  string | null
>
export type NativeEnvironmentContext = {
  revision: string
  environment: "preview" | "production"
  sourceFingerprint: string
}
export type NativeEnvironmentBinding = {
  version: 1
  projectId: string
  revision: string
  environment: "preview" | "production"
  sourceFingerprint: string
  reviewedBy: string
  reviewedAt: string
  expiresAt: string
  values: NativeEnvironmentValues
}
export type NativeEnvironmentState = {
  version: 1
  bindingFingerprint: string | null
  fingerprint: string
  keys: NativeEnvironmentKey[]
}
const MAX_BYTES = 8 * 1024
const MAX_APPROVAL_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Values never come from ambient dotenv or arbitrary caller-selected names. */
export function loadNativeEnvironmentBinding(
  context: NativeEnvironmentContext,
  configuration: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): { binding: NativeEnvironmentBinding; byteFingerprint: string } | null {
  const json = configuration.EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON
  const digest = configuration.EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256
  if (json === undefined && digest === undefined) return null
  if (
    !json ||
    !digest ||
    !/^[0-9a-f]{64}$/.test(digest) ||
    Buffer.byteLength(json) > MAX_BYTES ||
    hash(json) !== digest
  )
    throw new Error(
      "Protected native environment bytes/digest are unavailable or mismatched.",
    )
  let binding: NativeEnvironmentBinding
  try {
    binding = JSON.parse(json)
  } catch {
    throw new Error("Protected native environment configuration is malformed.")
  }
  if (
    !binding ||
    typeof binding !== "object" ||
    Array.isArray(binding) ||
    !exactKeys(binding, [
      "version",
      "projectId",
      "revision",
      "environment",
      "sourceFingerprint",
      "reviewedBy",
      "reviewedAt",
      "expiresAt",
      "values",
    ]) ||
    binding.version !== 1 ||
    binding.projectId !== MOBILE_TARGET.projectId ||
    binding.revision !== context.revision ||
    !/^[0-9a-f]{40}$/.test(binding.revision) ||
    binding.environment !== context.environment ||
    binding.sourceFingerprint !== context.sourceFingerprint ||
    !/^[0-9a-f]{64}$/.test(binding.sourceFingerprint) ||
    typeof binding.reviewedBy !== "string" ||
    !binding.reviewedBy.trim() ||
    binding.reviewedBy.length > 128 ||
    Array.from(binding.reviewedBy).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new Error(
      "Protected native environment configuration has invalid release/reviewer bindings.",
    )
  const reviewedAt = timestamp(binding.reviewedAt)
  const expiresAt = timestamp(binding.expiresAt)
  if (
    reviewedAt === null ||
    expiresAt === null ||
    reviewedAt > now ||
    expiresAt <= now ||
    expiresAt <= reviewedAt ||
    expiresAt - reviewedAt > MAX_APPROVAL_AGE_MS ||
    now - reviewedAt > MAX_APPROVAL_AGE_MS
  )
    throw new Error("Protected native environment review is stale or invalid.")
  assertNativeEnvironmentValues(binding.values)
  Object.freeze(binding.values)
  Object.freeze(binding)
  return { binding, byteFingerprint: digest }
}

/** Domain-separated final-value hash also binds the exact source and release scope. */
export function nativeEnvironmentFingerprint(
  context: NativeEnvironmentContext,
  values: NativeEnvironmentValues,
): string {
  if (
    !/^[0-9a-f]{40}$/.test(context.revision) ||
    !/^[0-9a-f]{64}$/.test(context.sourceFingerprint) ||
    !["preview", "production"].includes(context.environment)
  )
    throw new Error(
      "Native environment fingerprint requires an exact release scope.",
    )
  assertNativeEnvironmentValues(values)
  return hash(
    JSON.stringify([
      "ewatrade:native-environment:v1",
      MOBILE_TARGET.projectId,
      context.environment,
      context.revision,
      context.sourceFingerprint,
      NATIVE_ENVIRONMENT_KEYS.map((key) => [key, values[key]]),
    ]),
  )
}

export function emptyNativeEnvironmentValues(): NativeEnvironmentValues {
  return {
    EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND: null,
    EXPO_PUBLIC_AUTO_UPDATE_FOREGROUND_COOLDOWN_MS: null,
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: null,
    GOOGLE_IOS_CLIENT_ID: null,
    EXPO_PUBLIC_CUSTOMER_CHAT_HOST: null,
  }
}

/** Only approved public native parameters may enter the credential-free child. */
export function nativeEnvironmentOverrides(
  values: NativeEnvironmentValues,
): Record<string, string> {
  assertNativeEnvironmentValues(values)
  const overrides: Record<string, string> = {}
  for (const key of NATIVE_ENVIRONMENT_KEYS) {
    const value = values[key]
    if (value !== null) overrides[key] = value
  }
  return overrides
}

/** EAS profile values take precedence; native values must equal the reviewed source inputs. */
export function assertNativeEasEnvironment(
  eas: unknown,
  environment: NativeEnvironmentContext["environment"],
  values: NativeEnvironmentValues,
) {
  if (
    !eas ||
    typeof eas !== "object" ||
    Array.isArray(eas) ||
    !("build" in eas)
  )
    throw new Error(
      "Committed EAS configuration has no reviewed build profiles.",
    )
  const build = eas.build
  if (
    !build ||
    typeof build !== "object" ||
    Array.isArray(build) ||
    !Object.hasOwn(build, environment)
  )
    throw new Error(
      "Committed EAS configuration has no selected release profile.",
    )
  const profile = (build as Record<string, unknown>)[environment]
  if (!profile || typeof profile !== "object" || Array.isArray(profile))
    throw new Error("Committed EAS release profile must be an object.")
  const selected = profile as Record<string, unknown>
  if (
    selected.extends !== undefined ||
    selected.environment !== environment ||
    selected.channel !== environment
  )
    throw new Error(
      "Native source requires a direct EAS release profile/environment/channel binding.",
    )
  assertNativeProfileEnvironment(selected, environment, values)
}

export function assertNativeProfileEnvironment(
  profile: Record<string, unknown>,
  environment: NativeEnvironmentContext["environment"],
  values: NativeEnvironmentValues,
) {
  assertNativeEnvironmentValues(values)
  const env = profile.env
  if (
    env !== undefined &&
    (!env || typeof env !== "object" || Array.isArray(env))
  )
    throw new Error(
      "Committed EAS profile environment must be a string-value object.",
    )
  const overrides = (env ?? {}) as Record<string, unknown>
  if (Object.values(overrides).some((value) => typeof value !== "string"))
    throw new Error(
      "Committed EAS profile environment must be a string-value object.",
    )
  for (const key of [
    "APP_ENV",
    "APP_VARIANT",
    "EXPO_PUBLIC_APP_VARIANT",
    "EAS_BUILD_PROFILE",
  ]) {
    if (overrides[key] !== undefined && overrides[key] !== environment)
      throw new Error(
        "Committed EAS profile overrides the reviewed release selector.",
      )
  }
  for (const key of NATIVE_ENVIRONMENT_KEYS) {
    if (overrides[key] !== undefined && overrides[key] !== values[key])
      throw new Error(
        "Committed EAS profile overrides the protected native environment binding.",
      )
  }
  for (const platform of ["android", "ios"]) {
    const override = profile[platform]
    if (
      override !== undefined &&
      (!override || typeof override !== "object" || Array.isArray(override))
    )
      throw new Error("Committed EAS platform override must be an object.")
    if (override && Object.hasOwn(override, "env"))
      throw new Error(
        "Platform-specific EAS environment overrides require separate reviewed support.",
      )
  }
}

export function resolveNativeEnvironment(
  context: NativeEnvironmentContext,
  configuration: NodeJS.ProcessEnv = process.env,
) {
  const approved = loadNativeEnvironmentBinding(context, configuration)
  const values = approved?.binding.values ?? emptyNativeEnvironmentValues()
  const state: NativeEnvironmentState = {
    version: 1,
    bindingFingerprint: approved?.byteFingerprint ?? null,
    fingerprint: nativeEnvironmentFingerprint(context, values),
    keys: approved ? [...NATIVE_ENVIRONMENT_KEYS] : [],
  }
  return { values, state }
}

/** Compare the signed observation with current protected configuration, never with ambient values. */
export function assertNativeEnvironmentState(
  context: NativeEnvironmentContext,
  state: NativeEnvironmentState | undefined,
  configuration: NodeJS.ProcessEnv = process.env,
): asserts state is NativeEnvironmentState {
  const expected = resolveNativeEnvironment(context, configuration).state
  if (
    !state ||
    typeof state !== "object" ||
    Array.isArray(state) ||
    !exactKeys(state, [
      "version",
      "bindingFingerprint",
      "fingerprint",
      "keys",
    ]) ||
    state.version !== 1 ||
    state.bindingFingerprint !== expected.bindingFingerprint ||
    state.fingerprint !== expected.fingerprint ||
    !Array.isArray(state.keys) ||
    state.keys.length !== expected.keys.length ||
    new Set(state.keys).size !== state.keys.length ||
    state.keys.some((key) => !expected.keys.includes(key))
  )
    throw new Error(
      "Signed native environment state is unavailable or differs from the current protected release binding.",
    )
}

export function assertNativeEnvironmentValues(
  value: unknown,
): asserts value is NativeEnvironmentValues {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !exactKeys(value, NATIVE_ENVIRONMENT_KEYS)
  )
    throw new Error(
      "Native environment must explicitly bind every allowlisted key and no other key.",
    )
  const values = value as NativeEnvironmentValues
  for (const key of NATIVE_ENVIRONMENT_KEYS) {
    const item = values[key]
    if (item === null) continue
    if (typeof item !== "string" || item.length > 256)
      throw new Error("Native environment value is unavailable or malformed.")
    const valid =
      key === "EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND"
        ? /^(?:true|false)$/.test(item)
        : key === "EXPO_PUBLIC_AUTO_UPDATE_FOREGROUND_COOLDOWN_MS"
          ? /^(0|[1-9][0-9]{0,8})$/.test(item)
          : key === "EXPO_PUBLIC_CUSTOMER_CHAT_HOST"
            ? item.length <= 253 &&
              isIP(item) === 0 &&
              item.includes(".") &&
              item
                .split(".")
                .every((label) =>
                  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
                )
            : /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(item)
    if (!valid)
      throw new Error(
        "Native environment value is outside the reviewed public parameter contract.",
      )
  }
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || value.length > 32) return null
  const result = Date.parse(value)
  return Number.isFinite(result) && new Date(result).toISOString() === value
    ? result
    : null
}
function exactKeys(value: object, expected: readonly string[]) {
  const keys = Object.keys(value)
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  )
}
function hash(text: string) {
  return createHash("sha256").update(text).digest("hex")
}
