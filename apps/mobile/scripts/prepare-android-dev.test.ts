import { describe, expect, test } from "bun:test"
import {
  classifyQaCapabilityProbe,
  expectedReverseMappings,
  parseAdbDevicesOutput,
  parseReverseList,
  selectAndroidDevice,
} from "./prepare-android-dev.mjs"

describe("Android development connection", () => {
  const twoOnlineDevices = parseAdbDevicesOutput(`List of devices attached
emulator-5554 device product:sdk_gphone64 model:Pixel_7 device:emu
emulator-5556 device product:sdk_gphone64 model:Pixel_3a_API_34 device:emu
`)

  test("never silently chooses when multiple devices are online", () => {
    expect(() => selectAndroidDevice(twoOnlineDevices)).toThrow(
      "More than one Android device is online",
    )
  })

  test("uses only the explicitly selected online device", () => {
    expect(selectAndroidDevice(twoOnlineDevices, "emulator-5556").serial).toBe(
      "emulator-5556",
    )
    expect(() =>
      selectAndroidDevice(twoOnlineDevices, "emulator-5570"),
    ).toThrow("emulator-5570 is not online")
  })

  test("requires both API and Metro reverse mappings", () => {
    expect(expectedReverseMappings({ apiPort: 3095, metroPort: 3096 })).toEqual(
      ["tcp:3095 tcp:3095", "tcp:3096 tcp:3096"],
    )
    expect(
      parseReverseList(
        "emulator-5556 tcp:3095 tcp:3095\nemulator-5556 tcp:3096 tcp:3096\n",
      ),
    ).toEqual(new Set(["tcp:3095 tcp:3095", "tcp:3096 tcp:3096"]))
  })

  test("separates an unreachable API from a stale API process", () => {
    expect(
      classifyQaCapabilityProbe({ error: new Error("fetch failed") }),
    ).toBe("api_unreachable")
    expect(
      classifyQaCapabilityProbe({
        body: 'No procedure found on path "qaAccess.capability"',
        status: 404,
      }),
    ).toBe("stale_api")
  })

  test("separates QA configuration from server compatibility", () => {
    expect(
      classifyQaCapabilityProbe({
        body: JSON.stringify({
          result: {
            data: {
              json: { available: false, category: "configuration_missing" },
            },
          },
        }),
        status: 200,
      }),
    ).toBe("qa_not_configured")
    expect(
      classifyQaCapabilityProbe({
        body: JSON.stringify({
          result: { data: { json: { available: true, contractVersion: 1 } } },
        }),
        status: 200,
      }),
    ).toBe("ready")
  })

  test("preserves server-reported contract and environment failures", () => {
    const capabilityBody = (category: string) =>
      JSON.stringify({
        result: { data: { json: { available: false, category } } },
      })

    expect(
      classifyQaCapabilityProbe({
        body: capabilityBody("upgrade_required"),
        status: 200,
      }),
    ).toBe("client_upgrade_required")
    expect(
      classifyQaCapabilityProbe({
        body: capabilityBody("environment_not_allowed"),
        status: 200,
      }),
    ).toBe("wrong_environment")
  })
})
