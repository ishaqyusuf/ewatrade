import { isDevelopmentAppVariant } from "@/lib/app-variant"
import {
  initializeCustomerConversationStore,
  setPendingCustomerTransfer,
} from "@/lib/customer-conversation-store"
import {
  resolveCustomerConversationQaPath,
  resolveCustomerDeepLink,
} from "@/lib/customer-deep-link"
import { resolveGreenTillQaPath } from "@/lib/green-till-qa-link"
import { resolveOnboardingContinuationLink } from "@/lib/onboarding-continuation-link"
import {
  onboardingLinkConfiguration,
  savePendingOnboarding,
} from "@/lib/onboarding-continuation-store"
import { resolveOnboardingMarketDayQaPath } from "@/lib/onboarding-market-day-qa"

let continuationAttempt = 0

export async function redirectSystemPath({
  path,
}: {
  initial: boolean
  path: string
}) {
  const greenTillQa = resolveGreenTillQaPath(
    path,
    __DEV__ && isDevelopmentAppVariant(),
  )
  if (greenTillQa) return greenTillQa
  try {
    const continuation = resolveOnboardingContinuationLink(
      path,
      onboardingLinkConfiguration(),
    )
    if (continuation) {
      await savePendingOnboarding(continuation)
      return `/continue-onboarding?attempt=${Date.now()}-${++continuationAttempt}`
    }
  } catch {
    // Never drop into a different signup session when secure persistence fails.
    return "/continue-onboarding?error=storage"
  }
  const onboardingMarketDayQaPath = resolveOnboardingMarketDayQaPath(
    path,
    __DEV__,
  )
  if (onboardingMarketDayQaPath) return onboardingMarketDayQaPath

  const qaPath = resolveCustomerConversationQaPath(path, __DEV__)
  if (qaPath) return qaPath

  const resolved = resolveCustomerDeepLink(path)
  if (resolved.pendingTransfer) {
    await initializeCustomerConversationStore()
    setPendingCustomerTransfer(resolved.pendingTransfer)
  }
  return resolved.path
}
