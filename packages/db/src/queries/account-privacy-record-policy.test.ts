import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  accountPrivacyAccountingExpiry,
  accountPrivacyRecordDecisionDigest,
  accountPrivacyRecordHoldIsActive,
  accountPrivacySharedExpiry,
  addAccountPrivacyCalendarMonths,
  getApprovedAccountPrivacyRecordPolicy,
} from "./account-privacy-record-policy"
const now = new Date("2026-10-12T15:00:00Z")
test("tax/accounting dates use assessment and creation clocks, never deletion time", () => {
  expect(
    accountPrivacyAccountingExpiry({
      sourceCreatedAt: new Date("2026-06-01Z"),
      assessmentYear: 2026,
      now,
    }).toISOString(),
  ).toBe("2033-01-01T00:00:00.000Z")
  expect(
    accountPrivacyAccountingExpiry({
      sourceCreatedAt: new Date("2026-06-01Z"),
      assessmentYear: 2025,
      now,
    }).toISOString(),
  ).toBe("2032-06-01T00:00:00.000Z")
  expect(
    accountPrivacyAccountingExpiry({
      sourceCreatedAt: new Date("2024-02-29Z"),
      assessmentYear: 2023,
      now,
    }).toISOString(),
  ).toBe("2030-02-28T00:00:00.000Z")
  expect(
    accountPrivacyAccountingExpiry({
      sourceCreatedAt: new Date("2026-06-01Z"),
      assessmentYear: 2026,
      now: new Date("2030-06-01Z"),
    }),
  ).toEqual(
    accountPrivacyAccountingExpiry({
      sourceCreatedAt: new Date("2026-06-01Z"),
      assessmentYear: 2026,
      now,
    }),
  )
  expect(() =>
    accountPrivacyAccountingExpiry({
      sourceCreatedAt: new Date("2027-06-01Z"),
      assessmentYear: 2026,
      now,
    }),
  ).toThrow("ASSESSMENT_YEAR_REQUIRED")
  expect(() =>
    accountPrivacyAccountingExpiry({
      sourceCreatedAt: new Date("2026-06-01Z"),
      assessmentYear: 2035,
      now,
    }),
  ).toThrow("ASSESSMENT_YEAR_REQUIRED")
})
test("shared cap is anchored to evidenced closure and preserves a shorter period", () => {
  const input = {
    sourceCreatedAt: new Date("2025-10-01Z"),
    closedAt: new Date("2026-01-31Z"),
    now,
  }
  expect(accountPrivacySharedExpiry(input)).toEqual({
    expiresAt: new Date("2028-01-31Z"),
    reviewDueAt: new Date("2027-01-31Z"),
  })
  expect(
    accountPrivacySharedExpiry({
      ...input,
      earlierExpiresAt: new Date("2026-08-01Z"),
    }),
  ).toEqual({
    expiresAt: new Date("2026-08-01Z"),
    reviewDueAt: new Date("2026-08-01Z"),
  })
  expect(
    accountPrivacySharedExpiry({
      ...input,
      earlierExpiresAt: new Date("2030-08-01Z"),
    }).expiresAt,
  ).toEqual(new Date("2028-01-31Z"))
  expect(() =>
    accountPrivacySharedExpiry({ ...input, closedAt: new Date("2025-01-01Z") }),
  ).toThrow("CLOSURE_EVIDENCE_REQUIRED")
  expect(() =>
    accountPrivacySharedExpiry({ ...input, closedAt: new Date("2027-01-01Z") }),
  ).toThrow("CLOSURE_EVIDENCE_REQUIRED")
  expect(
    addAccountPrivacyCalendarMonths(
      new Date("2024-02-29T12:34:56.123Z"),
      12,
    ).toISOString(),
  ).toBe("2025-02-28T12:34:56.123Z")
})
test("record policy is exact approved source, with valid dates and no extra privileges", () => {
  const raw = JSON.stringify({
    version: "qa-record-v1",
    approvalReference: "synthetic-test-only",
    approvedAt: "2026-10-12T14:00:00Z",
    reviewAt: "2034-01-01T00:00:00Z",
    mode: "MINIMIZE_AND_RETAIN_APPROVED_RECORDS",
  })
  const env = {
    ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION: "qa-record-v1",
    ACCOUNT_PRIVACY_RECORD_POLICY_JSON: raw,
    ACCOUNT_PRIVACY_APPROVED_RECORD_POLICY_SHA256: createHash("sha256")
      .update(raw)
      .digest("hex"),
  }
  expect(getApprovedAccountPrivacyRecordPolicy(env, now)?.version).toBe(
    "qa-record-v1",
  )
  expect(
    getApprovedAccountPrivacyRecordPolicy(
      { ...env, ACCOUNT_PRIVACY_RECORD_POLICY_JSON: `${raw} ` },
      now,
    ),
  ).toBeNull()
  expect(
    getApprovedAccountPrivacyRecordPolicy(env, new Date("2034-01-01Z")),
  ).toBeNull()
  const bad = JSON.stringify({ ...JSON.parse(raw), skipControllerReview: true })
  expect(
    getApprovedAccountPrivacyRecordPolicy(
      {
        ...env,
        ACCOUNT_PRIVACY_RECORD_POLICY_JSON: bad,
        ACCOUNT_PRIVACY_APPROVED_RECORD_POLICY_SHA256: createHash("sha256")
          .update(bad)
          .digest("hex"),
      },
      now,
    ),
  ).toBeNull()
})
test("retention evidence binds statutory dates, actual record scope and holds", () => {
  const row = {
    requestId: "request",
    subjectUserId: "subject",
    tenantId: "tenant",
    recordFamily: "commercialOrder",
    recordId: "order",
    actorField: "createdByUserId",
    category: "ACCOUNTING",
    policyVersion: "v1",
    policyDigest: "a".repeat(64),
    controllerEvidenceDigest: "b".repeat(64),
    sourceEvidenceDigest: "c".repeat(64),
    sourceCreatedAt: new Date("2026-06-01Z"),
    assessmentYear: 2026,
    closedAt: null,
    earlierExpiresAt: null,
    expiresAt: new Date("2033-01-01Z"),
    reviewDueAt: new Date("2027-06-01Z"),
    operatorUserId: "operator",
    holdReason: null,
    holdOwnerUserId: null,
    holdReviewAt: null,
  }
  const digest = accountPrivacyRecordDecisionDigest(row)
  for (const changes of [
    { subjectUserId: "other" },
    { recordId: "other" },
    { actorField: "senderUserId" },
    { expiresAt: new Date("2027-01-01Z") },
    { assessmentYear: 2025 },
    {
      holdReason: "LEGAL_HOLD",
      holdOwnerUserId: "operator",
      holdReviewAt: new Date("2026-12-01Z"),
    },
  ])
    expect(accountPrivacyRecordDecisionDigest({ ...row, ...changes })).not.toBe(
      digest,
    )
  expect(
    accountPrivacyRecordHoldIsActive(
      {
        holdReason: "LEGAL_HOLD",
        holdOwnerUserId: "operator",
        holdReviewAt: new Date("2026-12-01Z"),
      },
      now,
    ),
  ).toBe(true)
  expect(
    accountPrivacyRecordHoldIsActive(
      {
        holdReason: "LEGAL_HOLD",
        holdOwnerUserId: "operator",
        holdReviewAt: new Date("2026-01-01Z"),
      },
      now,
    ),
  ).toBe(false)
})
