/** Internal policy calculation only. Callers must resolve every input from
 * current canonical server records; this result is not a client-supplied permit. */
type AgeBand = "UNDECLARED" | "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"
type Subject = { kind: "ACCOUNT" | "GUEST" | "STOREFRONT"; id: string }
type Operation = "TEXT_SAFETY" | "IMAGE_SAFETY"

type AgeAssurance = {
  subject: Subject
  status: "PENDING" | "APPROVED" | "REJECTED"
  minimumAge: number
  method: string
  evidenceDigest: string
  verifiedAt: number
  expiresAt: number
  revokedAt: number | null
}

export type SafetyRegionalRule = {
  id: string
  jurisdiction: string
  status: "DRAFT" | "APPROVED" | "RETIRED"
  expiresAt: number
  providerId: string
  operations: readonly Operation[]
  subjectNoticeHash: string
  guardianNoticeHash: string
  adultAge: number
  digitalConsentAge: number
  minimumGuardianAge: number
  guardianVerificationMethods: readonly string[]
  ageAssuranceMethods: readonly string[]
}

export type SafetyProcessingEvidence = {
  now: number
  operation: Operation
  subject: Subject & {
    active: boolean
    ageBand: AgeBand
    acceptedNoticeHashes: readonly string[]
    ageAssurance: AgeAssurance | null
  }
  /** Complete server-resolved set, including stricter applicable subregions. */
  jurisdictions: readonly string[]
  rules: readonly SafetyRegionalRule[]
  provider: { id: string; endpoint: string; model: string }
  controls: {
    status: "PENDING" | "ACCEPTED" | "REVOKED"
    providerId: string
    endpoint: string
    model: string
    evidenceDigest: string
    expiresAt: number
    zeroRetentionConfirmed: boolean
  } | null
  consent: {
    subject: Subject
    status: "PENDING" | "APPROVED" | "DECLINED" | "REVOKED"
    operations: readonly Operation[]
    noticeHash: string
    grantedAt: number
    expiresAt: number
    revokedAt: number | null
    guardian: {
      id: string
      active: boolean
      ageBand: AgeBand
      contactVerified: boolean
    }
    verification: {
      subject: Subject
      guardianId: string
      status: "PENDING" | "APPROVED" | "REJECTED"
      method: string
      evidenceDigest: string
      minimumGuardianAge: number
      verifiedAt: number
      expiresAt: number
      revokedAt: number | null
    }
  } | null
}

type Refusal =
  | "INVALID_EVIDENCE"
  | "AGE_DECLARATION_REQUIRED"
  | "REGION_UNRESOLVED"
  | "REGIONAL_POLICY_REQUIRED"
  | "NOTICE_ACCEPTANCE_REQUIRED"
  | "AGE_ASSURANCE_REQUIRED"
  | "PROVIDER_CONTROLS_REQUIRED"
  | "GUARDIAN_CONSENT_REQUIRED"
  | "GUARDIAN_VERIFICATION_REQUIRED"

export type SafetyProcessingDecision =
  | { allowed: false; reason: Refusal }
  | {
      allowed: true
      ruleIds: string[]
      guardianRequired: boolean
      zeroRetentionRequired: boolean
    }

const digest = (value: string) => /^[a-f0-9]{64}$/.test(value)
const sameSubject = (a: Subject, b: Subject) =>
  a.kind === b.kind && a.id === b.id
const validTime = (value: number) => Number.isSafeInteger(value) && value >= 0
const current = (expiresAt: number, now: number) =>
  validTime(expiresAt) && expiresAt > now
const deny = (reason: Refusal): SafetyProcessingDecision => ({
  allowed: false,
  reason,
})

function secureEndpoint(value: string) {
  try {
    const endpoint = new URL(value)
    return (
      endpoint.protocol === "https:" &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.hash
    )
  } catch {
    return false
  }
}

function ageRange(band: AgeBand): [number, number] | null {
  if (band === "AGE_13_TO_15") return [13, 15]
  if (band === "AGE_16_TO_17") return [16, 17]
  if (band === "ADULT") return [18, Number.POSITIVE_INFINITY]
  return null
}

