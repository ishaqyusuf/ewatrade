import { expect, test } from "bun:test"
import { accountPrivacyMembershipResumption } from "./account-privacy-membership-resumption"

const now = new Date("2026-10-21T09:00:00Z")
const approval = {
  requestId: "controlled-case",
  approvedAt: "2026-10-21T08:59:00Z",
  expiresAt: "2026-10-21T09:30:00Z",
  approvalReference: "synthetic-owner-approval",
}
const environment = {
  APP_ENV: "preview",
  ACCOUNT_PRIVACY_PROCESSING_ENABLED: "true",
  ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED: "true",
  ACCOUNT_PRIVACY_MEMBERSHIP_RESUMPTION_JSON: JSON.stringify(approval),
}
const state = {
  requestId: approval.requestId,
  status: "PROCESSING",
  accessStatus: "REVOKED",
  nextStep: "REVOKE_MEMBERSHIPS",
}
test("resumption authority is one bounded Preview case and never a previous-outcome assertion", () => {
  const proof = accountPrivacyMembershipResumption(state, environment, now)
  expect(proof?.requestId).toBe(state.requestId)
  expect(proof?.environment).toBe("preview")
  expect(proof?.expectedStep).toBe("REVOKE_MEMBERSHIPS")
  expect(proof).not.toHaveProperty("previousOutcome")
  for (const changed of [
    { APP_ENV: "production" },
    { APP_ENV: undefined },
    { ACCOUNT_PRIVACY_PROCESSING_ENABLED: "false" },
    { ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED: "false" },
    { ACCOUNT_PRIVACY_MEMBERSHIP_RESUMPTION_JSON: "{}" },
    { ACCOUNT_PRIVACY_MEMBERSHIP_RESUMPTION_JSON: "invalid" },
  ])
    expect(
      accountPrivacyMembershipResumption(
        state,
        { ...environment, ...changed },
        now,
      ),
    ).toBeNull()
})
test("mismatched, stale, future, overlong and non-membership approvals fail closed", () => {
  for (const changed of [
    { requestId: "other-case" },
    { status: "UNDER_REVIEW" },
    { status: "COMPLETED" },
    { accessStatus: "PENDING" },
    ...[
      "REVOKE_ACCESS",
      "ERASE_PRIVATE_ASSISTANT",
      "REVIEW_EXTERNAL_PROCESSORS",
      "DELIVER_OUTCOME",
      "COMPLETE",
    ].map((nextStep) => ({ nextStep })),
  ])
    expect(
      accountPrivacyMembershipResumption(
        { ...state, ...changed },
        environment,
        now,
      ),
    ).toBeNull()
  for (const changed of [
    { requestId: "other-case" },
    { approvedAt: "2026-10-21T09:01:00Z" },
    { expiresAt: now.toISOString() },
    { expiresAt: "2026-10-21T10:00:01Z" },
    { approvalReference: "" },
    { unexpected: true },
  ])
    expect(
      accountPrivacyMembershipResumption(
        state,
        {
          ...environment,
          ACCOUNT_PRIVACY_MEMBERSHIP_RESUMPTION_JSON: JSON.stringify({
            ...approval,
            ...changed,
          }),
        },
        now,
      ),
    ).toBeNull()
})
