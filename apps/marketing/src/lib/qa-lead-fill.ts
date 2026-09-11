import {
  createQaFixtureContext,
  createQaFixtureIdentity,
} from "@ewatrade/utils/qa-fixtures"

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
  return {
    companyName: "QA Test Merchant",
    email: identity.email,
    fullName: identity.fullName,
    message: identity.note,
    phone: identity.phone,
    roleTitle: "QA Tester",
  }
}
