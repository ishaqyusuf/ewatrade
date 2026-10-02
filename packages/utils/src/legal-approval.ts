import { createHash } from "node:crypto"
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_STATUS,
  LEGAL_DOCUMENT_VERSION,
  type LegalDocument,
  type LegalDocumentKey,
} from "./legal-documents"

// Set these only after the owner approves the exact versioned document snapshot.
export const LEGAL_DOCUMENT_EFFECTIVE_DATE: string | null = "2026-10-01"
export const LEGAL_DOCUMENT_APPROVED_SHA256: string | null =
  "5ccf3c2cb8b9f3d671d9cca307beceb4df12df69fb3df746d094898fd8e1c3fa"
export const LEGAL_DOCUMENT_APPROVED_AT: string | null =
  "2026-10-01T09:47:26.000Z"
export const LEGAL_DOCUMENT_APPROVAL_REFERENCE: string | null =
  "owner-confirmation-2026-10-01-codex-jawdah-poultry-qa"

type LegalPublication = {
  status: "draft" | "approved"
  version: string
  effectiveDate: string | null
  approvedAt: string | null
  approvalReference: string | null
  approvedSha256: string | null
  documents: Record<LegalDocumentKey, LegalDocument>
}

const DRAFT_PUBLICATION_MARKERS = [
  /\bdraft\b/i,
  /\bawaiting approval\b/i,
  /\brequire owner and legal approval\b/i,
  /\brequire business and legal approval\b/i,
  /\brequire confirmation before publication\b/i,
  /\bmust be approved for the launch configuration\b/i,
]

function containsDraftPublicationText(
  documents: Record<LegalDocumentKey, LegalDocument>,
) {
  return Object.values(documents).some((document) =>
    document.sections.some((section) =>
      DRAFT_PUBLICATION_MARKERS.some((marker) =>
        marker.test(`${section.title}\n${section.text}`),
      ),
    ),
  )
}

export function legalPublicationDigest(
  publication: Pick<
    LegalPublication,
    | "version"
    | "effectiveDate"
    | "approvedAt"
    | "approvalReference"
    | "documents"
  >,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: publication.version,
        effectiveDate: publication.effectiveDate,
        approvedAt: publication.approvedAt,
        approvalReference: publication.approvalReference,
        documents: publication.documents,
      }),
    )
    .digest("hex")
}

export function matchesApprovedLegalPublication(
  publication: LegalPublication,
  now = new Date(),
) {
  if (
    publication.status !== "approved" ||
    !publication.version ||
    !publication.effectiveDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(publication.effectiveDate) ||
    !publication.approvedAt ||
    !publication.approvalReference?.trim() ||
    !publication.approvedSha256 ||
    !/^[a-f0-9]{64}$/.test(publication.approvedSha256)
  )
    return false
  if (containsDraftPublicationText(publication.documents)) return false

  const effectiveAt = Date.parse(`${publication.effectiveDate}T00:00:00.000Z`)
  const approvedAt = Date.parse(publication.approvedAt)
  if (
    !Number.isFinite(effectiveAt) ||
    new Date(effectiveAt).toISOString().slice(0, 10) !==
      publication.effectiveDate ||
    !Number.isFinite(approvedAt) ||
    new Date(approvedAt).toISOString() !== publication.approvedAt ||
    approvedAt > now.getTime() ||
    !Number.isFinite(now.getTime()) ||
    now.getTime() < effectiveAt
  )
    return false

  return legalPublicationDigest(publication) === publication.approvedSha256
}

const currentPublication = (): LegalPublication => ({
  status: LEGAL_DOCUMENT_STATUS,
  version: LEGAL_DOCUMENT_VERSION,
  effectiveDate: LEGAL_DOCUMENT_EFFECTIVE_DATE,
  approvedAt: LEGAL_DOCUMENT_APPROVED_AT,
  approvalReference: LEGAL_DOCUMENT_APPROVAL_REFERENCE,
  approvedSha256: LEGAL_DOCUMENT_APPROVED_SHA256,
  documents: LEGAL_DOCUMENTS,
})

