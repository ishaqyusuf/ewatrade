import { describe } from "bun:test"

const databaseUrl = process.env.EWATRADE_DATABASE_URL
const databaseIntegrationEnabled =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"

export function assertQaAccessAcceptanceDatabase() {
  if (
    process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
    process.env.DEV_PROFILE !== "local"
  ) {
    throw new Error(
      "QA access integration tests require the verified local database profile.",
    )
  }

  const expectedHostname =
    process.env.QA_ACCESS_ACCEPTANCE_DATABASE_HOST?.trim()
      .toLowerCase()
      .replace(/\.$/, "")
  if (!expectedHostname) {
    throw new Error(
      "QA access integration tests require QA_ACCESS_ACCEPTANCE_DATABASE_HOST.",
    )
  }

  const hostname = databaseUrl
    ? new URL(databaseUrl).hostname.toLowerCase().replace(/\.$/, "")
    : ""
  if (!hostname.endsWith(".neon.tech") || hostname !== expectedHostname) {
    throw new Error(
      "QA access integration tests require the explicitly selected Neon development database.",
    )
  }
}

if (databaseIntegrationEnabled) {
  assertQaAccessAcceptanceDatabase()
}

export const describeWithQaAccessDatabase =
  databaseUrl && databaseIntegrationEnabled ? describe : describe.skip
