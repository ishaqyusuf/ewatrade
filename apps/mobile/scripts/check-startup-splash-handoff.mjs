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
const designSystemScreen = readFileSync(
  join(
    mobileDir,
    "src/components/mobile/design-system/design-system-screen.tsx",
  ),
  "utf8",
)
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
const reviewRoutePath = join(
  mobileDir,
  "src/app/design-system/startup-splash.tsx",
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

if (!existsSync(reviewRoutePath)) {
  failures.push("the protected internal startup splash review route is missing")
} else {
  const reviewRoute = readFileSync(reviewRoutePath, "utf8")
  for (const marker of [
    "shouldShowInternalDesignSystemEntry",
    '<Redirect href="/login" />',
    "<StartupSplash />",
  ]) {
    if (!reviewRoute.includes(marker)) {
      failures.push(`startup splash review route is missing ${marker}`)
    }
  }
}

for (const marker of [
  "Preview startup splash",
  'router.push("/design-system/startup-splash")',
]) {
  if (!designSystemScreen.includes(marker)) {
    failures.push(
      `the Mobile Design System cannot open the splash via ${marker}`,
    )
  }
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

for (const marker of [
  "pulseOuter",
  "marketSun",
  "skyRoute",
  "markTile",
  "ẸwáTrade",
  "Market day, every day",
  "canvasCut",
  "Opening your market",
  "height: 235",
  'rotate: "-4deg"',
  "height: 132",
  "width: 126",
  "fontSize: 57",
  "height: 124",
  "right: -33",
  "top: 119",
  "height: 34",
  "right: -35",
  "top: 291",
  "width: 250",
]) {
  if (!splashSurface.includes(marker)) {
    failures.push(`the rich splash surface is missing ${marker}`)
  }
}

for (const color of [
  "#17684F",
  "#FFBD3E",
  "#E94F2F",
  "#79C8E8",
  "#FFF4D6",
  "#FFF9ED",
  "#091C19",
]) {
  if (!marketDayTheme.includes(color)) {
    failures.push(`the Market Pulse palette is missing ${color}`)
  }
}

if (!appConfig.includes("market-pulse-splash-mark.png")) {
  failures.push("the native gate does not use the approved doorway mark")
}

if (failures.length > 0) {
  console.error("Startup splash global handoff check failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  "Startup splash global handoff check passed: native hide waits for the global rich frame, including cold deep-link launches.",
)
