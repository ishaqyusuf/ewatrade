import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SCRIPT_PATH = new URL("./check-android-qa-ready.mjs", import.meta.url)
  .pathname
const REQUIRED_AVD = "Pixel_3a_API_34"
const ADB_HEADER = "List of devices attached"

const CASES = [
  {
    adbDevicesOutput: `${ADB_HEADER}\nemulator-5554 device product:sdk_gphone64 model:Pixel_3a_API_34 device:emu transport_id:1\n`,
    avdListOutput: `${REQUIRED_AVD}\n`,
    expectedStatus: 0,
    label: "online emulator passes",
    requiredOutput: "Android QA readiness check passed.",
  },
  {
    adbDevicesOutput: `${ADB_HEADER}\nlocalhost:62810 offline product:sdk_gphone64 model:Pixel_3a_API_34 transport_id:2\n`,
    avdListOutput: `${REQUIRED_AVD}\n`,
    expectedStatus: 1,
    label: "offline emulator diagnostic",
    requiredOutput: "ADB can see offline Android transports",
  },
  {
    adbDevicesOutput: `${ADB_HEADER}\nR9CT123 unauthorized usb:336592896X product:aosp model:Physical_Device transport_id:3\n`,
    avdListOutput: `${REQUIRED_AVD}\n`,
    expectedStatus: 1,
    label: "unauthorized device diagnostic",
    requiredOutput: "ADB can see unauthorized Android devices",
  },
  {
    adbDevicesOutput: `${ADB_HEADER}\nemulator-5554 device product:sdk_gphone64 model:Pixel_3a_API_34 device:emu transport_id:1\n`,
    avdListOutput: "Other_AVD\n",
    expectedStatus: 1,
    label: "missing required AVD diagnostic",
    requiredOutput: `Expected Android virtual device ${REQUIRED_AVD} was not found.`,
  },
]

for (const testCase of CASES) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ewatrade-android-ready-"))
  const adbPath = join(fixtureDir, "adb")
  const emulatorPath = join(fixtureDir, "emulator")

  try {
    writeFileSync(adbPath, "#!/bin/sh\nexit 0\n")
    writeFileSync(emulatorPath, "#!/bin/sh\nexit 0\n")
    chmodSync(adbPath, 0o755)
    chmodSync(emulatorPath, 0o755)

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      encoding: "utf8",
      env: {
        ...process.env,
        EWATRADE_ANDROID_ADB_DEVICES_OUTPUT: testCase.adbDevicesOutput,
        EWATRADE_ANDROID_ADB_PATH: adbPath,
        EWATRADE_ANDROID_AVD: REQUIRED_AVD,
        EWATRADE_ANDROID_AVD_LIST_OUTPUT: testCase.avdListOutput,
        EWATRADE_ANDROID_EMULATOR_PATH: emulatorPath,
      },
    })
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

    if (result.status !== testCase.expectedStatus) {
      fail(
        testCase.label,
        `Expected status ${testCase.expectedStatus}, received ${result.status}.`,
        output,
      )
    }

    if (!output.includes(testCase.requiredOutput)) {
      fail(
        testCase.label,
        `Expected output to include: ${testCase.requiredOutput}`,
        output,
      )
    }
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true })
  }
}

console.log("Android QA readiness fixture checks passed.")

function fail(label, message, output) {
  console.error(`Android QA readiness fixture failed: ${label}`)
  console.error(message)
  console.error(output)
  process.exit(1)
}
