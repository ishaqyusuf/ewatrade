import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const sdkRoot =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  join(homedir(), "Library/Android/sdk")
const adbPath =
  process.env.EWATRADE_ANDROID_ADB_PATH || join(sdkRoot, "platform-tools/adb")
const emulatorPath =
  process.env.EWATRADE_ANDROID_EMULATOR_PATH ||
  join(sdkRoot, "emulator/emulator")
const REQUIRED_AVD = process.env.EWATRADE_ANDROID_AVD || "Pixel_3a_API_34"
const failures = []

function parseAdbDeviceLine(line) {
  const [serial, state, ...details] = line.trim().split(/\s+/)

  if (!serial || !state) return null

  return {
    details: details.join(" "),
    serial,
    state,
  }
}

function formatAdbDeviceRows(rows) {
  return rows
    .map((row) => {
      if (!row.details) return `${row.serial} (${row.state})`

      return `${row.serial} (${row.state}; ${row.details})`
    })
    .join(", ")
}

function parseAdbDevicesOutput(output) {
  return output.split("\n").slice(1).map(parseAdbDeviceLine).filter(Boolean)
}

if (!existsSync(adbPath)) {
  failures.push(`ADB was not found at ${adbPath}.`)
}

if (!existsSync(emulatorPath)) {
  failures.push(`Android emulator was not found at ${emulatorPath}.`)
}

let avds = []
if (existsSync(emulatorPath)) {
  if (process.env.EWATRADE_ANDROID_AVD_LIST_OUTPUT) {
    avds = process.env.EWATRADE_ANDROID_AVD_LIST_OUTPUT.split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  } else {
    const emulatorResult = spawnSync(emulatorPath, ["-list-avds"], {
      encoding: "utf8",
    })

    if (emulatorResult.status !== 0) {
      failures.push("Could not list Android virtual devices.")
    } else {
      avds = emulatorResult.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    }
  }
}

if (!avds.includes(REQUIRED_AVD)) {
  const availableAvds =
    avds.length > 0 ? ` Available AVDs: ${avds.join(", ")}.` : ""

  failures.push(
    `Expected Android virtual device ${REQUIRED_AVD} was not found.${availableAvds}`,
  )
}

let adbRows = []
let onlineDevices = []
if (existsSync(adbPath)) {
  if (process.env.EWATRADE_ANDROID_ADB_DEVICES_OUTPUT) {
    adbRows = parseAdbDevicesOutput(
      process.env.EWATRADE_ANDROID_ADB_DEVICES_OUTPUT,
    )
  } else {
    const adbResult = spawnSync(adbPath, ["devices", "-l"], {
      encoding: "utf8",
    })

    if (adbResult.status !== 0) {
      failures.push("Could not list ADB devices.")
    } else {
      adbRows = parseAdbDevicesOutput(adbResult.stdout)
    }
  }

  onlineDevices = adbRows.filter((row) => row.state === "device")
}

const offlineDevices = adbRows.filter((row) => row.state === "offline")
const unauthorizedDevices = adbRows.filter(
  (row) => row.state === "unauthorized",
)
const unknownStateDevices = adbRows.filter(
  (row) => !["device", "offline", "unauthorized"].includes(row.state),
)

if (onlineDevices.length === 0) {
  if (offlineDevices.length > 0) {
    failures.push(
      `ADB can see offline Android transports: ${formatAdbDeviceRows(
        offlineDevices,
      )}. Fully boot the emulator, restart ADB, or disconnect stale localhost transports before hands-on QA.`,
    )
  }

  if (unauthorizedDevices.length > 0) {
    failures.push(
      `ADB can see unauthorized Android devices: ${formatAdbDeviceRows(
        unauthorizedDevices,
      )}. Unlock the device and approve USB debugging before hands-on QA.`,
    )
  }

  if (unknownStateDevices.length > 0) {
    failures.push(
      `ADB reported Android transports that are not ready: ${formatAdbDeviceRows(
        unknownStateDevices,
      )}. Resolve the device state before hands-on QA.`,
    )
  }

  failures.push(
    "No online Android device or emulator is attached through ADB. Start the emulator or connect a device before hands-on QA.",
  )
}

if (failures.length > 0) {
  console.error("Android QA readiness check failed.")

  for (const failure of failures) {
    console.error(`- ${failure}`)
  }

  process.exit(1)
}

console.log("Android QA readiness check passed.")
console.log(`Using AVD target: ${REQUIRED_AVD}`)
console.log(`Online ADB devices: ${formatAdbDeviceRows(onlineDevices)}`)
