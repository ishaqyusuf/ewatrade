/** Independent of release orchestration. V1 supports internal Android preview builds. */
export const APP_UPDATE_SCOPE = {
  applicationId: "com.ewatrade.preview",
  platform: "android",
  channel: "preview",
  distribution: "internal",
} as const
export const APP_UPDATE_KEY = "mobile.build.android.preview.v1"
export const MAX_APK_BYTES = 512 * 1024 * 1024

export type MobileBuild = typeof APP_UPDATE_SCOPE & {
  schemaVersion: 1
  buildNumber: number
  appVersion: string
  artifactUrl: string
  sha256: string
  sizeBytes: number
  notes: string
}
export type PublishedMobileBuild = MobileBuild & {
  revision: number
  active: boolean
  publishedAt: string
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid build record")
  return value as Record<string, unknown>
}
export function parseBuildNumber(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string")
    throw new Error("Invalid native build number")
  if (!/^[1-9]\d{0,9}$/.test(String(value)))
    throw new Error("Invalid native build number")
  const result = Number(value)
  if (result > 2100000000) throw new Error("Invalid native build number")
  return result
}
export function assertArtifactUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("Invalid APK URL")
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    url.hostname !== "expo.dev" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    !/^\/artifacts\/eas\/[A-Za-z0-9_-]+\.apk$/.test(url.pathname)
  )
    throw new Error("Use a direct https://expo.dev/artifacts/eas/<id>.apk URL")
  return url.href
}
export function parseMobileBuild(value: unknown): MobileBuild {
  const data = record(value)
  for (const [key, expected] of Object.entries(APP_UPDATE_SCOPE))
    if (data[key] !== expected) throw new Error("Unsupported app update scope")
  if (data.schemaVersion !== 1) throw new Error("Unsupported build schema")
  if (
    typeof data.appVersion !== "string" ||
    !/^[\w.+-]{1,80}$/.test(data.appVersion)
  )
    throw new Error("Invalid app version")
  if (typeof data.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.sha256))
    throw new Error("Invalid APK checksum")
  if (
    !Number.isSafeInteger(data.sizeBytes) ||
    Number(data.sizeBytes) < 1 ||
    Number(data.sizeBytes) > MAX_APK_BYTES
  )
    throw new Error("Invalid APK size")
  if (typeof data.notes !== "string" || data.notes.length > 1000)
    throw new Error("Invalid build notes")
  return {
    ...APP_UPDATE_SCOPE,
    schemaVersion: 1,
    buildNumber: parseBuildNumber(data.buildNumber),
    appVersion: data.appVersion,
    artifactUrl: assertArtifactUrl(data.artifactUrl),
    sha256: data.sha256,
    sizeBytes: Number(data.sizeBytes),
    notes: data.notes.trim(),
  }
}
export function parsePublishedBuild(value: unknown): PublishedMobileBuild {
  const data = record(value)
  const build = parseMobileBuild(data)
  if (
    !Number.isSafeInteger(data.revision) ||
    Number(data.revision) < 1 ||
    typeof data.active !== "boolean" ||
    typeof data.publishedAt !== "string" ||
    !Number.isFinite(Date.parse(data.publishedAt))
  )
    throw new Error("Invalid published build")
  return {
    ...build,
    revision: Number(data.revision),
    active: data.active,
    publishedAt: data.publishedAt,
  }
}
export function isNewerBuild(
  build: PublishedMobileBuild,
  installed: typeof APP_UPDATE_SCOPE & { buildNumber: number },
) {
  return (
    build.active &&
    Object.entries(APP_UPDATE_SCOPE).every(
      ([key, value]) =>
        installed[key as keyof typeof APP_UPDATE_SCOPE] === value,
    ) &&
    build.buildNumber > parseBuildNumber(installed.buildNumber)
  )
}
export function sameBuild(a: MobileBuild, b: MobileBuild) {
  return (
    JSON.stringify(parseMobileBuild(a)) === JSON.stringify(parseMobileBuild(b))
  )
}
