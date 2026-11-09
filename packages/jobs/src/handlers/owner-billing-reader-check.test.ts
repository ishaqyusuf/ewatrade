import { expect, test } from "bun:test"
import {
  ownerBillingReaderRequest,
  runOwnerBillingReaderCheck,
} from "./owner-billing-reader-check"

const env = {
  APP_ENV: "production",
  DEV_PROFILE: "production",
  OWNER_BILLING_ENABLED: "true",
  STORE_BILLING_ENABLED: "true",
  STORE_BILLING_ENVIRONMENT: "production",
  APP_STORE_REVIEW_SANDBOX_ENABLED: "true",
  APP_STORE_REVIEW_OWNER_IDS: '["reviewer_owner"]',
}
const request = { ownerUserId: "reviewer_owner", tenantId: "existing_business" }

test("refuses Preview and missing reader opt-ins before admitting any target", () => {
  for (const patch of [
    { APP_ENV: "preview" },
    { DEV_PROFILE: "preview" },
    { OWNER_BILLING_ENABLED: "false" },
    { STORE_BILLING_ENABLED: "false" },
    { STORE_BILLING_ENVIRONMENT: "sandbox" },
    { APP_STORE_REVIEW_SANDBOX_ENABLED: "false" },
    { APP_STORE_REVIEW_OWNER_IDS: "[]" },
  ])
    expect(ownerBillingReaderRequest(request, { ...env, ...patch })).toBeNull()
})

test("admits only the existing exact reviewer and identifier-only payload", () => {
  expect(ownerBillingReaderRequest(request, env)).toEqual(request)
  for (const payload of [
    null,
    [],
    {},
    { ...request, ownerUserId: "ordinary_owner" },
    { ...request, tenantId: "invalid/target" },
    { ...request, tenantId: "x" },
    { ...request, planId: "pro" },
    { ...request, dryRun: false },
  ])
    expect(() => ownerBillingReaderRequest(payload, env)).toThrow(
      "Billing reader check scope refused.",
    )
  expect(() =>
    ownerBillingReaderRequest(request, {
      ...env,
      APP_STORE_REVIEW_OWNER_IDS: '["reviewer_owner","another_reviewer"]',
    }),
  ).toThrow("Billing reader check scope refused.")
})

test("disabled execution returns before importing the database client", async () => {
  const original = process.env.APP_STORE_REVIEW_SANDBOX_ENABLED
  process.env.APP_STORE_REVIEW_SANDBOX_ENABLED = "false"
  try {
    expect(await runOwnerBillingReaderCheck(request)).toEqual({
      status: "disabled",
      readOnly: true,
    })
  } finally {
    if (original === undefined)
      Reflect.deleteProperty(process.env, "APP_STORE_REVIEW_SANDBOX_ENABLED")
    else process.env.APP_STORE_REVIEW_SANDBOX_ENABLED = original
  }
})
