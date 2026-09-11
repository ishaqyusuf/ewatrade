import {
  AuthActionButton,
  AuthBrandHeader,
  MobileScreen,
  StatusBanner,
} from "@/components/mobile"
import { StartupSplash } from "@/components/mobile/startup-splash"
import { useAuthContext } from "@/hooks/use-auth"
import { getCustomerConversationSession } from "@/lib/customer-conversation-store"
import {
  type MobileShell,
  getLastMobileShell,
} from "@/lib/customer-shell-preference"
import { resolveMobileEntryDestination } from "@/lib/mobile-entry-routing"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { Redirect } from "expo-router"
import { useEffect, useState } from "react"

export default function StartRoute() {
  const [lastShell, setLastShell] = useState<MobileShell | null>(null)
  const auth = useAuthContext()
  const trpc = useTRPC()
  const accessProfile = useQuery(
    trpc.auth.getMobileAccessProfile.queryOptions(undefined, {
      enabled: auth.isAuthenticated,
      retry: false,
    }),
  )

  useEffect(() => {
    void getLastMobileShell()
      .then(setLastShell)
      .catch(() => setLastShell("business"))
  }, [])

  useEffect(() => {
    if (!accessProfile.data) return
    if (
      auth.accessProfile?.hasBusinessAccess ===
        accessProfile.data.hasBusinessAccess &&
      auth.accessProfile?.hasCustomerHistory ===
        accessProfile.data.hasCustomerHistory
    ) {
      return
    }

    auth.updateAccessProfile(accessProfile.data)
  }, [accessProfile.data, auth])

  if (!lastShell || (auth.isAuthenticated && accessProfile.isPending)) {
    return <StartupSplash />
  }

  if (auth.isAuthenticated && accessProfile.isError) {
    return (
      <AccessProfileUnavailable onRetry={() => void accessProfile.refetch()} />
    )
  }

  const guestSession = getCustomerConversationSession()
  const destination = resolveMobileEntryDestination({
    accessProfile: accessProfile.data ?? null,
    hasGuestCapability: Boolean(guestSession),
    hasSession: auth.isAuthenticated,
    lastShell,
  })

  if (destination.kind === "customer") {
    const last = guestSession?.lastConversation
    return last ? (
      <Redirect
        href={{
          pathname: "/(customer)/conversations/[conversationId]",
          params: {
            conversationId: last.conversationId,
            publicToken: last.publicToken,
          },
        }}
      />
    ) : (
      <Redirect href="/(customer)/conversations" />
    )
  }

  if (destination.kind === "login") {
    return <Redirect href="/login" />
  }

  if (destination.kind === "no-access") return <Redirect href="/no-access" />

  return <Redirect href="/dashboard" />
}

function AccessProfileUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <MobileScreen contentClassName="justify-center gap-6">
      <AuthBrandHeader
        subtitle="Your account is signed in, but we could not confirm which workspace is currently available."
        title="Checking your access"
      />
      <StatusBanner
        actionLabel="Try again"
        message="Check your connection and retry. We will not open a workspace until access is confirmed."
        onActionPress={onRetry}
        title="Access check unavailable"
        tone="warning"
      />
      <AuthActionButton onPress={onRetry}>Try again</AuthActionButton>
    </MobileScreen>
  )
}
