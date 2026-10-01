import { expect, test } from "bun:test"
import { isPlayRefundReviewSubmissionEnabled } from "./play-refund-review-submission-gate"

const base = {
  PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
  PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "approved-policy-v1",
}

test("Production response requires a separate operator switch and exact release profile", () => {
  const production = {
    ...base,
    STORE_BILLING_ENVIRONMENT: "production",
    APP_ENV: "production",
    DEV_PROFILE: "prod",
    PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED: "true",
  }
  expect(isPlayRefundReviewSubmissionEnabled(production)).toBe(true)
  for (const env of [
    {
      ...production,
      PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED: "false",
    },
    { ...production, PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "false" },
    { ...production, PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "" },
    { ...production, APP_ENV: "preview" },
    { ...production, DEV_PROFILE: "preview" },
    { ...production, STORE_BILLING_ENVIRONMENT: "sandbox" },
  ])
    expect(isPlayRefundReviewSubmissionEnabled(env)).toBe(false)
})

test("the existing nonproduction sandbox path stays available under its switch", () => {
  for (const appEnv of ["local", "dev", "preview"])
    expect(
      isPlayRefundReviewSubmissionEnabled({
        ...base,
        APP_ENV: appEnv,
        STORE_BILLING_ENVIRONMENT: "sandbox",
      }),
    ).toBe(true)
  expect(isPlayRefundReviewSubmissionEnabled({ ...base })).toBe(false)
})
