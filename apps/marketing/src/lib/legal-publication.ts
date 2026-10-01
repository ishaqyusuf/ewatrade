export type PublicLegalPublication = {
  approved: boolean
  signupAvailable: boolean
  version: string | null
  effectiveDate: string | null
}

export type SignupLegalAcceptance = {
  legalVersion: string
  acceptedTerms: true
  acknowledgedPrivacyNotice: true
}
