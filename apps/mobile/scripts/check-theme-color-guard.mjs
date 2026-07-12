import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")
const THEME_FILE = join(SOURCE_DIR, "lib/theme.ts")
const GLOBAL_CSS_FILE = join(SOURCE_DIR, "styles/global.css")
const SCAN_TARGETS = [
  "app",
  "screens",
  "components/mobile",
  "components/ui",
  "components/logout.tsx",
  "components/safe-area.tsx",
  "components/theme-toggle.tsx",
]
const EXCLUDED_FILES = new Set(["app/+html.tsx"])
const DISALLOWED_PATTERNS = [
  {
    pattern: /#[0-9A-Fa-f]{3,8}/,
    reason: "fixed hex color literal",
  },
  {
    pattern: /\b(?:bg|border|text)-(?:black|white)(?:\b|\/)/,
    reason: "fixed black/white NativeWind color token",
  },
  {
    pattern: /\b(?:backgroundColor|borderColor|color|shadowColor)\s*:\s*["'`]/,
    reason: "fixed inline color string",
  },
  {
    pattern: /\b(?:color|placeholderTextColor)\s*=\s*["'`]/,
    reason: "fixed JSX color prop",
  },
]

const violations = []

checkDarkThemeTokens()

for (const target of SCAN_TARGETS) {
  const targetPath = join(SOURCE_DIR, target)

  for (const filePath of findSourceFiles(targetPath)) {
    scanFile(filePath)
  }
}

if (violations.length > 0) {
  console.error(
    "Theme color guard failed. Use semantic NativeWind tokens, useColors(), or a shared UI primitive instead of fixed light/dark colors on app-facing mobile surfaces.",
  )

  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line}: ${violation.reason}: ${violation.text}`,
    )
  }

  process.exit(1)
}

console.log("Theme color guard passed.")

function checkDarkThemeTokens() {
  const tokenFiles = [
    {
      contents: extractDarkTokenSection(
        readFileSync(THEME_FILE, "utf8"),
        "dark: {",
        "\n  },\n}",
      ),
      file: relative(MOBILE_DIR, THEME_FILE),
    },
    {
      contents: extractDarkTokenSection(
        readFileSync(GLOBAL_CSS_FILE, "utf8"),
        "@media (prefers-color-scheme: dark)",
        "\n}\n",
      ),
      file: relative(MOBILE_DIR, GLOBAL_CSS_FILE),
    },
  ]
  const requiredDarkTokens = [
    {
      label: "matte black canvas",
      token: "rgb(18, 18, 18)",
    },
    {
      label: "charcoal card surface",
      token: "rgb(30, 30, 30)",
    },
    {
      label: "crisp white foreground",
      token: "rgb(250, 250, 250)",
    },
    {
      label: "orange brand/action accent",
      token: "rgb(255, 108, 0)",
    },
    {
      label: "green success/online accent",
      token: "rgb(34, 197, 94)",
    },
    {
      label: "muted gray metadata",
      token: "rgb(163, 163, 163)",
    },
  ]
  const retiredSlateTokens = [
    "rgb(15, 23, 42)",
    "rgb(30, 41, 59)",
    "rgb(51, 65, 85)",
    "rgb(96, 165, 250)",
    "rgb(125, 211, 252)",
  ]

  for (const { contents, file } of tokenFiles) {
    for (const { label, token } of requiredDarkTokens) {
      if (contents.includes(token)) continue

      violations.push({
        file,
        line: 1,
        reason: `missing sample-inspired dark token for ${label}`,
        text: token,
      })
    }

    for (const token of retiredSlateTokens) {
      if (!contents.includes(token)) continue

      violations.push({
        file,
        line: 1,
        reason: "retired slate/navy dark token still present",
        text: token,
      })
    }
  }
}

function extractDarkTokenSection(contents, startMarker, endMarker) {
  const startIndex = contents.indexOf(startMarker)

  if (startIndex === -1) return ""

  const endIndex = contents.indexOf(endMarker, startIndex)

  if (endIndex === -1) {
    return contents.slice(startIndex)
  }

  return contents.slice(startIndex, endIndex)
}

function findSourceFiles(targetPath) {
  const files = []
  const relativeTarget = relative(SOURCE_DIR, targetPath)

  if (isSourceFile(targetPath) && !EXCLUDED_FILES.has(relativeTarget)) {
    return [targetPath]
  }

  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    const entryPath = join(targetPath, entry.name)

    if (entry.isDirectory()) {
      files.push(...findSourceFiles(entryPath))
    } else if (entry.isFile() && isSourceFile(entryPath)) {
      const relativePath = relative(SOURCE_DIR, entryPath)

      if (!EXCLUDED_FILES.has(relativePath)) {
        files.push(entryPath)
      }
    }
  }

  return files
}

function isSourceFile(filePath) {
  return filePath.endsWith(".ts") || filePath.endsWith(".tsx")
}

function scanFile(filePath) {
  const relativePath = relative(MOBILE_DIR, filePath)
  const lines = readFileSync(filePath, "utf8").split("\n")

  lines.forEach((line, index) => {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith("//")) return

    for (const { pattern, reason } of DISALLOWED_PATTERNS) {
      if (!pattern.test(line)) continue
      if (trimmedLine === 'color: "default",') continue

      violations.push({
        file: relativePath,
        line: index + 1,
        reason,
        text: trimmedLine,
      })
    }
  })
}