export function isApprovedLegalPublication() {
  return matchesApprovedLegalPublication(currentPublication())
}

export function currentLegalPublicationDigest() {
  return legalPublicationDigest(currentPublication())
}

export function currentEffectiveLegalPublication() {
  if (!isApprovedLegalPublication() || !LEGAL_DOCUMENT_EFFECTIVE_DATE)
    return null
  return {
    version: LEGAL_DOCUMENT_VERSION,
    documentHash: currentLegalPublicationDigest(),
    effectiveDate: LEGAL_DOCUMENT_EFFECTIVE_DATE,
  }
}

/** Same-day publication must not treat earlier draft signups as incomplete. */
export function legalPublicationEffectiveAt(publication: {
  version: string
  effectiveDate: string
}) {
  const date = Date.parse(`${publication.effectiveDate}T00:00:00.000Z`)
  const approval =
    publication.version === LEGAL_DOCUMENT_VERSION && LEGAL_DOCUMENT_APPROVED_AT
      ? Date.parse(LEGAL_DOCUMENT_APPROVED_AT)
      : date
  return new Date(Math.max(date, approval))
}

export type LegalSignupChoice = {
  legalVersion?: string
  acceptedTerms?: true
  acknowledgedPrivacyNotice?: true
}

export type LegalRuntimeEnvironment = {
  APP_ENV?: string
  NODE_ENV?: string
  DEV_PROFILE?: string
}

/** Server-selected testing profiles only; production always keeps legal gates. */
export function isLegalTestingEnvironment(
  env: LegalRuntimeEnvironment = process.env,
) {
  if (
    env.APP_ENV === "production" ||
    ["prod", "production"].includes(env.DEV_PROFILE ?? "")
  )
    return false
  if (["local", "preview"].includes(env.APP_ENV ?? "")) return true
  return !env.APP_ENV && ["local", "preview"].includes(env.DEV_PROFILE ?? "")
}

export function isSignupAvailableForLegalPublication(
  effective: boolean,
  env: LegalRuntimeEnvironment = process.env,
) {
  if (isLegalTestingEnvironment(env) || effective) return true
  if (
    env.NODE_ENV === "production" ||
    env.APP_ENV === "production" ||
    ["prod", "production"].includes(env.DEV_PROFILE ?? "")
  )
    return false
  return (
    ["local", "dev", "preview"].includes(env.APP_ENV ?? "") ||
    (!env.APP_ENV && env.NODE_ENV === "test")
  )
}

export function resolveLegalSignupChoice(
  choice: LegalSignupChoice,
  publication = currentEffectiveLegalPublication(),
  env: LegalRuntimeEnvironment = process.env,
) {
  if (isLegalTestingEnvironment(env)) return null
  if (!isSignupAvailableForLegalPublication(Boolean(publication), env))
    throw new Error(
      "Signup is unavailable until the Terms and Privacy Notice are effective.",
    )
  if (!publication) {
    if (
      choice.legalVersion !== undefined ||
      choice.acceptedTerms !== undefined ||
      choice.acknowledgedPrivacyNotice !== undefined
    )
      throw new Error("Draft legal documents cannot be accepted.")
    return null
  }
  if (
    choice.legalVersion !== publication.version ||
    choice.acceptedTerms !== true ||
    choice.acknowledgedPrivacyNotice !== true
  )
    throw new Error("Review the current Terms and Privacy Notice.")
  return publication
}

export function assertLegalVersionHash(
  existingHash: string | null | undefined,
  currentHash: string,
) {
  if (
    existingHash !== null &&
    existingHash !== undefined &&
    existingHash !== currentHash
  )
    throw new Error(
      "This legal version already refers to different text. Publish a new version.",
    )
}

export function canAcceptLegalVersion(version: string) {
  return version === LEGAL_DOCUMENT_VERSION && isApprovedLegalPublication()
}
