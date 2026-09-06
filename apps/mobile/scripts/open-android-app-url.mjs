#!/usr/bin/env node

import { existsSync } from "node:fs"
import { pathToFileURL } from "node:url"
import {
  parseAdbDevicesOutput,
  requiredValue,
  resolveAdbPath,
  runAdb,
  selectAndroidDevice,
} from "./android-adb-cli.mjs"

export function validateAndroidAppUrl({ expectedScheme, url }) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid app URL: ${url}.`)
  }

  const actualScheme = parsed.protocol.slice(0, -1)
  if (actualScheme !== expectedScheme) {
    throw new Error(
      `Use an app-specific URL with the ${expectedScheme} scheme after the development client is open. Received ${actualScheme || "no scheme"}.`,
    )
  }
  if (parsed.hostname === "expo-development-client") {
    throw new Error(
      "Use an app-specific URL, not the reserved expo-development-client URL.",
    )
  }
  if (parsed.pathname.includes("/--/")) {
    throw new Error("An app-specific URL must not contain /--/.")
  }

  return parsed.toString()
}

export function buildAndroidAppUrlLaunchArgs({ packageName, url }) {
  return [
    "shell",
    "am",
    "start",
    "-W",
    "-a",
    "android.intent.action.VIEW",
    "-c",
    "android.intent.category.BROWSABLE",
    "-d",
    quoteAndroidShellArgument(url),
    "-p",
    packageName,
  ]
}

function quoteAndroidShellArgument(value) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function isAndroidProjectResumed({ activities, packageName }) {
  return activities
    .split("\n")
    .some(
      (line) =>
        /(?:topResumedActivity=|mResumedActivity:|ResumedActivity:)/.test(
          line,
        ) && line.includes(`${packageName}/`),
    )
}

export function requireExplicitAndroidDevice(device) {
  const serial = device?.trim()
  if (!serial) {
    throw new Error(
      "--device is required so another task's emulator or device is never changed.",
    )
  }
  return serial
}

export function isEwaTradeReactRootMounted(hierarchy) {
  return hierarchy.includes('resource-id="ewatrade-react-root"')
}

function parseArguments(argv) {
  const options = {
    device: process.env.ANDROID_SERIAL?.trim() || undefined,
    expectedScheme:
      process.env.ANDROID_APP_URL_SCHEME?.trim() || "ewatrade-dev",
    packageName: process.env.ANDROID_PACKAGE_NAME?.trim() || "com.ewatrade.dev",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--device") {
      options.device = requiredValue(argv, ++index, argument)
    } else if (argument === "--url") {
      options.url = requiredValue(argv, ++index, argument)
    } else if (argument === "--package") {
      options.packageName = requiredValue(argv, ++index, argument)
    } else if (argument === "--scheme") {
      options.expectedScheme = requiredValue(argv, ++index, argument)
    } else if (argument === "--help" || argument === "-h") {
      options.help = true
    } else {
      throw new Error(`Unknown option ${argument}.`)
    }
  }

  return options
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      console.log(
        "Usage: bun run mobile:android:open --device <serial> --url <ewatrade-dev://...> [--package com.ewatrade.dev] [--scheme ewatrade-dev]",
      )
      return
    }
    if (!options.url) throw new Error("--url is required.")

    options.device = requireExplicitAndroidDevice(options.device)

    const url = validateAndroidAppUrl({
      expectedScheme: options.expectedScheme,
      url: options.url,
    })
    const adbPath = resolveAdbPath()
    if (!existsSync(adbPath))
      throw new Error(`ADB was not found at ${adbPath}.`)

    const devices = parseAdbDevicesOutput(runAdb(adbPath, ["devices", "-l"]))
    const selected = selectAndroidDevice(devices, options.device)
    const activities = runAdb(adbPath, [
      "-s",
      selected.serial,
      "shell",
      "dumpsys",
      "activity",
      "activities",
    ])
    if (
      !isAndroidProjectResumed({
        activities,
        packageName: options.packageName,
      })
    ) {
      throw new Error(
        `The ${options.packageName} project is not open on ${selected.serial}. Run mobile:android:connect first, wait for React Native to mount, then retry this app URL.`,
      )
    }

    const hierarchyPath = "/sdcard/ewatrade-react-root.xml"
    runAdb(adbPath, [
      "-s",
      selected.serial,
      "shell",
      "uiautomator",
      "dump",
      hierarchyPath,
    ])
    const hierarchy = runAdb(adbPath, [
      "-s",
      selected.serial,
      "exec-out",
      "cat",
      hierarchyPath,
    ])
    if (!isEwaTradeReactRootMounted(hierarchy)) {
      throw new Error(
        `The ${options.packageName} activity is open on ${selected.serial}, but the EwaTrade React Native project has not mounted. Wait for the app screen to appear after mobile:android:connect, then retry this app URL.`,
      )
    }

    runAdb(adbPath, [
      "-s",
      selected.serial,
      ...buildAndroidAppUrlLaunchArgs({
        packageName: options.packageName,
        url,
      }),
    ])
    console.log(`Opened ${url} on ${selected.serial}.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
