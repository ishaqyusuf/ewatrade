/** The operator transport is separately enabled for each billing environment. */
export function isPlayRefundReviewSubmissionEnabled(env: NodeJS.ProcessEnv) {
  if (
    env.PLAY_REFUND_REVIEW_SUBMISSION_ENABLED !== "true" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(
      env.PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION ?? "",
    )
  )
    return false

  if (
    env.STORE_BILLING_ENVIRONMENT === "sandbox" &&
    ["local", "dev", "preview"].includes(env.APP_ENV ?? "")
  )
    return true

  return (
    env.STORE_BILLING_ENVIRONMENT === "production" &&
    env.APP_ENV === "production" &&
    env.DEV_PROFILE === "prod" &&
    env.PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED === "true"
  )
}
