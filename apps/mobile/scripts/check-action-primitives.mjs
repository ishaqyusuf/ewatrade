import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const PRESSABLE_FILE = join(MOBILE_DIR, "src/components/ui/pressable.tsx")
const BUTTON_FILE = join(MOBILE_DIR, "src/components/ui/button.tsx")
const ACTION_BUTTON_FILE = join(
  MOBILE_DIR,
  "src/components/mobile/action-button.tsx",
)
const ALLOWED_RAW_PRESSABLE_FILES = new Set([
  "src/components/ui/modal.tsx",
  "src/components/ui/pressable.tsx",
])
const PRIMITIVE_CONTRACTS = [
  {
    file: PRESSABLE_FILE,
    markers: [
      "Pressable as BasePressable",
      "expo-haptics",
      "useRouter",
      "router.push(href)",
      "android_ripple",
      "hexToRgba",
      "active:scale-[0.98]",
    ],
    reason:
      "shared Pressable must keep haptics, route navigation, ripple color, and pressed-state feedback",
  },
  {
    file: BUTTON_FILE,
    markers: [
      "@/components/ui/pressable",
      "haptic={!props.disabled}",
      'role="button"',
      "transition",
      "buttonVariants",
      "buttonTextVariants",
    ],
    reason:
      "shared Button must keep using the haptic Pressable primitive and shared variants",
  },
  {
    file: ACTION_BUTTON_FILE,
    markers: [
      "import { Button",
      'from "@/components/ui/button"',
      "min-h-[50px] w-full rounded-xl",
      'size="lg"',
      "isLoading",
      "loadingLabel",
      "ActivityIndicator",
      "Icon",
      "bg-primary",
    ],
    reason:
      "mobile ActionButton must keep wrapping the shared Button primitive with auth-style sizing, icons, and loading state",
  },
]
const failures = []

for (const contract of PRIMITIVE_CONTRACTS) {
  const source = readFileSync(contract.file, "utf8")
  const missingMarkers = contract.markers.filter(
    (marker) => !source.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: contract.file,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

const sourceFiles = listTsxFiles(join(MOBILE_DIR, "src"))
for (const file of sourceFiles) {
  const relativeFile = relative(MOBILE_DIR, file)
  const source = readFileSync(file, "utf8")

  for (const forbidden of [
    "TouchableOpacity",
    "TouchableHighlight",
    "TouchableWithoutFeedback",
    "TouchableNativeFeedback",
  ]) {
    if (source.includes(forbidden)) {
      failures.push({
        file,
        message: `use shared Pressable/Button primitives instead of ${forbidden}.`,
      })
    }
  }

  if (
    !ALLOWED_RAW_PRESSABLE_FILES.has(relativeFile) &&
    hasRawReactNativePressableImport(source)
  ) {
    failures.push({
      file,
      message:
        "raw React Native Pressable is only allowed inside the shared primitive or Reanimated-compatible modal backdrop.",
    })
  }
}

if (failures.length > 0) {
  console.error(
    "Mobile action primitive check failed. Keep app actions on shared haptic Pressable/Button primitives.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(MOBILE_DIR, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Mobile action primitive check passed.")

function hasRawReactNativePressableImport(source) {
  const importMatches =
    source.match(/import\s+\{[^}]*\}\s+from\s+["']react-native["']/g) ?? []

  return importMatches.some((statement) => /\bPressable\b/.test(statement))
}

function listTsxFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...listTsxFiles(entryPath))
      continue
    }

    if (entry.isFile() && entry.name.endsWith(".tsx")) {
      files.push(entryPath)
    }
  }

  return files
}
