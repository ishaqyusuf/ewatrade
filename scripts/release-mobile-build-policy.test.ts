import { describe, expect, test } from "bun:test"
import {
  type NativeBuildConfiguration,
  assertAppVersionBuildPolicy,
  assertNativeBuildNumberAdvanced,
} from "./release-mobile-build-policy"

const baseline = {
  fingerprint: "a".repeat(40),
  runtimeVersion: "1.2.3",
  appVersion: "1.2.3",
  appBuildVersion: "17",
}

function configuration(
  appVersion: string | null = "1.2.4",
  android: NativeBuildConfiguration["runtimePolicies"]["android"] = "appVersion",
  ios: NativeBuildConfiguration["runtimePolicies"]["ios"] = "appVersion",
): NativeBuildConfiguration {
  return {
    appVersion,
    runtimePolicies: { android, ios },
  }
}

describe("reviewed native build policy", () => {
  test("requires a strict appVersion runtime bump for changed native inputs", () => {
    for (const platform of ["android", "ios"] as const) {
      expect(() =>
        assertAppVersionBuildPolicy({
          platform,
          configuration: configuration("1.2.3"),
          fingerprint: baseline.fingerprint,
          runtimeVersion: "1.2.3",
          baseline,
          nativeInputsChanged: true,
        }),
      ).toThrow("strictly increased appVersion")
    }

    expect(() =>
      assertAppVersionBuildPolicy({
        platform: "android",
        configuration: configuration("1.2.4"),
        fingerprint: "b".repeat(64),
        runtimeVersion: "1.2.4",
        baseline,
        nativeInputsChanged: false,
      }),
    ).not.toThrow()
  })

  test("permits unchanged native rebuilds at the same version or a higher version", () => {
    for (const appVersion of ["1.2.3", "1.2.4", "1.2.10"]) {
      expect(() =>
        assertAppVersionBuildPolicy({
          platform: "ios",
          configuration: configuration(appVersion),
          fingerprint: baseline.fingerprint,
          runtimeVersion: appVersion,
          baseline,
          nativeInputsChanged: false,
        }),
      ).not.toThrow()
    }
  })

  test("rejects downgrades, policy ambiguity and runtime/appVersion disagreement", () => {
    const baseInput = {
      platform: "android" as const,
      fingerprint: baseline.fingerprint,
      runtimeVersion: "1.2.3",
      baseline,
      nativeInputsChanged: false,
    }
    expect(() =>
      assertAppVersionBuildPolicy({
        ...baseInput,
        configuration: configuration("1.2.2"),
        runtimeVersion: "1.2.2",
      }),
    ).toThrow("cannot decrease")
    for (const policy of [null, "fingerprint", "explicit"] as const) {
      expect(() =>
        assertAppVersionBuildPolicy({
          ...baseInput,
          configuration: configuration("1.2.4", policy),
          runtimeVersion: "1.2.4",
        }),
      ).toThrow("only the reviewed appVersion")
    }
    expect(() =>
      assertAppVersionBuildPolicy({
        ...baseInput,
        runtimeVersion: "1.2.4",
        configuration: configuration("1.2.3"),
      }),
    ).toThrow("runtimeVersion must equal")
    expect(() =>
      assertAppVersionBuildPolicy({
        ...baseInput,
        baseline: { ...baseline, runtimeVersion: "1.2.2" },
        configuration: configuration("1.2.4"),
      }),
    ).toThrow("runtimeVersion must equal")
  })

  test("rejects missing and malformed candidate or baseline evidence", () => {
    const baseInput = {
      platform: "ios" as const,
      configuration: configuration("1.2.4"),
      fingerprint: "b".repeat(40),
      runtimeVersion: "1.2.4",
      baseline,
      nativeInputsChanged: false,
    }
    for (const appVersion of [null, "1.2", "01.2.3", "1.2.3-beta"]) {
      expect(() =>
        assertAppVersionBuildPolicy({
          ...baseInput,
          configuration: configuration(appVersion),
        }),
      ).toThrow("candidate appVersion")
    }
    expect(() =>
      assertAppVersionBuildPolicy({
        ...baseInput,
        baseline: { ...baseline, appVersion: null },
      }),
    ).toThrow("baseline appVersion")
    expect(() =>
      assertAppVersionBuildPolicy({
        ...baseInput,
        fingerprint: "bad",
      }),
    ).toThrow("fingerprint")
    expect(() =>
      assertAppVersionBuildPolicy({
        ...baseInput,
        baseline: { ...baseline, appBuildVersion: null },
      }),
    ).toThrow("provider baseline build number")
    for (const appBuildVersion of ["", "0", "01"]) {
      expect(() =>
        assertAppVersionBuildPolicy({
          ...baseInput,
          baseline: { ...baseline, appBuildVersion },
        }),
      ).toThrow("build number")
    }
  })

  test("Android build numbers are positive canonical integers and advance", () => {
    expect(() =>
      assertNativeBuildNumberAdvanced("android", "9", "10"),
    ).not.toThrow()
    expect(() =>
      assertNativeBuildNumberAdvanced(
        "android",
        "999999999999999999999",
        "1000000000000000000000",
      ),
    ).not.toThrow()
    for (const value of ["0", "01", "-1", "1.0", " 2", ""]) {
      expect(() =>
        assertNativeBuildNumberAdvanced("android", value, "2"),
      ).toThrow()
    }
    expect(() => assertNativeBuildNumberAdvanced("android", "7", "7")).toThrow(
      "must advance",
    )
  })

  test("iOS build numbers compare one to three canonical components with zero padding", () => {
    expect(() =>
      assertNativeBuildNumberAdvanced("ios", "1.2", "1.2.1"),
    ).not.toThrow()
    expect(() =>
      assertNativeBuildNumberAdvanced("ios", "1.2.0", "1.3"),
    ).not.toThrow()
    expect(() =>
      assertNativeBuildNumberAdvanced("ios", "1.99999999999999999999", "2"),
    ).not.toThrow()
    for (const value of ["0", "01", "1.02", "1.2.3.4", "-1", "1..2", ""]) {
      expect(() => assertNativeBuildNumberAdvanced("ios", value, "2")).toThrow()
    }
    for (const [before, after] of [
      ["1.2", "1.2.0"],
      ["1.2.3", "1.2"],
      ["2.0", "1.99.99"],
    ]) {
      expect(() =>
        assertNativeBuildNumberAdvanced("ios", before, after),
      ).toThrow("must advance")
    }
  })
})
