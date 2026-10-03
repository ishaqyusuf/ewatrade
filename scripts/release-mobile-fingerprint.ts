import { createHash } from "node:crypto"

type Platform = "android" | "ios"
export function validExpoFingerprint(value: unknown): value is string {
  return (
    typeof value === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value)
  )
}

/** Keep native provider hashes raw; only the pinned toolkit consumes this digest. */
export function toolkitExpoFingerprint(raw: string): string {
  if (!validExpoFingerprint(raw))
    throw new Error("Expo native fingerprint is missing or malformed.")
  return createHash("sha256")
    .update(
      `ewatrade:expo-native:v1:${raw.length === 40 ? "sha1" : "sha256"}:${raw.toLowerCase()}`,
    )
    .digest("hex")
}

/** Receipt identity binds both independent native results and their release scope. */
export function mobileNativeDigest(input: {
  projectId: string
  environment: "preview" | "production"
  profile: string
  channel: string
  branch: string
  fingerprints: Record<Platform, string | null>
  runtimeVersions: Record<Platform, string | null>
}): string {
  if (
    !["preview", "production"].includes(input.environment) ||
    ![input.projectId, input.profile, input.channel, input.branch].every(
      (value) =>
        typeof value === "string" && value.length > 0 && value.length <= 128,
    )
  )
    throw new Error(
      "Mobile native digest requires a complete owned release scope.",
    )
  const platforms = (["android", "ios"] as const).map((platform) => {
    const fingerprint = input.fingerprints[platform]
    const runtimeVersion = input.runtimeVersions[platform]
    if (
      !validExpoFingerprint(fingerprint) ||
      !runtimeVersion ||
      !/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/.test(runtimeVersion)
    )
      throw new Error(
        `${platform}: raw Expo fingerprint or runtime is unavailable.`,
      )
    return {
      platform,
      fingerprint: fingerprint.toLowerCase(),
      algorithm: fingerprint.length === 40 ? "sha1" : "sha256",
      runtimeVersion,
    }
  })
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        projectId: input.projectId,
        environment: input.environment,
        profile: input.profile,
        channel: input.channel,
        branch: input.branch,
        platforms,
      }),
    )
    .digest("hex")
}
