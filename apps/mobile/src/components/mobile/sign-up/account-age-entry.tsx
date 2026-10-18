import type { ApprovedNativeOnboarding } from "../onboarding/onboarding-continuation-screen"
import { SignUpScreen } from "./sign-up-screen"
/** Compatibility entry: age is now chosen in the Account form. */
export function AccountAgeEntry({
  continuation,
}: { continuation?: ApprovedNativeOnboarding } = {}) {
  return <SignUpScreen continuation={continuation} />
}
