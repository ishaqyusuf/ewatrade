import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
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
  '"expo-splash-screen"',
  "const nativeSplashImageLight = variantConfig.icons.splashDark",
  "variantConfig.icons.splashDark",
  "splashBackgroundColor",
  "splashDarkBackgroundColor",
  "imageWidth: 170",
  'resizeMode: "contain"',
  'userInterfaceStyle: "automatic"',
  'iconBackgroundColor: "#FFF8E9"',
  'iconBackgroundColor: "#1769B0"',
  'iconBackgroundColor: "#25123B"',
]
const ICON_PREFIXES = ["", "dev-", "preview-"]
const REQUIRED_PNGS = ICON_PREFIXES.flatMap((prefix) =>
  [
    { alpha: true, kind: "adaptive-icon", size: 1024 },
    { alpha: false, kind: "ios-dark", size: 1024 },
    { alpha: false, kind: "ios-light", size: 1024 },
    { alpha: false, kind: "loading-icon", size: 1024 },
    { alpha: true, kind: "splash-logo-dark", size: 640 },
    { alpha: true, kind: "splash-logo", size: 640 },
  ].map(({ kind, size, alpha }) => ({
    alpha,
    file: `${prefix}precision-rise-${kind}.png`,
    height: size,
    width: size,
  })),
)
const DISTINCT_ICON_GROUPS = ["loading-icon", "ios-light", "ios-dark"].map(
  (kind) =>
    ICON_PREFIXES.map((prefix) => `${prefix}precision-rise-${kind}.png`),
)

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
// Retained Market Day/Market Pulse illustrations are separate from launcher assets.
const expectedFiles = new Set([
  ...REQUIRED_PNGS.map(({ file }) => file),
  "market-day-splash-lockup.png",
  "market-day-splash-lockup.svg",
  "market-pulse-splash-mark.png",
  "market-pulse-splash-mark.svg",
])
for (const file of readdirSync(ICON_DIR)) {
  if (!expectedFiles.has(file)) {
    imageFailures.push(`Unexpected legacy or unconfigured icon: ${file}`)
  }
}
for (const { file } of REQUIRED_PNGS) {
  if (!configSource.includes(`./assets/icons/${file}`)) {
    imageFailures.push(`app.config.ts does not reference ${file}`)
  }
}

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

  if (metadata.hasAlpha !== png.alpha) {
    imageFailures.push(
      `${relative(REPO_ROOT, filePath)} has incorrect alpha: adaptive/splash assets must be transparent; launcher/iOS assets must be opaque.`,
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
