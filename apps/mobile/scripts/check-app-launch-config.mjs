import { existsSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const REPO_ROOT = resolve(MOBILE_DIR, "../..")
const APP_CONFIG_FILE = join(MOBILE_DIR, "app.config.ts")
const ICON_DIR = join(MOBILE_DIR, "assets/icons")

const REQUIRED_MARKERS = [
  'name: "Ewatrade"',
  'name: "Ewatrade Dev"',
  'scheme: "ewatrade"',
  'scheme: "ewatrade-dev"',
  'iosBundleIdentifier: "com.ewatrade.app"',
  'iosBundleIdentifier: "com.ewatrade.dev"',
  'androidPackage: "com.ewatrade.app"',
  'androidPackage: "com.ewatrade.dev"',
  '"expo-splash-screen"',
  "variantConfig.icons.splashLight",
  "variantConfig.icons.splashDark",
  "splashBackgroundColor",
  "splashDarkBackgroundColor",
  "imageWidth: 200",
  'resizeMode: "contain"',
  'userInterfaceStyle: "automatic"',
]
const REQUIRED_PNGS = [
  { file: "adaptive-icon.png", height: 1024, width: 1024 },
  { file: "dev-adaptive-icon.png", height: 1024, width: 1024 },
  { file: "dev-ios-dark.png", height: 1024, width: 1024 },
  { file: "dev-ios-light.png", height: 1024, width: 1024 },
  { file: "dev-loading-icon.png", height: 1024, width: 1024 },
  { file: "dev-splash-logo.png", height: 640, width: 640 },
  { file: "ios-dark.png", height: 1024, width: 1024 },
  { file: "ios-light.png", height: 1024, width: 1024 },
  { file: "loading-icon.png", height: 1024, width: 1024 },
  { file: "splash-logo.png", height: 640, width: 640 },
]

function readPngSize(filePath) {
  const bytes = readFileSync(filePath)
  const signature = bytes.subarray(0, 8).toString("hex")

  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${relative(REPO_ROOT, filePath)} is not a PNG file.`)
  }

  return {
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  }
}

const configSource = readFileSync(APP_CONFIG_FILE, "utf8")
const missingMarkers = REQUIRED_MARKERS.filter(
  (marker) => !configSource.includes(marker),
)
const imageFailures = []

for (const png of REQUIRED_PNGS) {
  const filePath = join(ICON_DIR, png.file)

  if (!existsSync(filePath)) {
    imageFailures.push(`${relative(REPO_ROOT, filePath)} is missing.`)
    continue
  }

  const size = readPngSize(filePath)

  if (size.width !== png.width || size.height !== png.height) {
    imageFailures.push(
      `${relative(REPO_ROOT, filePath)} is ${size.width}x${size.height}, expected ${png.width}x${png.height}.`,
    )
  }
}

if (missingMarkers.length > 0 || imageFailures.length > 0) {
  console.error(
    "App launch config check failed. Restore the Ewatrade launch names, schemes, splash plugin, dark/light splash assets, and launcher icon dimensions.",
  )

  for (const marker of missingMarkers) {
    console.error(
      `- ${relative(REPO_ROOT, APP_CONFIG_FILE)}: missing ${marker}`,
    )
  }

  for (const failure of imageFailures) {
    console.error(`- ${failure}`)
  }

  process.exit(1)
}

console.log("App launch config check passed.")
