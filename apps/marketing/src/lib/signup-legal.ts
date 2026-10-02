import {
  type LegalRuntimeEnvironment,
  isLegalTestingEnvironment,
  isSignupAvailableForLegalPublication,
} from "@ewatrade/utils/legal-approval"

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
  env: LegalRuntimeEnvironment = process.env,
) {
  if (isLegalTestingEnvironment(env)) return null
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
