import { createHmac } from "node:crypto"

import type { IssueServiceCommerceBookingCapabilityToken } from "@ewatrade/db/queries"

const DEVELOPMENT_BOOKING_CAPABILITY_SECRET =
  "ewatrade-development-service-commerce-booking-capability-v1"

function capabilitySecret() {
  const configured =
    process.env.SERVICE_COMMERCE_BOOKING_CAPABILITY_SECRET?.trim()
  if (configured) return configured

  if (
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "production"
  ) {
    throw new Error(
      "SERVICE_COMMERCE_BOOKING_CAPABILITY_SECRET must be configured in production.",
    )
  }

  return DEVELOPMENT_BOOKING_CAPABILITY_SECRET
}

/**
 * Issues an opaque, deterministic token. Persistence stores only its SHA-256
 * digest, so neither callers nor public routes need authority-bearing scope.
 */
export const issueServiceCommerceBookingCapabilityToken: IssueServiceCommerceBookingCapabilityToken =
  (input) => {
    const payload = JSON.stringify({
      clientOperationId: input.clientOperationId,
      purpose: input.purpose,
      storeId: input.storeId,
      tenantId: input.tenantId,
      version: 1,
    })
    const signature = createHmac("sha256", capabilitySecret())
      .update(payload)
      .digest("base64url")

    return `scb1.${signature}`
  }
