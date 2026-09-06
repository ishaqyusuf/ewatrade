import { describe, expect, test } from "bun:test"
import {
  buildAndroidAppUrlLaunchArgs,
  isAndroidProjectResumed,
  isEwaTradeReactRootMounted,
  requireExplicitAndroidDevice,
  validateAndroidAppUrl,
} from "./open-android-app-url.mjs"

describe("Android native app URL launcher", () => {
  test("rejects development-client and Expo Go route URLs", () => {
    expect(() =>
      validateAndroidAppUrl({
        expectedScheme: "ewatrade-dev",
        url: "exp+ewatrade://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A3096%2F--%2Fdesign-system%2Fbusiness-home-market-ledger",
      }),
    ).toThrow("app-specific URL")

    expect(() =>
      validateAndroidAppUrl({
        expectedScheme: "ewatrade-dev",
        url: "ewatrade-dev://business-home-market-ledger/--/attendant",
      }),
    ).toThrow("must not contain /--/")
  })

  test("builds a BROWSABLE intent for the selected app package", () => {
    const url =
      "ewatrade-dev://business-home-market-ledger?state=attendant&theme=light"

    expect(validateAndroidAppUrl({ expectedScheme: "ewatrade-dev", url })).toBe(
      url,
    )
    expect(
      buildAndroidAppUrlLaunchArgs({
        packageName: "com.ewatrade.dev",
        url,
      }),
    ).toEqual([
      "shell",
      "am",
      "start",
      "-W",
      "-a",
      "android.intent.action.VIEW",
      "-c",
      "android.intent.category.BROWSABLE",
      "-d",
      `'${url}'`,
      "-p",
      "com.ewatrade.dev",
    ])
  })

  test("recognizes the Android 14 top-resumed activity report", () => {
    expect(
      isAndroidProjectResumed({
        activities:
          "topResumedActivity=ActivityRecord{abc u0 com.ewatrade.dev/.MainActivity t249}",
        packageName: "com.ewatrade.dev",
      }),
    ).toBe(true)
  })

  test("requires the caller to name the emulator or device", () => {
    expect(() => requireExplicitAndroidDevice(undefined)).toThrow(
      "--device is required",
    )
    expect(requireExplicitAndroidDevice("emulator-5556")).toBe("emulator-5556")
  })

  test("distinguishes the mounted React project from the native launcher activity", () => {
    expect(
      isEwaTradeReactRootMounted(
        '<node package="com.ewatrade.dev" resource-id="ewatrade-react-root" />',
      ),
    ).toBe(true)
    expect(
      isEwaTradeReactRootMounted(
        '<node package="com.ewatrade.dev" resource-id="android:id/content" />',
      ),
    ).toBe(false)
  })
})
