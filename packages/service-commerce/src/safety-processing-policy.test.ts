import { expect, test } from "bun:test"
import {
  type SafetyProcessingEvidence,
  evaluateSafetyProcessing,
} from "./safety-processing-policy"

/** Synthetic records only: not a regional legal table or verified live grant. */
function evidence(): SafetyProcessingEvidence {
  const now = 1_800_000_000_000
  const subject = { kind: "ACCOUNT" as const, id: "teen-fixture" }
  return {
    now,
    operation: "TEXT_SAFETY",
    subject: {
      ...subject,
      active: true,
      ageBand: "AGE_13_TO_15",
      acceptedNoticeHashes: ["a".repeat(64)],
      ageAssurance: null,
    },
    jurisdictions: ["EXAMPLE-A"],
    rules: [
      {
        id: "synthetic-rule-v1",
        jurisdiction: "EXAMPLE-A",
        status: "APPROVED",
        expiresAt: now + 10_000,
        providerId: "openai-moderation",
        operations: ["TEXT_SAFETY", "IMAGE_SAFETY"],
        subjectNoticeHash: "a".repeat(64),
        guardianNoticeHash: "b".repeat(64),
        adultAge: 18,
        digitalConsentAge: 16,
        minimumGuardianAge: 18,
        guardianVerificationMethods: ["REVIEWED_PARENTAL_RESPONSIBILITY"],
        ageAssuranceMethods: ["APPROVED_MINIMUM_AGE_ATTRIBUTE"],
      },
    ],
    provider: {
      id: "openai-moderation",
      endpoint: "https://api.openai.com/v1/moderations",
      model: "pinned-model-fixture",
    },
    controls: {
      status: "ACCEPTED",
      providerId: "openai-moderation",
      endpoint: "https://api.openai.com/v1/moderations",
      model: "pinned-model-fixture",
      evidenceDigest: "c".repeat(64),
      expiresAt: now + 10_000,
      zeroRetentionConfirmed: true,
    },
    consent: {
      subject: { ...subject },
      status: "APPROVED",
      operations: ["TEXT_SAFETY"],
      noticeHash: "b".repeat(64),
      grantedAt: now - 100,
      expiresAt: now + 5_000,
      revokedAt: null,
      guardian: {
        id: "guardian-fixture",
        active: true,
        ageBand: "ADULT",
        contactVerified: true,
      },
      verification: {
        subject: { ...subject },
        guardianId: "guardian-fixture",
        status: "APPROVED",
        method: "REVIEWED_PARENTAL_RESPONSIBILITY",
        evidenceDigest: "d".repeat(64),
        minimumGuardianAge: 18,
        verifiedAt: now - 50,
        expiresAt: now + 5_000,
        revokedAt: null,
      },
    },
  }
}

function consent(input: SafetyProcessingEvidence) {
  if (!input.consent) throw new Error("Expected synthetic consent fixture")
  return input.consent
}
function rule(input: SafetyProcessingEvidence) {
  const found = input.rules[0]
  if (!found) throw new Error("Expected synthetic regional rule")
  return found
}
function controls(input: SafetyProcessingEvidence) {
  if (!input.controls) throw new Error("Expected synthetic provider controls")
  return input.controls
}

test("a teen requires independently accepted consent, regional and provider evidence", () => {
  expect(evaluateSafetyProcessing(evidence())).toEqual({
    allowed: true,
    ruleIds: ["synthetic-rule-v1"],
    guardianRequired: true,
    zeroRetentionRequired: true,
  })
  const input = evidence()
  input.consent = null
  expect(evaluateSafetyProcessing(input)).toEqual({
    allowed: false,
    reason: "GUARDIAN_CONSENT_REQUIRED",
  })
})

test("16–17 still needs guardian consent even above a digital-consent threshold", () => {
  const input = evidence()
  input.subject.ageBand = "AGE_16_TO_17"
  controls(input).zeroRetentionConfirmed = false
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: true,
    guardianRequired: true,
    zeroRetentionRequired: false,
  })
  input.consent = null
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "GUARDIAN_CONSENT_REQUIRED",
  })
})

test("an adult retains ordinary screening without a guardian but not without provider controls", () => {
  const input = evidence()
  input.subject.ageBand = "ADULT"
  input.consent = null
  controls(input).zeroRetentionConfirmed = false
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: true,
    guardianRequired: false,
  })
  input.controls = null
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "PROVIDER_CONTROLS_REQUIRED",
  })
})

test("unknown age, missing identity and inactive subjects cannot calculate an allow", () => {
  const input = evidence()
  input.subject.ageBand = "UNDECLARED"
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "AGE_DECLARATION_REQUIRED",
  })
  input.subject.id = ""
  expect(evaluateSafetyProcessing(input)).toMatchObject({ allowed: false })
  const inactive = evidence()
  inactive.subject.active = false
  expect(evaluateSafetyProcessing(inactive)).toMatchObject({ allowed: false })
})

