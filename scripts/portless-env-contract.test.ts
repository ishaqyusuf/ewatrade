import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

function sampleEnvironment() {
  const source = readFileSync(
    path.join(import.meta.dir, "..", ".env.example"),
    "utf8",
  )

  return Object.fromEntries(
    source
      .split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=")
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

describe("Portless environment contract", () => {
  test("documents Neon as the local development database", () => {
    const databaseUrl = new URL(sampleEnvironment().DATABASE_URL)

    expect(databaseUrl.hostname.endsWith(".neon.tech")).toBe(true)
    expect(databaseUrl.hostname).not.toBe("localhost")
  })

  test("uses port-free named HTTPS hosts for local web services", () => {
    expect(sampleEnvironment()).toMatchObject({
      API_URL: "https://ewatrade-api.localhost",
      CHAT_URL: "https://chat.ewatrade-storefront.localhost",
      NEXT_PUBLIC_API_URL: "https://ewatrade-api.localhost",
      NEXT_PUBLIC_CHAT_URL: "https://chat.ewatrade-storefront.localhost",
      STOREFRONT_URL: "https://ewatrade-storefront.localhost",
      NEXT_PUBLIC_STOREFRONT_URL: "https://ewatrade-storefront.localhost",
      NEXT_PUBLIC_APP_URL: "https://ewatrade.localhost",
      NEXT_PUBLIC_MARKETING_URL: "https://ewatrade.localhost",
      NEXT_PUBLIC_DASHBOARD_URL: "https://ewatrade-dashboard.localhost",
      PLATFORM_DOMAIN: "localhost",
      NEXT_PUBLIC_PLATFORM_DOMAIN: "localhost",
    })
  })
})
