export type SignupLegalInput = {
  legalVersion?: string
  acceptedTerms?: true
  acknowledgedPrivacyNotice?: true
}

export type LegalPublicationSnapshot = {
  approved: boolean
  version: string
  documentHash: string
}

export function resolveSignupLegalAcceptance(
  input: SignupLegalInput,
  publication: LegalPublicationSnapshot,
  env: { APP_ENV?: string; NODE_ENV?: string } = process.env,
) {
  if (!publication.approved) {
    if (!isSignupAvailableForLegalPublication(false, env))
      throw new Error(
        "Signup is unavailable until the Terms and Privacy Notice are effective.",
      )
    if (
      input.legalVersion !== undefined ||
      input.acceptedTerms !== undefined ||
      input.acknowledgedPrivacyNotice !== undefined
    )
      throw new Error("Draft legal documents cannot be accepted.")
    return null
  }

  if (
    input.legalVersion !== publication.version ||
    input.acceptedTerms !== true ||
    input.acknowledgedPrivacyNotice !== true
  )
    throw new Error("The current Terms and Privacy Notice must be reviewed.")

  return {
    version: publication.version,
    documentHash: publication.documentHash,
  }
}
import { isSignupAvailableForLegalPublication } from "@ewatrade/utils/legal-approval"
