import { spawnSync } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"

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

export function requiredValue(argv, index, option) {
  const value = argv[index]?.trim()
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`)
  }
  return value
}

export function resolveAdbPath() {
  if (process.env.ANDROID_ADB_PATH?.trim()) {
    return process.env.ANDROID_ADB_PATH.trim()
  }
  const sdkRoot =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    join(homedir(), "Library/Android/sdk")
  return join(sdkRoot, "platform-tools/adb")
}

export function runAdb(adbPath, args) {
  const result = spawnSync(adbPath, args, { encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(
      `${adbPath} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown ADB error").trim()}`,
    )
  }
  return result.stdout
}

function formatDevices(devices) {
  return devices.length > 0
    ? devices.map((device) => device.serial).join(", ")
    : "none"
}
