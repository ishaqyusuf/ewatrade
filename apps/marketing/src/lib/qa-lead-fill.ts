import {
  createQaFixtureContext,
  createQaFixtureIdentity,
} from "@ewatrade/utils/qa-fixtures"
import { createReadableQaEmail } from "./qa-readable-email"
import { createQaSignupPhone } from "./qa-signup-phone"

export function createLeadDraft(input: {
  domain: string
  testerIdentity: string
}) {
  const context = createQaFixtureContext({
    currencyCode: "NGN",
    domain: input.domain,
    invocationId: crypto.randomUUID(),
    seed: input.testerIdentity,
    storeId: "marketing",
    tenantId: "marketing",
    timezone: "Africa/Lagos",
  })
  const identity = createQaFixtureIdentity(context, {
    formId: "marketing.lead",
  })
  const phone = createQaSignupPhone(identity.phone)
  return {
    countryCode: phone.countryCode,
    businessSize: "2_to_10",
    recordSystem: "spreadsheets",
    launchTimeline: "as_soon_as_possible",
    setupNeeds: ["catalog", "inventory", "sales"],
    companyName: "QA Test Merchant",
    email: createReadableQaEmail(context, identity),
    fullName: identity.fullName,
    message: identity.note,
    phone: phone.phone,
    roleTitle: "QA Tester",
  }
}
