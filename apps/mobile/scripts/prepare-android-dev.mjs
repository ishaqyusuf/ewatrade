#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const DEFAULT_API_PORT = 3095
const DEFAULT_METRO_PORT = 3096

export function parseAdbDevicesOutput(output) {
  return output
    .split("\n")
    .slice(1)
    .map((line) => {
      const [serial, state, ...details] = line.trim().split(/\s+/)
      if (!serial || !state) return null
      return { details: details.join(" "), serial, state }
    })
    .filter(Boolean)
}

export function selectAndroidDevice(devices, requestedSerial) {
  const online = devices.filter((device) => device.state === "device")

  if (requestedSerial) {
    const selected = online.find((device) => device.serial === requestedSerial)
    if (!selected) {
      throw new Error(
        `Android device ${requestedSerial} is not online. Online devices: ${formatDevices(online)}.`,
      )
    }
    return selected
  }

  if (online.length === 0) {
    throw new Error("No online Android device is available.")
  }
  if (online.length > 1) {
    throw new Error(
      `More than one Android device is online (${formatDevices(online)}). Pass --device <serial> so another task's device is never changed.`,
    )
  }
  return online[0]
}

export function expectedReverseMappings({ apiPort, metroPort }) {
  return [`tcp:${apiPort} tcp:${apiPort}`, `tcp:${metroPort} tcp:${metroPort}`]
}

export function buildExpoDevClientUrl({ metroPort, scheme }) {
  const metroUrl = `http://127.0.0.1:${metroPort}`
  return `${scheme}://expo-development-client/?url=${encodeURIComponent(metroUrl)}`
}

export function buildExpoDevClientLaunchCommands({
  devClientUrl,
  packageName,
}) {
  return [
    ["shell", "am", "force-stop", packageName],
    [
      "shell",
      "am",
      "start",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      devClientUrl,
      packageName,
    ],
  ]
}

export function parseReverseList(output) {
  const mappings = output
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .map((parts) => parts.slice(-2).join(" "))

  return new Set(mappings)
}

export function classifyQaCapabilityProbe({ body = "", error, status }) {
  if (error) return "api_unreachable"

  if (
    status === 404 &&
    (body.includes("No procedure found") ||
      body.includes("qaAccess.capability"))
  ) {
    return "stale_api"
  }

  if (!status || status < 200 || status >= 300) return "api_incompatible"

  try {
    const payload = JSON.parse(body)
    const availability = payload?.result?.data?.json
    if (availability?.available === true) return "ready"
    if (availability?.available === false) {
      if (availability.category === "upgrade_required") {
        return "client_upgrade_required"
      }
      if (availability.category === "environment_not_allowed") {
        return "wrong_environment"
      }
      return "qa_not_configured"
    }
  } catch {
    return "api_incompatible"
  }

  return "api_incompatible"
}

function parseArguments(argv) {
  const options = {
    apiPort: parsePort(
      process.env.EXPO_PUBLIC_API_PORT || String(DEFAULT_API_PORT),
      "EXPO_PUBLIC_API_PORT",
    ),
    device: process.env.ANDROID_SERIAL?.trim() || undefined,
    metroPort: parsePort(
      process.env.EXPO_PORT || String(DEFAULT_METRO_PORT),
      "EXPO_PORT",
    ),
    launch: true,
    packageName: process.env.ANDROID_PACKAGE_NAME?.trim() || "com.ewatrade.dev",
    requireQa: false,
    scheme: process.env.EXPO_DEV_CLIENT_SCHEME?.trim() || "exp+ewatrade",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--device") {
      options.device = requiredValue(argv, ++index, argument)
    } else if (argument === "--api-port") {
      options.apiPort = parsePort(
        requiredValue(argv, ++index, argument),
        argument,
      )
    } else if (argument === "--metro-port") {
      options.metroPort = parsePort(
        requiredValue(argv, ++index, argument),
        argument,
      )
    } else if (argument === "--require-qa") {
      options.requireQa = true
    } else if (argument === "--no-launch") {
      options.launch = false
    } else if (argument === "--package") {
      options.packageName = requiredValue(argv, ++index, argument)
    } else if (argument === "--scheme") {
      options.scheme = requiredValue(argv, ++index, argument)
    } else if (argument === "--help" || argument === "-h") {
      options.help = true
    } else {
      throw new Error(`Unknown option ${argument}.`)
    }
  }

  return options
}

function requiredValue(argv, index, option) {
  const value = argv[index]?.trim()
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`)
  }
  return value
}

function parsePort(value, option) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${option} must be an integer between 1 and 65535.`)
  }
  return port
}

function formatDevices(devices) {
  return devices.length > 0
    ? devices.map((device) => device.serial).join(", ")
    : "none"
}

function resolveAdbPath() {
  if (process.env.ANDROID_ADB_PATH?.trim()) {
    return process.env.ANDROID_ADB_PATH.trim()
  }
  const sdkRoot =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    join(homedir(), "Library/Android/sdk")
  return join(sdkRoot, "platform-tools/adb")
}