test("an unknown jurisdiction or omitted applicable subregion is not an allow", () => {
  const input = evidence()
  input.jurisdictions = []
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "REGION_UNRESOLVED",
  })
  input.jurisdictions = ["EXAMPLE-A", "EXAMPLE-B"]
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "REGIONAL_POLICY_REQUIRED",
  })
})

test("all applicable rules apply; duplicate rules cannot fill a missing jurisdiction", () => {
  const input = evidence()
  input.jurisdictions = ["EXAMPLE-A", "EXAMPLE-B"]
  input.rules = [
    rule(input),
    {
      ...rule(input),
      id: "rule-b",
      jurisdiction: "EXAMPLE-B",
      digitalConsentAge: 18,
    },
  ]
  input.subject.ageBand = "AGE_16_TO_17"
  controls(input).zeroRetentionConfirmed = false
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "PROVIDER_CONTROLS_REQUIRED",
  })
  input.rules = [rule(input), { ...rule(input), id: "duplicate-jurisdiction" }]
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "REGIONAL_POLICY_REQUIRED",
  })
})

test("draft, expired, mismatched and malformed regional rules fail closed", () => {
  const mutations: Array<(value: SafetyProcessingEvidence) => void> = [
    (v) => {
      rule(v).status = "DRAFT"
    },
    (v) => {
      rule(v).status = "RETIRED"
    },
    (v) => {
      rule(v).expiresAt = v.now
    },
    (v) => {
      rule(v).providerId = "other-provider"
    },
    (v) => {
      rule(v).operations = ["IMAGE_SAFETY"]
    },
    (v) => {
      rule(v).digitalConsentAge = 12
    },
    (v) => {
      rule(v).subjectNoticeHash = "not-a-digest"
    },
  ]
  for (const mutate of mutations) {
    const input = evidence()
    mutate(input)
    expect(evaluateSafetyProcessing(input)).toMatchObject({
      allowed: false,
      reason: "REGIONAL_POLICY_REQUIRED",
    })
  }
})

test("current subject notice acceptance and exact guardian purpose are separate", () => {
  const input = evidence()
  input.subject.acceptedNoticeHashes = ["b".repeat(64)]
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "NOTICE_ACCEPTANCE_REQUIRED",
  })
  input.subject.acceptedNoticeHashes = ["a".repeat(64)]
  consent(input).noticeHash = "a".repeat(64)
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "GUARDIAN_CONSENT_REQUIRED",
  })
  consent(input).noticeHash = "b".repeat(64)
  input.operation = "IMAGE_SAFETY"
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "GUARDIAN_CONSENT_REQUIRED",
  })
})

test("a coarse band crossing the threshold requires retention proof unless valid age assurance resolves it", () => {
  const input = evidence()
  rule(input).digitalConsentAge = 14
  controls(input).zeroRetentionConfirmed = false
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "PROVIDER_CONTROLS_REQUIRED",
  })
  input.subject.ageAssurance = {
    subject: { kind: "ACCOUNT", id: input.subject.id },
    status: "APPROVED",
    minimumAge: 15,
    method: "APPROVED_MINIMUM_AGE_ATTRIBUTE",
    evidenceDigest: "e".repeat(64),
    verifiedAt: input.now - 10,
    expiresAt: input.now + 500,
    revokedAt: null,
  }
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: true,
    zeroRetentionRequired: false,
  })
  input.subject.ageAssurance.status = "PENDING"
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "PROVIDER_CONTROLS_REQUIRED",
  })
  input.subject.ageAssurance.status = "APPROVED"
  input.subject.ageAssurance.revokedAt = input.now
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "PROVIDER_CONTROLS_REQUIRED",
  })
})

test("declared adulthood does not assert a higher regional age without evidence", () => {
  const input = evidence()
  input.subject.ageBand = "ADULT"
  rule(input).adultAge = 19
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "AGE_ASSURANCE_REQUIRED",
  })
})

test("provider-control evidence is pinned to route, model, provider, time and review", () => {
  const mutations: Array<(value: SafetyProcessingEvidence) => void> = [
    (v) => {
      controls(v).status = "PENDING"
    },
    (v) => {
      controls(v).status = "REVOKED"
    },
    (v) => {
      controls(v).providerId = "other-provider"
    },
    (v) => {
      controls(v).endpoint = "https://example.invalid/generation"
    },
    (v) => {
      controls(v).model = "different-model"
    },
    (v) => {
      controls(v).expiresAt = v.now
    },
    (v) => {
      controls(v).evidenceDigest = "a-label-is-not-evidence"
    },
    (v) => {
      controls(v).zeroRetentionConfirmed = false
    },
  ]
  for (const mutate of mutations) {
    const input = evidence()
    mutate(input)
    expect(evaluateSafetyProcessing(input)).toMatchObject({
      allowed: false,
      reason: "PROVIDER_CONTROLS_REQUIRED",
    })
  }
})

