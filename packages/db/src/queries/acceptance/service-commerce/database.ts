import { describe } from "bun:test"

const databaseUrl = process.env.EWATRADE_DATABASE_URL
const databaseIntegrationEnabled =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"

if (databaseIntegrationEnabled) {
  if (
    process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
    process.env.DEV_PROFILE !== "local"
  ) {
    throw new Error(
      "Service Commerce integration tests require the verified local database profile.",
    )
  }
  const hostname = databaseUrl
    ? new URL(databaseUrl).hostname.toLowerCase().replace(/\.$/, "")
    : ""
  if (!hostname.endsWith(".neon.tech")) {
    throw new Error(
      "Service Commerce integration tests require the .env.local Neon development database.",
    )
  }
}

export const describeWithServiceCommerceDatabase =
  databaseUrl && databaseIntegrationEnabled ? describe : describe.skip