function runAdb(adbPath, args) {
  const result = spawnSync(adbPath, args, { encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(
      `${adbPath} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown ADB error").trim()}`,
    )
  }
  return result.stdout
}

async function probe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4_000) })
    return { body: await response.text(), status: response.status }
  } catch (error) {
    return { error }
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      console.log(
        "Usage: bun run mobile:android:connect --device <serial> [--api-port 3095] [--metro-port 3096] [--require-qa] [--no-launch] [--package com.ewatrade.dev] [--scheme exp+ewatrade]",
      )
      return
    }

    const adbPath = resolveAdbPath()
    if (!existsSync(adbPath)) {
      throw new Error(`ADB was not found at ${adbPath}.`)
    }

    const devices = parseAdbDevicesOutput(runAdb(adbPath, ["devices", "-l"]))
    const selected = selectAndroidDevice(devices, options.device)
    const mappings = expectedReverseMappings(options)

    for (const mapping of mappings) {
      const [devicePort, hostPort] = mapping.split(" ")
      runAdb(adbPath, ["-s", selected.serial, "reverse", devicePort, hostPort])
    }

    const installedMappings = parseReverseList(
      runAdb(adbPath, ["-s", selected.serial, "reverse", "--list"]),
    )
    const missingMappings = mappings.filter(
      (mapping) => !installedMappings.has(mapping),
    )
    if (missingMappings.length > 0) {
      throw new Error(
        `ADB did not retain reverse mappings: ${missingMappings.join(", ")}.`,
      )
    }

    const metroUrl = `http://127.0.0.1:${options.metroPort}/status`
    const apiHealthUrl = `http://127.0.0.1:${options.apiPort}/health`
    const capabilityInput = encodeURIComponent(
      JSON.stringify({ json: { contractVersion: 1 } }),
    )
    const capabilityUrl = `http://127.0.0.1:${options.apiPort}/api/trpc/qaAccess.capability?input=${capabilityInput}`
    const [metro, apiHealth, qaCapability] = await Promise.all([
      probe(metroUrl),
      probe(apiHealthUrl),
      probe(capabilityUrl),
    ])

    const failures = []
    if (
      metro.error ||
      metro.status !== 200 ||
      !metro.body.includes("packager-status:running")
    ) {
      failures.push(
        `Metro is not ready on ${options.metroPort}. Start the unified stack with: bun run dev --local -f mobile api jobs dashboard`,
      )
    }

    if (apiHealth.error || apiHealth.status !== 200) {
      failures.push(
        `API health is not ready on ${options.apiPort}. Restart the unified stack; a listener alone is not sufficient.`,
      )
    }

    const capabilityState = classifyQaCapabilityProbe(qaCapability)
    if (capabilityState === "api_unreachable") {
      failures.push(
        `The API cannot be reached on ${options.apiPort}. Start the unified stack before reconnecting Android.`,
      )
    } else if (capabilityState === "stale_api") {
      failures.push(
        "The process on the API port is stale or was started with the wrong environment: qaAccess.capability is missing. Stop that EwaTrade API process and restart the unified local stack.",
      )
    } else if (capabilityState === "qa_not_configured" && options.requireQa) {
      failures.push(
        "The API is compatible, but its QA accelerator configuration is unavailable for this local environment.",
      )
    } else if (capabilityState === "client_upgrade_required") {
      failures.push(
        "The API is current, but this mobile QA contract is outdated. Install or rebuild the current EwaTrade development client.",
      )
    } else if (capabilityState === "wrong_environment") {
      failures.push(
        "The API was started in an environment that does not allow QA access. Use an authorized local, development, or preview server profile.",
      )
    } else if (capabilityState === "api_incompatible") {
      failures.push(
        "The API responded, but not with the expected QA capability contract. Restart it from the current EwaTrade source and local environment.",
      )
    }

    if (failures.length > 0) {
      console.error("Android development connection is not ready.")
      console.error(`Selected device: ${selected.serial}`)
      console.error(`Installed reverse mappings: ${mappings.join(", ")}`)
      for (const failure of failures) console.error(`- ${failure}`)
      process.exitCode = 1
      return
    }

    const devClientUrl = buildExpoDevClientUrl({
      metroPort: options.metroPort,
      scheme: options.scheme,
    })
    if (options.launch) {
      const commands = buildExpoDevClientLaunchCommands({
        devClientUrl,
        packageName: options.packageName,
      })
      for (const command of commands) {
        runAdb(adbPath, ["-s", selected.serial, ...command])
      }
    }

    console.log("Android development connection is ready.")
    console.log(`Selected device: ${selected.serial}`)
    console.log(`Verified reverse mappings: ${mappings.join(", ")}`)
    console.log(`Verified Metro: ${metroUrl}`)
    console.log(`Verified API health: ${apiHealthUrl}`)
    console.log(
      options.launch
        ? `Opened verified Metro in ${options.packageName}: ${devClientUrl}`
        : `Verified development-client URL (not opened): ${devClientUrl}`,
    )
    if (capabilityState === "qa_not_configured") {
      console.log(
        "QA profile selection is not configured for this environment. Android, Metro, and the API are connected; add the runbook's QA server configuration and data before expecting the QA Access Profile list.",
      )
    } else {
      console.log("Verified QA capability contract: ready")
    }
  } catch (error) {
    console.error("Android development connection setup failed.")
    console.error(`- ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main()
}
