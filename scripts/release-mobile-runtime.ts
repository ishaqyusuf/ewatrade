import type { ExpoPlatform } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/expo"
import type { NativeRuntimePolicy } from "./release-mobile-build-policy"
import { validExpoFingerprint } from "./release-mobile-fingerprint"

export function assertExpoConfigOwnership(
  config: Record<string, unknown>,
  expected: { projectId: string; owner: string; slug: string },
) {
  const eas = asObject(asObject(config.extra)?.eas)
  if (
    config.owner !== expected.owner ||
    config.slug !== expected.slug ||
    eas?.projectId !== expected.projectId
  )
    throw new Error(
      "Committed Expo configuration does not match the owned primary project.",
    )
}

export function parseExpoConfig(text: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("Expo config did not return bounded valid JSON.")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Expo config result is malformed.")
  const value = parsed as Record<string, unknown>
  const config = value.expo ?? value
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("Expo config did not expose an app configuration.")
  return config as Record<string, unknown>
}

export function parseExpoFingerprint(
  text: string,
  platform: ExpoPlatform,
): string {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(
      `${platform}: Expo fingerprint command returned invalid JSON.`,
    )
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      `${platform}: Expo fingerprint command returned malformed data.`,
    )
  const fingerprint = (value as Record<string, unknown>).hash
  if (!validExpoFingerprint(fingerprint))
    throw new Error(
      `${platform}: installed Expo fingerprint output is not a raw SHA-1/SHA-256 hex digest.`,
    )
  const sources = (value as Record<string, unknown>).sources
  if (!Array.isArray(sources) || sources.length > 20_000)
    throw new Error(
      `${platform}: Expo fingerprint source inventory is missing or too large.`,
    )
  // SDK sourcers can swallow child-process/config failures and still emit a
  // valid aggregate hash. Require the native contributors this toolchain uses.
  for (const id of [
    "expoConfig",
    "package:react-native",
    `expoAutolinkingConfig:${platform}`,
    `rncoreAutolinkingConfig:${platform}`,
  ]) {
    const matching = sources.filter((source) => asObject(source)?.id === id)
    if (
      matching.length !== 1 ||
      !validExpoFingerprint(asObject(matching[0])?.hash)
    )
      throw new Error(
        `${platform}: required native fingerprint contributor is unavailable.`,
      )
  }
  return fingerprint.toLowerCase()
}

export function parseResolvedRuntime(
  text: string,
  platform: ExpoPlatform,
  workflow: "managed" | "generic",
): string {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`${platform}: Expo runtime resolver returned invalid JSON.`)
  }
  const result = asObject(value)
  if (
    !result ||
    result.workflow !== workflow ||
    typeof result.runtimeVersion !== "string"
  )
    throw new Error(
      `${platform}: Expo runtime resolver returned mismatched or missing state.`,
    )
  return validateRuntime(result.runtimeVersion, platform)
}

export function resolveRuntimeVersion(
  config: Record<string, unknown>,
  platform: ExpoPlatform,
  fingerprint: string,
): string {
  const platformConfig = asObject(config[platform])
  const runtime = platformConfig?.runtimeVersion ?? config.runtimeVersion
  if (typeof runtime === "string") return validateRuntime(runtime, platform)
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime))
    throw new Error(`${platform}: runtimeVersion is missing or unsupported.`)
  const policy = (runtime as Record<string, unknown>).policy
  if (policy === "fingerprint") return fingerprint
  if (policy !== "appVersion")
    throw new Error(
      `${platform}: Expo runtime policy ${String(policy)} is unsupported by the source generator.`,
    )
  const version = config.version
  if (typeof version !== "string")
    throw new Error(
      `${platform}: appVersion runtime policy has no config version.`,
    )
  return validateRuntime(version, platform)
}

/** Preserve the declaration; matching runtime strings do not establish policy. */
export function declaredRuntimePolicy(
  config: Record<string, unknown>,
  platform: ExpoPlatform,
): NativeRuntimePolicy | null {
  const runtime =
    asObject(config[platform])?.runtimeVersion ?? config.runtimeVersion
  if (typeof runtime === "string") return "explicit"
  const policy = asObject(runtime)?.policy
  return policy === "appVersion" || policy === "fingerprint" ? policy : null
}

function validateRuntime(runtime: string, platform: ExpoPlatform) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/.test(runtime))
    throw new Error(`${platform}: Expo runtime version is invalid.`)
  return runtime
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
