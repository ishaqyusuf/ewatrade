import { SignupChat } from "@ewatrade/onboarding/components/signup/signup-chat"
import { getMarketingUrl } from "@ewatrade/onboarding/lib/signup-navigation"

export const dynamic = "force-dynamic"

export default function SignupChatPage() {
  return <SignupChat marketingUrl={getMarketingUrl()} />
}
