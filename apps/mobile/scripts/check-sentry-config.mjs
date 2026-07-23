#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = resolve(appRoot, "../..")

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

function expect(source, pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message)
  }
}

const packageJson = JSON.parse(read("apps/mobile/package.json"))
const appConfig = read("apps/mobile/app.config.ts")
const metroConfig = read("apps/mobile/metro.config.js")
const rootLayout = read("apps/mobile/src/app/_layout.tsx")
const launchUpdate = read("apps/mobile/src/hooks/use-launch-auto-update.ts")
const updatesScreen = read("apps/mobile/src/screens/updates-screen.tsx")
const rootEnvExample = read(".env.example")
const mobileEnvExample = read("apps/mobile/.env.example")

if (!packageJson.dependencies?.["@sentry/react-native"]) {
  throw new Error("@sentry/react-native is missing from mobile dependencies.")
}

expect(
  appConfig,
  /"@sentry\/react-native\/expo"/,
  "The Sentry Expo config plugin is missing.",
)
expect(
  appConfig,
  /project:\s*"ewatrade-mobile"/,
  "The Sentry mobile project is not configured.",
)
expect(
  appConfig,
  /organization:\s*"cipron-concepts"/,
  "The Sentry organization is not configured.",
)
expect(
  metroConfig,
  /getSentryExpoConfig\(__dirname\)/,
  "Metro is not using Sentry's Expo configuration.",
)
expect(rootLayout, /Sentry\.init\(\{/, "Sentry is not initialized.")
expect(
  rootLayout,
  /process\.env\.EXPO_PUBLIC_SENTRY_DSN/,
  "Sentry does not read the public DSN environment variable.",
)
expect(
  rootLayout,
  /sendDefaultPii:\s*false/,
  "Sentry must not send default PII.",
)
expect(
  rootLayout,
  /export default Sentry\.wrap\(RootLayout\)/,
  "The root layout is not wrapped with Sentry.",
)
expect(
  launchUpdate,
  /Sentry\.flush\(\)[\s\S]*Updates\.reloadAsync\(\)/,
  "Automatic OTA reloads do not flush pending Sentry events.",
)
expect(
  updatesScreen,
  /Sentry\.flush\(\)[\s\S]*Updates\.reloadAsync\(\)/,
  "Manual OTA reloads do not flush pending Sentry events.",
)

for (const [name, envSource] of [
  [".env.example", rootEnvExample],
  ["apps/mobile/.env.example", mobileEnvExample],
]) {
  expect(
    envSource,
    /^EXPO_PUBLIC_SENTRY_DSN=.+$/m,
    `${name} is missing EXPO_PUBLIC_SENTRY_DSN.`,
  )
  expect(
    envSource,
    /^EXPO_PUBLIC_SENTRY_ENVIRONMENT=.+$/m,
    `${name} is missing EXPO_PUBLIC_SENTRY_ENVIRONMENT.`,
  )
  expect(
    envSource,
    /^SENTRY_AUTH_TOKEN=$/m,
    `${name} is missing the private build-token placeholder.`,
  )
}

console.log("Sentry mobile configuration checks passed.")
