import { spawnSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { validatePreviewMobileTarget } from "../../../scripts/eas-preview-mobile-target"

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const repoDir = path.join(appDir, "../..")
const previewBundleId = "com.ewatrade.preview"
const expoProjectId = "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b"

type ExpoConfig = {
  owner?: string
  ios?: { bundleIdentifier?: string; associatedDomains?: string[] }
  android?: { package?: string }
  extra?: { appVariant?: string; eas?: { projectId?: string } }
}

export function assertIosPreviewConfig(
  config: ExpoConfig,
  preview: Record<string, string>,
  rootPreview: Record<string, string>,
  production: Record<string, string>,
) {
  if (
    preview.APP_VARIANT !== "preview" ||
    preview.EXPO_PUBLIC_APP_VARIANT !== "preview"
  )
    throw new Error(
      "Mobile Preview profile must set both app variants to preview.",
    )
  validatePreviewMobileTarget({
    apiUrl: preview.EXPO_PUBLIC_API_URL,
    expectedApiUrl: rootPreview.API_URL,
    productionApiUrl: production.EXPO_PUBLIC_API_URL,
    legalOrigin: preview.EXPO_PUBLIC_LEGAL_ORIGIN,
    baseUrl: preview.EXPO_PUBLIC_BASE_URL,
    webUrl: preview.EXPO_PUBLIC_WEB_URL,
    chatUrl: preview.EXPO_PUBLIC_CHAT_URL,
    productionBaseUrl: production.EXPO_PUBLIC_BASE_URL,
    productionWebUrl: production.EXPO_PUBLIC_WEB_URL,
    productionChatUrl: production.EXPO_PUBLIC_CHAT_URL,
  })
  const chatHost = new URL(preview.EXPO_PUBLIC_CHAT_URL).hostname
  if (preview.EXPO_PUBLIC_CUSTOMER_CHAT_HOST !== chatHost)
    throw new Error("Mobile Preview chat app-link host must match its URL.")
  if (
    config.owner !== "cipron-startups" ||
    config.extra?.eas?.projectId !== expoProjectId ||
    config.extra?.appVariant !== "preview" ||
    config.ios?.bundleIdentifier !== previewBundleId ||
    config.android?.package !== previewBundleId ||
    !config.ios?.associatedDomains?.includes(`applinks:${chatHost}`)
  )
    throw new Error(
      "Expo CLI did not resolve the EwaTrade Preview app identity.",
    )
}

export function parseEnvFile(source: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    const value = line.slice(separator + 1).trim()
    result[key] =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value.replace(/\s+#.*$/, "")
  }
  return result
}

async function main() {
  if (process.argv.slice(2).some((arg) => arg !== "--check-only"))
    throw new Error("Usage: bun scripts/prebuild-ios-preview.ts [--check-only]")
  const [previewSource, rootPreviewSource, productionSource] =
    await Promise.all([
      readFile(path.join(appDir, ".env.preview"), "utf8"),
      readFile(path.join(repoDir, ".env.preview"), "utf8"),
      readFile(path.join(appDir, ".env.production"), "utf8"),
    ])
  const preview = parseEnvFile(previewSource)
  const rootPreview = parseEnvFile(rootPreviewSource)
  const production = parseEnvFile(productionSource)
  const env = {
    ...process.env,
    ...preview,
    EXPO_NO_DOTENV: "1",
    SENTRY_DISABLE_AUTO_UPLOAD: "true",
  }
  const configProcess = spawnSync(
    "bun",
    ["x", "expo", "config", "--type", "public", "--json"],
    { cwd: appDir, env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  if (configProcess.status !== 0)
    throw new Error("Expo CLI could not resolve the Preview app configuration.")
  assertIosPreviewConfig(
    JSON.parse(configProcess.stdout) as ExpoConfig,
    preview,
    rootPreview,
    production,
  )
  console.log(
    "iOS Preview identity and hosts verified before native generation.",
  )
  if (process.argv.includes("--check-only")) return
  const prebuild = spawnSync(
    "bun",
    ["x", "expo", "prebuild", "--platform", "ios", "--clean", "--no-install"],
    { cwd: appDir, env, stdio: "inherit" },
  )
  if (prebuild.status !== 0) process.exitCode = prebuild.status ?? 1
}

if (import.meta.main) await main()
