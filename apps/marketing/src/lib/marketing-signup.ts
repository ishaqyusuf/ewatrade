import {
  isApprovedLegalPublication,
  isSignupAvailableForLegalPublication,
} from "@ewatrade/utils/legal-approval"

type SignupEnvironment = {
  APP_ENV?: string
  VERCEL_ENV?: string
  NEXT_PUBLIC_SIGNUP_ENABLED?: string
}

// Marketing shows "Create your store" only when the signup API would accept
// the visitor: the signup switch is on and the Terms gate allows signup.
export function isMarketingSignupEnabled(
  env: SignupEnvironment = process.env,
  legalSignupAvailable: () => boolean = () =>
    isSignupAvailableForLegalPublication(isApprovedLegalPublication()),
) {
  return (
    env.APP_ENV !== "preview" &&
    env.VERCEL_ENV !== "preview" &&
    env.NEXT_PUBLIC_SIGNUP_ENABLED === "true" &&
    legalSignupAvailable()
  )
}