export function evaluateSafetyProcessing(
  input: SafetyProcessingEvidence,
): SafetyProcessingDecision {
  const { now, subject, rules, provider, controls, consent } = input
  if (
    !validTime(now) ||
    !subject.id ||
    !subject.active ||
    !provider.id.trim() ||
    !provider.model.trim() ||
    !secureEndpoint(provider.endpoint)
  )
    return deny("INVALID_EVIDENCE")
  const range = ageRange(subject.ageBand)
  if (!range) return deny("AGE_DECLARATION_REQUIRED")
  const jurisdictions = new Set(input.jurisdictions)
  if (!jurisdictions.size || input.jurisdictions.some((value) => !value.trim()))
    return deny("REGION_UNRESOLVED")
  if (
    rules.length !== jurisdictions.size ||
    new Set(rules.map((rule) => rule.jurisdiction)).size !== rules.length ||
    new Set(rules.map((rule) => rule.id)).size !== rules.length ||
    rules.some(
      (rule) =>
        !jurisdictions.has(rule.jurisdiction) ||
        !rule.id ||
        rule.status !== "APPROVED" ||
        !current(rule.expiresAt, now) ||
        rule.providerId !== provider.id ||
        !rule.operations.includes(input.operation) ||
        !digest(rule.subjectNoticeHash) ||
        !digest(rule.guardianNoticeHash) ||
        !Number.isInteger(rule.adultAge) ||
        rule.adultAge < 18 ||
        rule.adultAge > 21 ||
        !Number.isInteger(rule.digitalConsentAge) ||
        rule.digitalConsentAge < 13 ||
        rule.digitalConsentAge > rule.adultAge ||
        !Number.isInteger(rule.minimumGuardianAge) ||
        rule.minimumGuardianAge < 18 ||
        rule.minimumGuardianAge > 21 ||
        !rule.guardianVerificationMethods.length ||
        !rule.ageAssuranceMethods.length ||
        rule.guardianVerificationMethods.some((method) => !method.trim()) ||
        rule.ageAssuranceMethods.some((method) => !method.trim()),
    )
  )
    return deny("REGIONAL_POLICY_REQUIRED")
  if (
    rules.some(
      (rule) => !subject.acceptedNoticeHashes.includes(rule.subjectNoticeHash),
    )
  )
    return deny("NOTICE_ACCEPTANCE_REQUIRED")

  let minimumAge = range[0]
  const assurance = subject.ageAssurance
  if (assurance) {
    if (
      !sameSubject(assurance.subject, subject) ||
      !digest(assurance.evidenceDigest) ||
      !Number.isInteger(assurance.minimumAge) ||
      assurance.minimumAge < range[0] ||
      assurance.minimumAge > range[1] ||
      assurance.minimumAge > 120
    )
      return deny("INVALID_EVIDENCE")
    if (
      assurance.status === "APPROVED" &&
      assurance.revokedAt === null &&
      validTime(assurance.verifiedAt) &&
      assurance.verifiedAt <= now &&
      current(assurance.expiresAt, now) &&
      rules.every((rule) => rule.ageAssuranceMethods.includes(assurance.method))
    )
      minimumAge = assurance.minimumAge
  }
  if (
    subject.ageBand === "ADULT" &&
    rules.some((rule) => minimumAge < rule.adultAge)
  )
    return deny("AGE_ASSURANCE_REQUIRED")
  const guardianRequired = subject.ageBand !== "ADULT"
  const zeroRetentionRequired = rules.some(
    (rule) => minimumAge < rule.digitalConsentAge,
  )
  if (
    !controls ||
    controls.status !== "ACCEPTED" ||
    controls.providerId !== provider.id ||
    controls.endpoint !== provider.endpoint ||
    controls.model !== provider.model ||
    !digest(controls.evidenceDigest) ||
    !current(controls.expiresAt, now) ||
    (zeroRetentionRequired && !controls.zeroRetentionConfirmed)
  )
    return deny("PROVIDER_CONTROLS_REQUIRED")
  if (!guardianRequired)
    return {
      allowed: true,
      ruleIds: rules.map((rule) => rule.id),
      guardianRequired,
      zeroRetentionRequired,
    }
  if (
    !consent ||
    !sameSubject(consent.subject, subject) ||
    consent.status !== "APPROVED" ||
    consent.revokedAt !== null ||
    !validTime(consent.grantedAt) ||
    consent.grantedAt > now ||
    !current(consent.expiresAt, now) ||
    !consent.operations.includes(input.operation) ||
    rules.some((rule) => consent.noticeHash !== rule.guardianNoticeHash) ||
    !consent.guardian.id ||
    !consent.guardian.active ||
    consent.guardian.ageBand !== "ADULT" ||
    !consent.guardian.contactVerified ||
    (subject.kind === "ACCOUNT" && consent.guardian.id === subject.id)
  )
    return deny("GUARDIAN_CONSENT_REQUIRED")
  const verification = consent.verification
  if (
    verification.status !== "APPROVED" ||
    verification.revokedAt !== null ||
    !sameSubject(verification.subject, subject) ||
    verification.guardianId !== consent.guardian.id ||
    !digest(verification.evidenceDigest) ||
    !validTime(verification.verifiedAt) ||
    verification.verifiedAt > now ||
    !current(verification.expiresAt, now) ||
    !Number.isInteger(verification.minimumGuardianAge) ||
    verification.minimumGuardianAge > 120 ||
    rules.some(
      (rule) =>
        !rule.guardianVerificationMethods.includes(verification.method) ||
        verification.minimumGuardianAge < rule.minimumGuardianAge,
    )
  )
    return deny("GUARDIAN_VERIFICATION_REQUIRED")
  return {
    allowed: true,
    ruleIds: rules.map((rule) => rule.id),
    guardianRequired,
    zeroRetentionRequired,
  }
}
