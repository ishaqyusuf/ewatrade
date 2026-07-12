import { useAuthContext } from "@/hooks/use-auth"
import { useOnboardingStore } from "@/store/onboardingStore"
import { useTRPC } from "@/trpc/client"
import { useMutation } from "@tanstack/react-query"
import * as Google from "expo-auth-session/providers/google"
import * as WebBrowser from "expo-web-browser"
import { useCallback, useEffect, useRef } from "react"
import { Platform } from "react-native"

WebBrowser.maybeCompleteAuthSession()

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? ""
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? ""
const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? ""
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ""
const SAFE_MISSING_CLIENT_ID =
  "missing-google-client-id.apps.googleusercontent.com"

type MobileGoogleAuthMode = "login" | "sign_up"

type UseMobileGoogleAuthInput = {
  businessName?: string
  mode: MobileGoogleAuthMode
  name?: string
  onError: (message: string) => void
}

function getPlatformGoogleClientId() {
  if (Platform.OS === "android") return GOOGLE_ANDROID_CLIENT_ID
  if (Platform.OS === "ios") return GOOGLE_IOS_CLIENT_ID
  if (Platform.OS === "web") return GOOGLE_WEB_CLIENT_ID || GOOGLE_CLIENT_ID

  return GOOGLE_CLIENT_ID || GOOGLE_WEB_CLIENT_ID
}

function getMissingGoogleClientMessage() {
  if (Platform.OS === "android") {
    return "Google sign-in needs the Android client ID. Use email code instead."
  }

  if (Platform.OS === "ios") {
    return "Google sign-in needs the iOS client ID. Use email code instead."
  }

  return "Google sign-in is not configured yet. Use email code instead."
}

export function useMobileGoogleAuth({
  businessName,
  mode,
  name,
  onError,
}: UseMobileGoogleAuthInput) {
  const auth = useAuthContext()
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  )
  const trpc = useTRPC()
  const platformClientId = getPlatformGoogleClientId()
  const isConfigured = Boolean(platformClientId)
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    clientId: platformClientId || SAFE_MISSING_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    scopes: ["openid", "email", "profile"],
    selectAccount: true,
    webClientId: GOOGLE_WEB_CLIENT_ID || GOOGLE_CLIENT_ID || undefined,
  })
  const lastSubmittedIdToken = useRef<string | null>(null)
  const verifyGoogleMutation = useMutation(
    trpc.auth.verifyMobileGoogle.mutationOptions({
      onError(error) {
        lastSubmittedIdToken.current = null
        onError(
          error.message || "Google sign-in failed. Use email code instead.",
        )
      },
      onSuccess(session) {
        completeOnboarding(true)
        auth.applyAuthenticatedSession({
          expiresAt: session.expiresAt.toISOString(),
          profile: {
            businessId: session.profile.businessId ?? undefined,
            businessName: session.profile.businessName ?? undefined,
            email: session.profile.email,
            id: session.profile.id,
            name: session.profile.name,
            role: session.profile.role ?? undefined,
            status: session.profile.status ?? undefined,
          },
          token: session.token,
        })
      },
    }),
  )

  useEffect(() => {
    if (!response) return

    if (response.type === "cancel" || response.type === "dismiss") {
      return
    }

    if (response.type !== "success") {
      onError("Google sign-in did not finish. Use email code instead.")
      return
    }

    const idToken = response.params.id_token
    if (!idToken) {
      onError(
        "Google did not return a verified sign-in token. Use email code instead.",
      )
      return
    }

    if (lastSubmittedIdToken.current === idToken) return
    lastSubmittedIdToken.current = idToken

    verifyGoogleMutation.mutate({
      businessName,
      idToken,
      mode,
      name,
    })
  }, [businessName, mode, name, onError, response, verifyGoogleMutation])

  const startGoogleAuth = useCallback(async () => {
    if (!isConfigured) {
      onError(getMissingGoogleClientMessage())
      return
    }

    if (!request) {
      onError("Google sign-in is still getting ready. Try again in a moment.")
      return
    }

    try {
      await promptAsync()
    } catch {
      onError("Google sign-in could not open. Use email code instead.")
    }
  }, [isConfigured, onError, promptAsync, request])

  return {
    isConfigured,
    isPending: verifyGoogleMutation.isPending,
    startGoogleAuth,
  }
}
