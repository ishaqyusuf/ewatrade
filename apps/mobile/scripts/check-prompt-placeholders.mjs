import { readFileSync, readdirSync } from "node:fs"
import { extname, join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const REPO_ROOT = resolve(MOBILE_DIR, "../..")
const SCAN_DIRS = [
  join(REPO_ROOT, "apps/mobile/src"),
  join(REPO_ROOT, "apps/storefront/src/app/p"),
]
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"])
const BANNED_PLACEHOLDER_PATTERNS = [
  /owner@/i,
  /@business/i,
  /@example/i,
  /\baisha\b/i,
  /\bamina\b/i,
  /\bhalf bag\b/i,
  /\bquarter bag\b/i,
  /\bstarter\b/i,
  /\beg\b/i,
  /\be\.g\./i,
  /\bexample\b/i,
]

const violations = []

for (const directory of SCAN_DIRS) {
  for (const filePath of findSourceFiles(directory)) {
    scanFile(filePath)
  }
}

if (violations.length > 0) {
  console.error(
    'Prompt placeholder check failed. Use direct prompts such as "Enter your email address" instead of sample values.',
  )

  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line}:${violation.column} placeholder contains ${violation.match}: ${violation.value}`,
    )
  }

  process.exit(1)
}

console.log("Prompt placeholder check passed.")

function findSourceFiles(directory) {
  const files = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...findSourceFiles(entryPath))
      continue
    }

    if (!entry.isFile()) continue
    if (entry.name.includes(".test.")) continue
    if (!SOURCE_EXTENSIONS.has(extname(entry.name))) continue

    files.push(entryPath)
  }

  return files
}

function scanFile(filePath) {
  const source = readFileSync(filePath, "utf8")
  const propPattern = /\bplaceholder\s*=/g
  let match = propPattern.exec(source)

  while (match) {
    const valueStart = skipWhitespace(source, propPattern.lastIndex)
    const value = readPlaceholderValue(source, valueStart)

    if (value) {
      for (const placeholder of value.strings) {
        checkPlaceholder(source, filePath, match.index, placeholder)
      }
      propPattern.lastIndex = Math.max(propPattern.lastIndex, value.end)
    }

    match = propPattern.exec(source)
  }
}

function skipWhitespace(source, start) {
  let index = start

  while (index < source.length && /\s/.test(source[index])) {
    index += 1
  }

  return index
}

function readPlaceholderValue(source, start) {
  const first = source[start]

  if (first === '"' || first === "'") {
    const literal = readQuotedString(source, start)
    if (!literal) return null
    return {
      end: literal.end,
      strings: [literal.value],
    }
  }

  if (first !== "{") return null

  const expressionEnd = readBalancedExpressionEnd(source, start)
  if (expressionEnd === -1) return null

  return {
    end: expressionEnd,
    strings: extractQuotedStrings(source.slice(start + 1, expressionEnd - 1)),
  }
}

function readQuotedString(source, start) {
  const quote = source[start]
  let value = ""

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index]
    const previous = source[index - 1]

    if (character === quote && previous !== "\\") {
      return { end: index + 1, value }
    }

    value += character
  }

  return null
}

function readBalancedExpressionEnd(source, start) {
  let depth = 0
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
      depth += 1
      continue
    }

    if (character === "}") {
      depth -= 1
      if (depth === 0) {
        return index + 1
      }
    }
  }

  return -1
}

function extractQuotedStrings(source) {
  const strings = []

  for (let index = 0; index < source.length; index += 1) {
    const quote = source[index]
    if (quote !== '"' && quote !== "'") continue

    const literal = readQuotedString(source, index)
    if (!literal) break
    strings.push(literal.value)
    index = literal.end - 1
  }

  return strings
}

function checkPlaceholder(source, filePath, offset, value) {
  for (const pattern of BANNED_PLACEHOLDER_PATTERNS) {
    const match = value.match(pattern)
    if (!match) continue

    const position = getPosition(source, offset)
    violations.push({
      column: position.column,
      file: relative(REPO_ROOT, filePath),
      line: position.line,
      match: match[0],
      value,
    })
  }
}

function getPosition(source, offset) {
  const prefix = source.slice(0, offset)
  const lines = prefix.split("\n")

  return {
    column: lines.at(-1).length + 1,
    line: lines.length,
  }
}
