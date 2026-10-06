import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const mobileDir = resolve(new URL("..", import.meta.url).pathname)
const appConfig = readFileSync(join(mobileDir, "app.config.ts"), "utf8")
const appVariant = readFileSync(
  join(mobileDir, "src/lib/app-variant.ts"),
  "utf8",
)
const indexRoute = readFileSync(join(mobileDir, "src/app/index.tsx"), "utf8")
const rootLayout = readFileSync(join(mobileDir, "src/app/_layout.tsx"), "utf8")
const splashSurface = readFileSync(
  join(mobileDir, "src/components/mobile/startup-splash.tsx"),
  "utf8",
)
const marketDayTheme = readFileSync(
  join(mobileDir, "src/lib/market-day-theme.ts"),
  "utf8",
)
const gatePath = join(
  mobileDir,
  "src/components/mobile/startup-splash-gate.tsx",
)
const failures = []

if (!existsSync(gatePath)) {
  failures.push(
    "the global startup splash gate is missing, so cold deep links can bypass the rich handoff",
  )
} else {
  const gate = readFileSync(gatePath, "utf8")
  const requiredGateMarkers = [
    "STARTUP_SPLASH_MINIMUM_MS = 1400",
    "DEVELOPMENT_STARTUP_SPLASH_MINIMUM_MS = 4000",
    "isDevelopmentAppVariant()",
    "SplashScreen.hideAsync()",
    "onLayout={handleSplashLayout}",
    "flex: 1",
    "<StartupSplash",
  ]

  for (const marker of requiredGateMarkers) {
    if (!gate.includes(marker)) {
      failures.push(`global startup gate is missing ${marker}`)
    }
  }
}

if (
  !appVariant.includes(
    'DEVELOPMENT_APP_VARIANTS = new Set(["local", "dev", "development"])',
  )
) {
  failures.push(
    "Preview must use the production splash duration; only local development may extend the inspection hold",
  )
}

if (!/<StartupSplashGate\s+[\s\S]*?\/>/.test(rootLayout)) {
  failures.push("the root layout does not mount the rich startup gate")
}

if (rootLayout.includes("SplashScreen.hideAsync()")) {
  failures.push(
    "the root layout hides the native gate before the rich React frame reports layout",
  )
}

if (indexRoute.includes("MINIMUM_STARTUP_SPLASH_MS")) {
  failures.push(
    "the minimum splash timer is still route-scoped instead of launch-scoped",
  )
}

const marketDaySplash = readFileSync(
  join(
    mobileDir,
    "src/components/mobile/appearances/market-day/startup-splash.tsx",
  ),
  "utf8",
)
const classicSplash = readFileSync(
  join(
    mobileDir,
    "src/components/mobile/appearances/classic/startup-splash.tsx",
  ),
  "utf8",
)
for (const marker of [
  "MarketDayStartupSplash",
  "ClassicStartupSplash",
  'useMobileDesign("startup-splash")',
]) {
  if (!splashSurface.includes(marker))
    failures.push(`splash router is missing ${marker}`)
}
for (const marker of [
  "<BrandMark",
  "<BrandWordmark reverse",
  "Market day, every day",
  "Opening your market",
]) {
  if (!marketDaySplash.includes(marker))
    failures.push(`Market Day splash is missing ${marker}`)
}
if (!classicSplash.includes('<BrandLogo reverse={colorScheme === "dark"}')) {
  failures.push("Classic splash must use the theme-aware Precision Rise logo")
}

for (const marker of [
  "BRAND_THEME.light.primary",
  "BRAND_THEME.light.primaryForeground",
  "#FFBD3E",
  "#E94F2F",
  "#79C8E8",
]) {
  if (!marketDayTheme.includes(marker))
    failures.push(`Market Day palette is missing ${marker}`)
}

for (const marker of [
  "variantConfig.icons.splashDark",
  "variantConfig.icons.splashLight",
  "image: nativeSplashImageLight",
  "image: nativeSplashImageDark",
]) {
  if (!appConfig.includes(marker))
    failures.push(`native splash config is missing ${marker}`)
}

if (failures.length > 0) {
  console.error("Startup splash global handoff check failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  "Startup splash global handoff check passed: native hide waits for the global rich frame, including cold deep-link launches.",
)
