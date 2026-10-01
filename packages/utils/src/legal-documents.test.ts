import { describe, expect, test } from "bun:test"
import {
  assertLegalVersionHash,
  canAcceptLegalVersion,
  isSignupAvailableForLegalPublication,
  legalPublicationDigest,
  matchesApprovedLegalPublication,
  resolveLegalSignupChoice,
} from "./legal-approval"
import { LEGAL_DOCUMENTS, LEGAL_DOCUMENT_VERSION } from "./legal-documents"

describe("legal acceptance publication boundary", () => {
  test("draft text cannot be recorded as an effective agreement", () => {
    expect(canAcceptLegalVersion(LEGAL_DOCUMENT_VERSION)).toBe(false)
  })
  test("production signup needs an effective publication", () => {
    expect(
      isSignupAvailableForLegalPublication(false, { APP_ENV: "production" }),
    ).toBe(false)
    expect(
      isSignupAvailableForLegalPublication(true, { APP_ENV: "production" }),
    ).toBe(true)
    expect(
      isSignupAvailableForLegalPublication(false, { APP_ENV: "local" }),
    ).toBe(true)
    expect(isSignupAvailableForLegalPublication(false, {})).toBe(false)
    expect(
      isSignupAvailableForLegalPublication(false, { APP_ENV: "staging" }),
    ).toBe(false)
    expect(
      isSignupAvailableForLegalPublication(false, {
        APP_ENV: "local",
        NODE_ENV: "production",
      }),
    ).toBe(false)
    expect(
      isSignupAvailableForLegalPublication(false, { APP_ENV: "preview" }),
    ).toBe(true)
    expect(
      isSignupAvailableForLegalPublication(false, { NODE_ENV: "test" }),
    ).toBe(true)
  })
  test("unknown and stale versions are rejected", () => {
    expect(canAcceptLegalVersion("2020-01-01")).toBe(false)
    expect(canAcceptLegalVersion("")).toBe(false)
  })
  test("approval covers exact version, effective date and every public document", () => {
    const reviewedDocuments = structuredClone(LEGAL_DOCUMENTS)
    for (const document of Object.values(reviewedDocuments)) {
      document.sections = [
        { title: "Reviewed section", text: "Approved fixture text." },
      ]
    }
    const approved = {
      status: "approved" as const,
      version: "2026-10-01",
      effectiveDate: "2026-10-01",
      approvedAt: "2026-09-30T12:00:00.000Z",
      approvalReference: "owner-review-2026-09-30",
      documents: reviewedDocuments,
      approvedSha256: null as string | null,
    }
    approved.approvedSha256 = legalPublicationDigest(approved)
    const effectiveNow = new Date("2026-10-01T00:00:00Z")
    expect(matchesApprovedLegalPublication(approved, effectiveNow)).toBe(true)
    const draftTextWithMatchingDigest = {
      ...approved,
      documents: structuredClone(LEGAL_DOCUMENTS),
    }
    draftTextWithMatchingDigest.documents.terms.sections.push({
      title: "Draft terms",
      text: "This draft still requires review.",
    })
    draftTextWithMatchingDigest.approvedSha256 = legalPublicationDigest(
      draftTextWithMatchingDigest,
    )
    expect(
      matchesApprovedLegalPublication(
        draftTextWithMatchingDigest,
        effectiveNow,
      ),
    ).toBe(false)
    expect(
      matchesApprovedLegalPublication(
        approved,
        new Date("2026-09-30T23:59:59Z"),
      ),
    ).toBe(false)
    expect(
      matchesApprovedLegalPublication(
        { ...approved, version: "2026-10-02" },
        effectiveNow,
      ),
    ).toBe(false)
    expect(
      matchesApprovedLegalPublication(
        {
          ...approved,
          effectiveDate: "2026-10-02",
        },
        effectiveNow,
      ),
    ).toBe(false)
    expect(
      matchesApprovedLegalPublication(
        { ...approved, status: "draft" },
        effectiveNow,
      ),
    ).toBe(false)
    const changed = structuredClone(approved.documents)
    if (!changed.privacy.sections[0]) throw new Error("Missing privacy section")
    changed.privacy.sections[0].text += " Changed after approval."
    expect(
      matchesApprovedLegalPublication(
        { ...approved, documents: changed },
        effectiveNow,
      ),
    ).toBe(false)
    const supportChanged = structuredClone(approved.documents)
    if (!supportChanged.support.sections[0])
      throw new Error("Missing support section")
    supportChanged.support.sections[0].text += " Changed after approval."
    expect(
      matchesApprovedLegalPublication(
        {
          ...approved,
          documents: supportChanged,
        },
        effectiveNow,
      ),
    ).toBe(false)
    expect(
      matchesApprovedLegalPublication(
        { ...approved, approvedSha256: null },
        effectiveNow,
      ),
    ).toBe(false)
    expect(
      matchesApprovedLegalPublication(
        { ...approved, approvalReference: "other-review" },
        effectiveNow,
      ),
    ).toBe(false)
    const lateApproval = { ...approved, approvedAt: "2026-10-01T12:00:00.000Z" }
    lateApproval.approvedSha256 = legalPublicationDigest(lateApproval)
    expect(matchesApprovedLegalPublication(lateApproval, effectiveNow)).toBe(
      false,
    )
    const invalidDate = { ...approved, effectiveDate: "2026-02-30" }
    invalidDate.approvedSha256 = legalPublicationDigest(invalidDate)
    expect(matchesApprovedLegalPublication(invalidDate)).toBe(false)
  })
  test("a reused version cannot silently accept different approved text", () => {
    expect(() => assertLegalVersionHash("old-digest", "new-digest")).toThrow(
      "Publish a new version",
    )
    expect(() =>
      assertLegalVersionHash("same-digest", "same-digest"),
    ).not.toThrow()
    expect(() => assertLegalVersionHash(null, "new-digest")).not.toThrow()
  })
  test("signup choices bind to the exact effective publication", () => {
    const publication = {
      version: "2026-10-01",
      effectiveDate: "2026-10-01",
      documentHash: "approved-digest",
    }
    expect(() =>
      resolveLegalSignupChoice({}, null, { APP_ENV: "production" }),
    ).toThrow("Signup is unavailable")
    expect(resolveLegalSignupChoice({}, null, { APP_ENV: "local" })).toBeNull()
    expect(resolveLegalSignupChoice({}, null)).toBeNull()
    expect(() =>
      resolveLegalSignupChoice({ legalVersion: publication.version }, null),
    ).toThrow("Draft legal documents")
    expect(() => resolveLegalSignupChoice({}, publication)).toThrow(
      "current Terms",
    )
    expect(() =>
      resolveLegalSignupChoice(
        { legalVersion: publication.version, acceptedTerms: true },
        publication,
      ),
    ).toThrow("current Terms")
    expect(
      resolveLegalSignupChoice(
        {
          legalVersion: publication.version,
          acceptedTerms: true,
          acknowledgedPrivacyNotice: true,
        },
        publication,
      ),
    ).toEqual(publication)
  })
})
