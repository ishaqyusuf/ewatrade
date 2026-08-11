import { createHmac } from "node:crypto"

const DEVELOPMENT_ACTION_CAPABILITY_SECRET =
  "ewatrade-development-service-commerce-customer-action-v1"

export const SERVICE_COMMERCE_CUSTOMER_ACTION_TEMPLATE_KEY =
  "ewatrade_customer_actions_available"

function capabilitySecret() {
  const configured = process.env.SERVICE_COMMERCE_ACTION_SECRET?.trim()
  if (configured) return configured
  if (
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "production"
  ) {
    throw new Error(
      "SERVICE_COMMERCE_ACTION_SECRET must be configured in production.",
    )
  }
  return DEVELOPMENT_ACTION_CAPABILITY_SECRET
}

export function issueServiceCommerceCustomerActionToken(input: {
  clientCapabilityId: string
  storeId: string
  tenantId: string
}) {
  const payload = JSON.stringify({ ...input, version: 1 })
  const signature = createHmac("sha256", capabilitySecret())
    .update(payload)
    .digest("base64url")
  return `sca1.${signature}`
}
