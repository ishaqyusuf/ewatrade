import { expect, test } from "bun:test"
import { createQaFixtureContext } from "@ewatrade/utils/qa-fixtures"
import { z } from "zod"
import { ownerFill } from "./qa-fill-definitions"
import { createLeadDraft } from "./qa-lead-fill"
import { createReadableQaEmail } from "./qa-readable-email"

const context = createQaFixtureContext({
  domain: "ishaq.qa.test",
  invocationId: "fc8abecb-dad4-4cf3-942f-dc83c30d172f",
  currencyCode: "NGN",
  seed: "email-test",
  storeId: "signup",
  tenantId: "signup",
  timezone: "Africa/Lagos",
})

test("readable email follows the fixture name and keeps the authorized QA domain", () => {
  const owner = ownerFill(context, 1)
  expect(owner.email).toMatch(
    new RegExp(
      `^${owner.firstName?.toLowerCase()}[a-z0-9]{3}@ishaq\\.qa\\.test$`,
    ),
  )
  expect(z.email().safeParse(owner.email).success).toBe(true)
  expect(owner).not.toHaveProperty("password")
  expect(owner).not.toHaveProperty("confirmPassword")
})

test("new runs and fill sequences produce different addresses", () => {
  const identity = { firstName: "Ada", lastName: "Eze" }
  const first = createReadableQaEmail(context, identity, 1)
  expect(createReadableQaEmail(context, identity, 2)).not.toBe(first)
  expect(
    createReadableQaEmail(
      { ...context, invocationId: "12345678-0000-0000-0000-123456789abc" },
      identity,
      1,
    ),
  ).not.toBe(first)
  expect(createReadableQaEmail(context, identity, 1)).toBe(first)
})

test("request Quick Fill generates simple names with three randomized alphanumeric characters", () => {
  const emails = new Set<string>()
  for (let index = 0; index < 32; index++) {
    const lead = createLeadDraft({
      domain: "ishaq.qa.test",
      testerIdentity: "email-test",
    })
    const firstName = lead.fullName.split(" ")[0]?.toLowerCase()
    expect(lead.email).toMatch(
      new RegExp(`^${firstName}[a-z0-9]{3}@ishaq\\.qa\\.test$`),
    )
    expect(z.email().safeParse(lead.email).success).toBe(true)
    emails.add(lead.email)
  }
  // A three-character suffix has finite possibilities; repeats are possible.
  expect(emails.size).toBeGreaterThan(1)
})

test("owner Quick Fill preserves the verified early-access address", () => {
  const approvedEmail = "jawdah.verified@ishaq.qa.test"
  expect(ownerFill(context, 1, approvedEmail).email).toBe(approvedEmail)
  expect(ownerFill(context, 2, approvedEmail).email).toBe(approvedEmail)
})
