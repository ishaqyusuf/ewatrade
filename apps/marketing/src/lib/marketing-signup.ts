import {
  isApprovedLegalPublication,
  isSignupAvailableForLegalPublication,
} from "@ewatrade/utils/legal-approval"

// Marketing shows "Create your store" only when the signup API would accept
// the visitor: the Terms gate allows signup.
export function isMarketingSignupEnabled(
  legalSignupAvailable: () => boolean = () =>
    isSignupAvailableForLegalPublication(isApprovedLegalPublication()),
) {
  return legalSignupAvailable()
}
