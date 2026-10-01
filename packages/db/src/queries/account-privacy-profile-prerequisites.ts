import { ACCOUNT_PRIVACY_ALLOWED_DISPOSITIONS } from "./account-privacy-completion"

const PRIOR_DOMAINS = [
  "IDENTITY_ACCESS",
  "MEMBERSHIP",
  "CONVERSATIONS",
  "PRESCRIPTIONS",
  "COMMERCIAL_RECORDS",
  "SOFTWARE_SUBSCRIPTIONS",
  "EXTERNAL_PROCESSORS",
] as const satisfies readonly (keyof typeof ACCOUNT_PRIVACY_ALLOWED_DISPOSITIONS)[]

type PriorDomain = (typeof PRIOR_DOMAINS)[number]

type Outcome = {
  domain: string
  userId: string
  policyVersion: string
  disposition: string
  processor: string
  evidenceDigest: string
  processedAt: Date
  nextReviewAt: Date | null
}

/** Necessary ordering checks only; this never authorizes profile mutation. */
export function assessAccountPrivacyProfilePrerequisites(input: {
  requestKey: string
  requestUserId: string | null
  verifiedSubjectUserId: string | null
  verifiedAt: Date | null
  contactEmail: string | null
  status: string
  currentUser: { email: string; emailVerified: boolean } | null
  accessRevocation: { status: string; userId: string } | null
  profileUserExists: boolean
  legalAcceptanceCount: number
  outcomes: readonly Outcome[]
  approvedPolicyVersion: string | null
  now?: Date
}) {
  const blockers: string[] = []
  const missingDomains: PriorDomain[] = []
  const now = input.now ?? new Date()
  const subjectId = input.verifiedSubjectUserId
  const policyVersion = input.approvedPolicyVersion?.trim()
  if (!policyVersion) blockers.push("POLICY_NOT_APPROVED")
  if (
    !subjectId ||
    !input.verifiedAt ||
    input.requestUserId !== subjectId ||
    input.requestKey !== `account-deletion:${subjectId}` ||
    !input.currentUser?.emailVerified ||
    !input.contactEmail ||
    input.currentUser.email.trim().toLowerCase() !==
      input.contactEmail.trim().toLowerCase()
  )
    blockers.push("IDENTITY_REVIEW_REQUIRED")
  if (input.status !== "PROCESSING") blockers.push("REQUEST_NOT_PROCESSING")
  if (!input.profileUserExists) blockers.push("SUBJECT_USER_MISSING")
  if (input.legalAcceptanceCount > 0)
    blockers.push("LEGAL_ACCEPTANCE_DISPOSITION_REQUIRED")
  if (
    !subjectId ||
    input.accessRevocation?.status !== "REVOKED" ||
    input.accessRevocation.userId !== subjectId
  )
    blockers.push("ACCESS_REVOCATION_REQUIRED")
  if (input.outcomes.some((outcome) => outcome.domain === "ACCOUNT_PROFILE"))
    blockers.push("PROFILE_OUTCOME_ALREADY_RECORDED")

  for (const domain of PRIOR_DOMAINS) {
    const outcome = input.outcomes.find((item) => item.domain === domain)
    if (!outcome) {
      missingDomains.push(domain)
      continue
    }
    if (
      !subjectId ||
      !policyVersion ||
      !input.verifiedAt ||
      outcome.userId !== subjectId ||
      outcome.policyVersion !== policyVersion ||
      !outcome.processor.trim() ||
      !/^[a-f0-9]{64}$/.test(outcome.evidenceDigest) ||
      !(
        ACCOUNT_PRIVACY_ALLOWED_DISPOSITIONS[domain] as readonly string[]
      ).includes(outcome.disposition) ||
      outcome.processedAt < input.verifiedAt ||
      outcome.processedAt > now ||
      (outcome.disposition === "RETENTION_APPROVED" &&
        (!outcome.nextReviewAt || outcome.nextReviewAt <= now))
    )
      blockers.push(`INVALID_PRIOR_OUTCOME:${domain}`)
  }
  return {
    prerequisitesSatisfied:
      blockers.length === 0 && missingDomains.length === 0,
    blockers,
    missingDomains,
  }
}
