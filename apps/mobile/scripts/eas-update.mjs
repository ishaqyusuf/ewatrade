#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(__dirname, "..")
const configFile = resolve(appRoot, "app.config.ts")
const versionPattern =
  /export\s+const\s+UPDATE_VERSION\s*=\s*"(\d{4}\.\d{2}\.\d{2}(?:\.\d{2})?)"/

export function parseArgs(argv) {
  const args = { current: null, date: null, dryRun: false, prepareOnly: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--dry-run") args.dryRun = true
    else if (arg === "--prepare-only") args.prepareOnly = true
    else if (arg === "--current") {
      args.current = argv[index + 1]
      if (!args.current) throw new Error("Missing value for --current.")
      index += 1
    } else if (arg === "--date") {
      args.date = argv[index + 1]
      if (!args.date) throw new Error("Missing value for --date.")
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (!args.prepareOnly && !args.dryRun) {
    throw new Error(
      "Use --prepare-only to write update metadata; this command never publishes.",
    )
  }
  if (args.current && !args.dryRun) {
    throw new Error("--current is only supported with --dry-run.")
  }
  return args
}

function formatLocalDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}.${month}.${day}`
}

export function normalizeDateArg(dateArg, now = new Date()) {
  if (!dateArg) return formatLocalDate(now)
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(dateArg)) return dateArg
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) return dateArg.replaceAll("-", ".")
  throw new Error(
    `Invalid --date value "${dateArg}". Use YYYY-MM-DD or YYYY.MM.DD.`,
  )
}

export function getNextUpdateVersion(currentVersion, today) {
  const match = currentVersion.match(/^(\d{4}\.\d{2}\.\d{2})(?:\.(\d{2}))?$/)
  if (!match)
    throw new Error(
      `Invalid UPDATE_VERSION "${currentVersion}". Use YYYY.MM.DD or YYYY.MM.DD.CC.`,
    )
  const [, currentDate, currentCount] = match
  if (currentDate !== today) return today
  if (!currentCount) return `${today}.01`
  const nextCount = Number(currentCount) + 1
  if (nextCount > 99)
    throw new Error(`Daily update counter for ${today} exceeded 99.`)
  return `${today}.${String(nextCount).padStart(2, "0")}`
}

export function replaceUpdateVersion(source, nextVersion) {
  if (!versionPattern.test(source))
    throw new Error("Could not find UPDATE_VERSION in app.config.ts.")
  return source.replace(
    versionPattern,
    `export const UPDATE_VERSION = "${nextVersion}"`,
  )
}

export function prepareUpdateMetadata({ source, currentVersion, date }) {
  const nextVersion = getNextUpdateVersion(currentVersion, date)
  return { nextVersion, source: replaceUpdateVersion(source, nextVersion) }
}

export function executeMetadataCommand({
  argv,
  targetConfigFile,
  now = new Date(),
}) {
  const args = parseArgs(argv)
  const source = readFileSync(targetConfigFile, "utf8")
  const match = source.match(versionPattern)
  if (!match)
    throw new Error(`Could not find UPDATE_VERSION in ${targetConfigFile}.`)
  const currentVersion = args.current ?? match[1]
  const today = normalizeDateArg(args.date, now)
  const { nextVersion, source: updatedSource } = prepareUpdateMetadata({
    source,
    currentVersion,
    date: today,
  })

  if (args.dryRun) {
    return { message: `${currentVersion} -> ${nextVersion}`, changed: false }
  }

  writeFileSync(targetConfigFile, updatedSource)
  return {
    message: `Prepared UPDATE_VERSION ${currentVersion} -> ${nextVersion}. This changes native release metadata; run native compatibility checks before release.`,
    changed: true,
  }
}

function main() {
  const result = executeMetadataCommand({
    argv: process.argv.slice(2),
    targetConfigFile: configFile,
  })
  console.log(result.message)
}

if (
  process.argv[1] &&
  basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))
) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
