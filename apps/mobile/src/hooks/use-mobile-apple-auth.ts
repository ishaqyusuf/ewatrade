import { useAuthContext } from "@/hooks/use-auth"
import { clearPendingOnboarding } from "@/lib/onboarding-continuation-store"
import { useOnboardingStore } from "@/store/onboardingStore"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { useMutation } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import * as AppleAuthentication from "expo-apple-authentication"

type AppleProfile = Omit<
  RouterInputs["auth"]["verifyMobileApple"],
  "idToken" | "challengeId" | "authorizationCode"
>

export function useMobileAppleAuth({
  onError,
  redirectHref,
  ...profile
}: AppleProfile & {
  onError: (message: string) => void
  redirectHref?: string
}) {
  const trpc = useTRPC()
  const auth = useAuthContext()
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  )
  const challenge = useMutation(
    trpc.auth.createMobileAppleChallenge.mutationOptions(),
  )
  const verification = useMutation(
    trpc.auth.verifyMobileApple.mutationOptions(),
  )
  const login = useMutation({
    mutationFn: async () => {
      const proof = await challenge.mutateAsync()
      const credential = await AppleAuthentication.signInAsync({
        nonce: proof.nonce,
        state: proof.challengeId,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      })
      if (
        !credential.identityToken ||
        !credential.authorizationCode ||
        credential.state !== proof.challengeId
      )
        throw new Error("Apple sign-in did not return a matching credential.")
      return verification.mutateAsync({
        ...profile,
        name:
          profile.name ||
          (credential.fullName
            ? AppleAuthentication.formatFullName(credential.fullName).trim()
            : undefined) ||
          undefined,
        challengeId: proof.challengeId,
        idToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
      })
    },
    onSuccess(session) {
      if (profile.accessToken)
        void clearPendingOnboarding(profile.accessToken).catch(() => undefined)
      completeOnboarding(true)
      auth.applyAuthenticatedSession(
        {
          accessProfile: session.accessProfile,
          expiresAt: session.expiresAt.toISOString(),
          profile: {
            businessId: session.profile.businessId ?? undefined,
            businessName: session.profile.businessName ?? undefined,
            businessSlug: session.tenant?.slug ?? undefined,
              storeId: session.tenant?.storeId ?? undefined,
              storeName: session.tenant?.storeName ?? undefined,
            currencyCode: session.profile.currencyCode,
            email: session.profile.email,
            id: session.profile.id,
            name: session.profile.name,
            role: session.profile.role ?? undefined,
            staffAccessMode: session.profile.staffAccessMode,
            catalogEditor: session.profile.catalogEditor,
            status: session.profile.status ?? undefined,
          },
          token: session.token,
        },
        redirectHref ?? "/",
      )
    },
    onError(error) {
      if ("code" in error && error.code === "ERR_REQUEST_CANCELED") return
      if (
        error instanceof TRPCClientError &&
        error.data?.appError?.code?.startsWith("ONBOARDING_")
      ) {
        onError(error.message)
        return
      }
      onError("Apple sign-in could not finish. Try again or use email sign-in.")
    },
  })
  return { isPending: login.isPending, startAppleAuth: () => login.mutate() }
}