test("current guardian identity and consent must match the exact subject", () => {
  const mutations: Array<(value: SafetyProcessingEvidence) => void> = [
    (v) => {
      consent(v).subject = { kind: "GUEST", id: v.subject.id }
    },
    (v) => {
      consent(v).subject = { kind: "ACCOUNT", id: "other-teen" }
    },
    (v) => {
      consent(v).guardian.id = v.subject.id
    },
    (v) => {
      consent(v).guardian.active = false
    },
    (v) => {
      consent(v).guardian.ageBand = "AGE_16_TO_17"
    },
    (v) => {
      consent(v).guardian.contactVerified = false
    },
    (v) => {
      consent(v).status = "PENDING"
    },
    (v) => {
      consent(v).revokedAt = v.now
    },
    (v) => {
      consent(v).expiresAt = v.now
    },
    (v) => {
      consent(v).grantedAt = v.now + 1
    },
  ]
  for (const mutate of mutations) {
    const input = evidence()
    mutate(input)
    expect(evaluateSafetyProcessing(input)).toMatchObject({
      allowed: false,
      reason: "GUARDIAN_CONSENT_REQUIRED",
    })
  }
})

test("verified contact and attestation alone are not reviewed parental-responsibility proof", () => {
  const mutations: Array<(value: SafetyProcessingEvidence) => void> = [
    (v) => {
      consent(v).verification.status = "PENDING"
    },
    (v) => {
      consent(v).verification.method = "EMAIL_ONLY"
    },
    (v) => {
      consent(v).verification.subject.id = "other-teen"
    },
    (v) => {
      consent(v).verification.guardianId = "other-guardian"
    },
    (v) => {
      consent(v).verification.expiresAt = v.now
    },
    (v) => {
      consent(v).verification.revokedAt = v.now
    },
    (v) => {
      consent(v).verification.verifiedAt = v.now + 1
    },
    (v) => {
      consent(v).verification.minimumGuardianAge = 17
    },
  ]
  for (const mutate of mutations) {
    const input = evidence()
    mutate(input)
    expect(evaluateSafetyProcessing(input)).toMatchObject({
      allowed: false,
      reason: "GUARDIAN_VERIFICATION_REQUIRED",
    })
  }
})

test("there is no cached approval after revocation or a stricter rule change", () => {
  const input = evidence()
  expect(evaluateSafetyProcessing(input)).toMatchObject({ allowed: true })
  consent(input).revokedAt = input.now
  expect(evaluateSafetyProcessing(input)).toMatchObject({ allowed: false })
  consent(input).revokedAt = null
  rule(input).guardianNoticeHash = "f".repeat(64)
  expect(evaluateSafetyProcessing(input)).toMatchObject({ allowed: false })
})

test("matching records cannot authorize a plaintext or credential-bearing endpoint", () => {
  for (const endpoint of [
    "http://example.invalid/moderations",
    "https://secret@example.invalid/moderations",
    "not-a-url",
  ]) {
    const input = evidence()
    input.provider.endpoint = endpoint
    controls(input).endpoint = endpoint
    expect(evaluateSafetyProcessing(input)).toMatchObject({
      allowed: false,
      reason: "INVALID_EVIDENCE",
    })
  }
})

test("guest and Storefront identities use their own exact reviewed subject binding", () => {
  for (const kind of ["GUEST", "STOREFRONT"] as const) {
    const input = evidence()
    input.subject.kind = kind
    consent(input).subject.kind = kind
    consent(input).verification.subject.kind = kind
    expect(evaluateSafetyProcessing(input)).toMatchObject({
      allowed: true,
      guardianRequired: true,
    })
    consent(input).verification.subject.kind = "ACCOUNT"
    expect(evaluateSafetyProcessing(input)).toMatchObject({
      allowed: false,
      reason: "GUARDIAN_VERIFICATION_REQUIRED",
    })
  }
})

test("a clock or proof outside the declared age band cannot elevate admission", () => {
  const invalidClock = evidence()
  invalidClock.now = Number.NaN
  expect(evaluateSafetyProcessing(invalidClock)).toMatchObject({
    allowed: false,
  })
  const input = evidence()
  input.subject.ageAssurance = {
    subject: { kind: "ACCOUNT", id: input.subject.id },
    status: "APPROVED",
    minimumAge: 18,
    method: "APPROVED_MINIMUM_AGE_ATTRIBUTE",
    evidenceDigest: "e".repeat(64),
    verifiedAt: input.now - 10,
    expiresAt: input.now + 500,
    revokedAt: null,
  }
  expect(evaluateSafetyProcessing(input)).toMatchObject({
    allowed: false,
    reason: "INVALID_EVIDENCE",
  })
})
