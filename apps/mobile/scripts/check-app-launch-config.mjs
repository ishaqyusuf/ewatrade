import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const REPO_ROOT = resolve(MOBILE_DIR, "../..")
const APP_CONFIG_FILE = join(MOBILE_DIR, "app.config.ts")
const ICON_DIR = join(MOBILE_DIR, "assets/icons")

const REQUIRED_MARKERS = [
  'name: "ẸwáTrade"',
  'name: "ẸwáTrade Dev"',
  'name: "ẸwáTrade Preview"',
  'scheme: "ewatrade"',
  'scheme: "ewatrade-dev"',
  'scheme: "ewatrade-preview"',
  'iosBundleIdentifier: "com.ewatrade.app"',
  'iosBundleIdentifier: "com.ewatrade.dev"',
  'iosBundleIdentifier: "com.ewatrade.preview"',
  'androidPackage: "com.ewatrade.app"',
  'androidPackage: "com.ewatrade.dev"',
  'androidPackage: "com.ewatrade.preview"',
  'app: "./assets/icons/preview-loading-icon.png"',
  'adaptive: "./assets/icons/preview-adaptive-icon.png"',
  'iosDark: "./assets/icons/preview-ios-dark.png"',
  'iosLight: "./assets/icons/preview-ios-light.png"',
  '"expo-splash-screen"',
  "variantConfig.icons.splashLight",
  "variantConfig.icons.splashDark",
  "splashBackgroundColor",
  "splashDarkBackgroundColor",
  "imageWidth: 170",
  'resizeMode: "contain"',
  'userInterfaceStyle: "automatic"',
]
const REQUIRED_PNGS = [
  { alpha: true, file: "adaptive-icon.png", height: 1024, width: 1024 },
  { alpha: true, file: "dev-adaptive-icon.png", height: 1024, width: 1024 },
  { file: "dev-ios-dark.png", height: 1024, width: 1024 },
  { file: "dev-ios-light.png", height: 1024, width: 1024 },
  { file: "dev-loading-icon.png", height: 1024, width: 1024 },
  { alpha: true, file: "dev-splash-logo-dark.png", height: 640, width: 640 },
  { alpha: true, file: "dev-splash-logo.png", height: 640, width: 640 },
  { file: "ios-dark.png", height: 1024, width: 1024 },
  { file: "ios-light.png", height: 1024, width: 1024 },
  { file: "loading-icon.png", height: 1024, width: 1024 },
  { file: "market-day-splash-lockup.png", height: 1280, width: 2560 },
  { file: "market-pulse-splash-mark.png", height: 1024, width: 1024 },
  { alpha: true, file: "preview-adaptive-icon.png", height: 1024, width: 1024 },
  { file: "preview-ios-dark.png", height: 1024, width: 1024 },
  { file: "preview-ios-light.png", height: 1024, width: 1024 },
  { file: "preview-loading-icon.png", height: 1024, width: 1024 },
  {
    alpha: true,
    file: "preview-splash-logo-dark.png",
    height: 640,
    width: 640,
  },
  { alpha: true, file: "preview-splash-logo.png", height: 640, width: 640 },
  { alpha: true, file: "splash-logo-dark.png", height: 640, width: 640 },
  { alpha: true, file: "splash-logo.png", height: 640, width: 640 },
]
const DISTINCT_ICON_GROUPS = [
  ["loading-icon.png", "preview-loading-icon.png", "dev-loading-icon.png"],
  ["adaptive-icon.png", "preview-adaptive-icon.png", "dev-adaptive-icon.png"],
]

function readPngMetadata(filePath) {
  const bytes = readFileSync(filePath)
  const signature = bytes.subarray(0, 8).toString("hex")

  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${relative(REPO_ROOT, filePath)} is not a PNG file.`)
  }

  return {
    hasAlpha: bytes[25] === 4 || bytes[25] === 6,
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

  const metadata = readPngMetadata(filePath)

  if (metadata.width !== png.width || metadata.height !== png.height) {
    imageFailures.push(
      `${relative(REPO_ROOT, filePath)} is ${metadata.width}x${metadata.height}, expected ${png.width}x${png.height}.`,
    )
  }

  if (png.alpha === true && !metadata.hasAlpha) {
    imageFailures.push(
      `${relative(REPO_ROOT, filePath)} must preserve transparency for adaptive or splash composition.`,
    )
  }
}

for (const files of DISTINCT_ICON_GROUPS) {
  const hashes = files.map((file) => {
    const filePath = join(ICON_DIR, file)
    return existsSync(filePath)
      ? createHash("sha256").update(readFileSync(filePath)).digest("hex")
      : null
  })

  if (new Set(hashes.filter(Boolean)).size !== files.length) {
    imageFailures.push(
      `${files.join(", ")} must be distinct Production, Preview, and Development colorways.`,
    )
  }
}

if (missingMarkers.length > 0 || imageFailures.length > 0) {
  console.error(
    "App launch config check failed. Restore the ẸwáTrade launch names, schemes, splash plugin, dark/light splash assets, and launcher icon dimensions.",
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
