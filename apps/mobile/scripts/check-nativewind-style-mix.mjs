import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")
const NATIVE_TAGS = new Set([
  "AnimatedPressable",
  "AnimatedScrollView",
  "AnimatedText",
  "AnimatedTextInput",
  "AnimatedView",
  "Image",
  "KeyboardAvoidingView",
  "Pressable",
  "SafeAreaView",
  "ScrollView",
  "Text",
  "TextInput",
  "View",
])

const violations = []

for (const filePath of findTsxFiles(SOURCE_DIR)) {
  scanFile(filePath)
}

if (violations.length > 0) {
  console.error(
    "NativeWind style mix check failed. Do not put className and style on the same native element.",
  )

  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line}:${violation.column} <${violation.tag}> has both className and style`,
    )
  }

  process.exit(1)
}

console.log("NativeWind style mix check passed.")

function findTsxFiles(directory) {
  const files = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...findTsxFiles(entryPath))
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      files.push(entryPath)
    }
  }

  return files
}

function scanFile(filePath) {
  const source = readFileSync(filePath, "utf8")

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "<") continue
    if (
      source[index + 1] === "/" ||
      source[index + 1] === ">" ||
      source[index + 1] === "!"
    ) {
      continue
    }

    const tagStart = index + 1
    const tagEnd = readTagNameEnd(source, tagStart)
    if (tagEnd === tagStart) continue

    const tagName = source.slice(tagStart, tagEnd)
    if (!isNativeTag(tagName)) continue

    const openingEnd = readOpeningTagEnd(source, tagEnd)
    if (openingEnd === -1) continue

    const opening = source.slice(tagEnd, openingEnd)
    if (hasJsxProp(opening, "className") && hasJsxProp(opening, "style")) {
      const position = getPosition(source, index)
      violations.push({
        column: position.column,
        file: relative(MOBILE_DIR, filePath),
        line: position.line,
        tag: tagName,
      })
    }

    index = openingEnd
  }
}

function readTagNameEnd(source, start) {
  let index = start

  while (index < source.length && /[A-Za-z0-9_.$:-]/.test(source[index])) {
    index += 1
  }

  return index
}

function readOpeningTagEnd(source, start) {
  let braceDepth = 0
  let quote = null

  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    const previous = source[index - 1]

    if (quote) {
      if (character === quote && previous !== "\\") {
        quote = null
      }
      continue
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character
      continue
    }

    if (character === "{") {
      braceDepth += 1
      continue
    }

    if (character === "}") {
      braceDepth = Math.max(0, braceDepth - 1)
      continue
    }

    if (character === ">" && braceDepth === 0) {
      return index
    }
  }

  return -1
}

function isNativeTag(tagName) {
  const normalized = tagName.includes(".") ? tagName.split(".").at(-1) : tagName
  return NATIVE_TAGS.has(tagName) || NATIVE_TAGS.has(normalized)
}

function hasJsxProp(opening, propName) {
  return new RegExp(`(^|[\\s{])${propName}\\s*=`).test(opening)
}

function getPosition(source, offset) {
  const prefix = source.slice(0, offset)
  const lines = prefix.split("\n")

  return {
    column: lines.at(-1).length + 1,
    line: lines.length,
  }
}
