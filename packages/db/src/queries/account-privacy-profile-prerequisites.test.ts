import { expect, test } from "bun:test"
import { assessAccountPrivacyProfilePrerequisites } from "./account-privacy-profile-prerequisites"

const verifiedAt = new Date("2026-09-28T08:00:00.000Z")
const now = new Date("2026-09-28T09:00:00.000Z")
const domains = [
  ["IDENTITY_ACCESS", "ACCESS_REVOKED"],
  ["MEMBERSHIP", "ACCESS_REVOKED"],
  ["CONVERSATIONS", "NOT_APPLICABLE"],
  ["PRESCRIPTIONS", "NOT_APPLICABLE"],
  ["COMMERCIAL_RECORDS", "NOT_APPLICABLE"],
  ["SOFTWARE_SUBSCRIPTIONS", "NOT_APPLICABLE"],
  ["EXTERNAL_PROCESSORS", "RETENTION_APPROVED"],
] as const

function input() {
  const outcomes: Array<{
    domain: string
    disposition: string
    userId: string
    policyVersion: string
    processor: string
    evidenceDigest: string
    processedAt: Date
    nextReviewAt: Date | null
  }> = domains.map(([domain, disposition]) => ({
    domain,
    disposition,
    userId: "user-1",
    policyVersion: "policy-1",
    processor: "test-processor",
    evidenceDigest: "a".repeat(64),
    processedAt: new Date("2026-09-28T08:30:00.000Z"),
    nextReviewAt:
      disposition === "RETENTION_APPROVED"
        ? new Date("2026-10-28T00:00:00.000Z")
        : null,
  }))
  return {
    requestKey: "account-deletion:user-1",
    requestUserId: "user-1",
    verifiedSubjectUserId: "user-1",
    verifiedAt,
    contactEmail: "member@example.test",
    status: "PROCESSING",
    currentUser: { email: "Member@Example.Test", emailVerified: true },
    accessRevocation: { status: "REVOKED", userId: "user-1" },
    profileUserExists: true,
    legalAcceptanceCount: 0,
    outcomes,
    approvedPolicyVersion: "policy-1",
    now,
  }
}

test("profile preflight passes only after every prior policy-bound outcome", () => {
  expect(assessAccountPrivacyProfilePrerequisites(input())).toEqual({
    prerequisitesSatisfied: true,
    blockers: [],
    missingDomains: [],
  })
  const incomplete = input()
  incomplete.outcomes.pop()
  expect(assessAccountPrivacyProfilePrerequisites(incomplete)).toMatchObject({
    prerequisitesSatisfied: false,
    missingDomains: ["EXTERNAL_PROCESSORS"],
  })
})

test.each([
  ["missing policy", { approvedPolicyVersion: "" }, "POLICY_NOT_APPROVED"],
  [
    "wrong account key",
    { requestKey: "external-deletion:x" },
    "IDENTITY_REVIEW_REQUIRED",
  ],
  [
    "different subject",
    { verifiedSubjectUserId: "user-2" },
    "IDENTITY_REVIEW_REQUIRED",
  ],
  [
    "unverified contact",
    { currentUser: { email: "member@example.test", emailVerified: false } },
    "IDENTITY_REVIEW_REQUIRED",
  ],
  [
    "different contact",
    { contactEmail: "other@example.test" },
    "IDENTITY_REVIEW_REQUIRED",
  ],
  [
    "revocation pending",
    { accessRevocation: { status: "PENDING", userId: "user-1" } },
    "ACCESS_REVOCATION_REQUIRED",
  ],
  ["missing User", { profileUserExists: false }, "SUBJECT_USER_MISSING"],
  [
    "unresolved legal-acceptance history",
    { legalAcceptanceCount: 1 },
    "LEGAL_ACCEPTANCE_DISPOSITION_REQUIRED",
  ],
  ["wrong status", { status: "RECEIVED" }, "REQUEST_NOT_PROCESSING"],
] as const)("profile preflight refuses %s", (_label, override, expected) => {
  const assessment = assessAccountPrivacyProfilePrerequisites({
    ...input(),
    ...override,
  })
  expect(assessment.prerequisitesSatisfied).toBe(false)
  expect(assessment.blockers).toContain(expected)
})

test("profile preflight rejects stale, mismatched and implausible prior outcomes", () => {
  const state = input()
  const at = (index: number) => {
    const row = state.outcomes[index]
    if (!row) throw new Error("Fixture outcome missing")
    return row
  }
  at(0).userId = "other-user"
  at(1).policyVersion = "other-policy"
  at(2).processedAt = new Date("2026-09-28T07:59:59.000Z")
  at(3).disposition = "NOTICE_DELIVERED"
  at(4).processedAt = new Date("2026-09-28T09:00:01.000Z")
  at(5).evidenceDigest = "weak"
  at(6).nextReviewAt = now
  expect(assessAccountPrivacyProfilePrerequisites(state).blockers).toEqual([
    "INVALID_PRIOR_OUTCOME:IDENTITY_ACCESS",
    "INVALID_PRIOR_OUTCOME:MEMBERSHIP",
    "INVALID_PRIOR_OUTCOME:CONVERSATIONS",
    "INVALID_PRIOR_OUTCOME:PRESCRIPTIONS",
    "INVALID_PRIOR_OUTCOME:COMMERCIAL_RECORDS",
    "INVALID_PRIOR_OUTCOME:SOFTWARE_SUBSCRIPTIONS",
    "INVALID_PRIOR_OUTCOME:EXTERNAL_PROCESSORS",
  ])
})

test("a preexisting profile outcome prevents a new first-pass processor claim", () => {
  const state = input()
  state.outcomes.push({
    domain: "ACCOUNT_PROFILE",
    disposition: "ANONYMIZATION_CONFIRMED",
    userId: "user-1",
    policyVersion: "policy-1",
    processor: "test-processor",
    evidenceDigest: "a".repeat(64),
    processedAt: now,
    nextReviewAt: null,
  })
  expect(assessAccountPrivacyProfilePrerequisites(state).blockers).toContain(
    "PROFILE_OUTCOME_ALREADY_RECORDED",
  )
})
