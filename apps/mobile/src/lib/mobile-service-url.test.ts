import { describe, expect, test } from "bun:test"
import { resolveMobileServiceUrl } from "./mobile-service-url"

describe("resolveMobileServiceUrl", () => {
  test("keeps the configured production Customer Chat origin", () => {
    expect(
      resolveMobileServiceUrl({
        configuredUrl: "https://chat.ewatrade.com/",
        debuggerHostname: "10.0.2.2",
        defaultPort: "3091",
        requiredUrlName: "EXPO_PUBLIC_CHAT_URL",
      }),
    ).toBe("https://chat.ewatrade.com")
  })

  test("rewrites a configured local origin for an installed Android client", () => {
    expect(
      resolveMobileServiceUrl({
        configuredUrl: "http://localhost:3091",
        debuggerHostname: "10.0.2.2",
        defaultPort: "3091",
        requiredUrlName: "EXPO_PUBLIC_CHAT_URL",
      }),
    ).toBe("http://10.0.2.2:3091")
  })

  test("uses the dedicated chat port when no URL is configured", () => {
    expect(
      resolveMobileServiceUrl({
        configuredPort: "3091",
        debuggerHostname: "192.168.1.20",
        defaultPort: "3091",
        requiredUrlName: "EXPO_PUBLIC_CHAT_URL",
      }),
    ).toBe("http://192.168.1.20:3091")
  })

  test("fails closed when neither an origin nor Expo host is available", () => {
    expect(() =>
      resolveMobileServiceUrl({
        debuggerHostname: null,
        defaultPort: "3091",
        requiredUrlName: "EXPO_PUBLIC_CHAT_URL",
      }),
    ).toThrow(
      "EXPO_PUBLIC_CHAT_URL must be set when a local Expo host is unavailable.",
    )
  })
})
