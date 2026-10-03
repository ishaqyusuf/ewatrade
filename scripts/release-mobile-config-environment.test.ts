import { describe, expect, test } from "bun:test"
import { assertConfigSourceEnvironment } from "./release-mobile-config-environment"
import { NATIVE_ENVIRONMENT_KEYS } from "./release-mobile-environment"

describe("config source environment guard", () => {
  test("accepts the mobile app's direct selectors and reviewed native reads when approved", () => {
    const source = `
      const variant = process.env.APP_VARIANT ?? process.env.EXPO_PUBLIC_APP_VARIANT
      const foreground = process.env.EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND
      const cooldown = process.env.EXPO_PUBLIC_AUTO_UPDATE_FOREGROUND_COOLDOWN_MS
      const publicClient = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
      const fallbackClient = process.env.GOOGLE_IOS_CLIENT_ID
      const chatHost = process.env.EXPO_PUBLIC_CUSTOMER_CHAT_HOST
      const profile = process.env.EAS_BUILD_PROFILE
    `
    expect(() =>
      assertConfigSourceEnvironment(
        source,
        "app.config.ts",
        NATIVE_ENVIRONMENT_KEYS,
      ),
    ).not.toThrow()
    expect(() =>
      assertConfigSourceEnvironment(source, "app.config.ts"),
    ).toThrow()
  })

  test("accepts the current mobile app config only with its five native inputs approved", async () => {
    const source = await Bun.file(
      new URL("../apps/mobile/app.config.ts", import.meta.url),
    ).text()
    expect(() =>
      assertConfigSourceEnvironment(
        source,
        "apps/mobile/app.config.ts",
        NATIVE_ENVIRONMENT_KEYS,
      ),
    ).not.toThrow()
    expect(() =>
      assertConfigSourceEnvironment(source, "apps/mobile/app.config.ts"),
    ).toThrow()
  })

  test("accepts literal bracket paths and safely wrapped global process paths", () => {
    const source = `
      const a = process["env"].APP_ENV
      const b = process.env["APP_VARIANT"]
      const c = (globalThis.process.env.EXPO_PUBLIC_CUSTOMER_CHAT_HOST as string)
      const d = global["process"]["env"]["EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND"]!
      const e = (process as NodeJS.Process).env.APP_ENV
      const f = ((globalThis)["process"] as NodeJS.Process)["env"].APP_VARIANT
      const g = (process.env).EXPO_PUBLIC_CUSTOMER_CHAT_HOST
    `
    expect(() =>
      assertConfigSourceEnvironment(source, "plugin.ts", [
        "EXPO_PUBLIC_CUSTOMER_CHAT_HOST",
        "EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND",
      ]),
    ).not.toThrow()
  })

  test("ignores comments and string literals that mention process.env", () => {
    const source = `
      // process.env.EXPO_TOKEN is only documentation
      const example = "process.env.SECRET_KEY"
      const selected = process.env.APP_ENV
    `
    expect(() =>
      assertConfigSourceEnvironment(source, "app.config.ts"),
    ).not.toThrow()
  })

  test("refuses ambient credentials, arbitrary names, dynamic keys, and whole-environment access", () => {
    const refusals = [
      "const token = process.env.EXPO_TOKEN",
      'const custom = process.env["CUSTOM_SELECTOR"]',
      "const dynamic = process.env[name]",
      "const environment = process.env",
      "const values = { ...process.env }",
      "const names = Object.keys(process.env)",
      'const env = process["env"]',
    ]
    for (const source of refusals) {
      expect(() =>
        assertConfigSourceEnvironment(
          source,
          "app.config.ts",
          NATIVE_ENVIRONMENT_KEYS,
        ),
      ).toThrow()
    }
  })

  test("refuses aliases, destructuring, and imported process aliases", () => {
    const refusals = [
      "const p = process; const value = p.env.APP_ENV",
      "const { env } = process; const value = env.APP_ENV",
      "const { APP_ENV } = process.env",
      'import proc from "node:process"; const value = proc.env.APP_ENV',
      'import proc = require("node:process"); const value = proc.env.APP_ENV',
      'const proc = require("process"); const value = proc.env.APP_ENV',
      'const proc = await import("node:process"); const value = proc.env.APP_ENV',
      "const processAlias = globalThis.process; const value = processAlias.env.APP_ENV",
      'const processAlias = globalThis["process"]; const value = processAlias.env.APP_ENV',
      'const processAlias = Reflect.get(globalThis, "process"); const value = processAlias.env.APP_ENV',
    ]
    for (const source of refusals) {
      expect(() => assertConfigSourceEnvironment(source, "plugin.ts")).toThrow()
    }
  })

  test("rejects invalid source and attempts to approve a non-native key", () => {
    expect(() =>
      assertConfigSourceEnvironment("const =", "app.config.ts"),
    ).toThrow()
    expect(() =>
      assertConfigSourceEnvironment(
        "const x = process.env.EXPO_TOKEN",
        "app.config.ts",
        ["EXPO_TOKEN"],
      ),
    ).toThrow()
  })
})
