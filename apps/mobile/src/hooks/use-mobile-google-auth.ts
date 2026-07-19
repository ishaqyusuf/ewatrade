import { useAuthContext } from "@/hooks/use-auth"
import { useOnboardingStore } from "@/store/onboardingStore"
import { useTRPC } from "@/trpc/client"
import type { OperatingCurrencyCode } from "@ewatrade/utils"
import type * as GoogleSignIn from "@react-native-google-signin/google-signin"
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
const usesWebGoogleAuth = Platform.OS === "web"
let nativeGoogleConfigured = false

type MobileGoogleAuthMode = "login" | "sign_up"

type UseMobileGoogleAuthInput = {
  addressLine1?: string
  businessName?: string
  city?: string
  currencyCode?: OperatingCurrencyCode
  mode: MobileGoogleAuthMode
  name?: string
  phone?: string
  onError: (message: string) => void
}

function getGoogleWebClientId() {
  return GOOGLE_WEB_CLIENT_ID || GOOGLE_CLIENT_ID
}

function getIsGoogleConfigured() {
  if (usesWebGoogleAuth) return Boolean(getGoogleWebClientId())

  if (Platform.OS === "android") {
    return Boolean(GOOGLE_ANDROID_CLIENT_ID && getGoogleWebClientId())
  }

  if (Platform.OS === "ios") {
    return Boolean(GOOGLE_IOS_CLIENT_ID && getGoogleWebClientId())
  }

  return false
}

function getMissingGoogleClientMessage() {
  if (!usesWebGoogleAuth && !getGoogleWebClientId()) {
    return "Google sign-in needs the web client ID for secure ID tokens. Use email code instead."
  }

  if (Platform.OS === "android") {
    return "Google sign-in needs the Android client ID. Use email code instead."
  }

  if (Platform.OS === "ios") {
    return "Google sign-in needs the iOS client ID. Use email code instead."
  }

  return "Google sign-in is not configured yet. Use email code instead."
}

async function loadNativeGoogleSignIn() {
  try {
    return (await import(
      "@react-native-google-signin/google-signin"
    )) as typeof GoogleSignIn
  } catch {
    return null
  }
}

function configureNativeGoogleSignIn(
  GoogleSignin: typeof GoogleSignIn.GoogleSignin,
) {
  if (nativeGoogleConfigured) return

  GoogleSignin.configure({
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    offlineAccess: false,
    scopes: ["email", "profile"],
    webClientId: getGoogleWebClientId() || undefined,
  })
  nativeGoogleConfigured = true
}

export function useMobileGoogleAuth({
  addressLine1,
  businessName,
  city,
  currencyCode,
  mode,
  name,
  phone,
  onError,
}: UseMobileGoogleAuthInput) {
  const auth = useAuthContext()
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  )
  const trpc = useTRPC()
  const isConfigured = getIsGoogleConfigured()
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: getGoogleWebClientId() || SAFE_MISSING_CLIENT_ID,
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
            currencyCode: session.profile.currencyCode,
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
  const submitGoogleIdToken = useCallback(
    (idToken: string) => {
      if (lastSubmittedIdToken.current === idToken) return
      lastSubmittedIdToken.current = idToken

      verifyGoogleMutation.mutate({
        addressLine1,
        businessName,
        city,
        currencyCode,
        idToken,
        mode,
        name,
        phone,
      })
    },
    [addressLine1, businessName, city, currencyCode, mode, name, phone, verifyGoogleMutation],
  )

  useEffect(() => {
    if (!usesWebGoogleAuth) return
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

    submitGoogleIdToken(idToken)
  }, [onError, response, submitGoogleIdToken])

  const startGoogleAuth = useCallback(async () => {
    if (!isConfigured) {
      onError(getMissingGoogleClientMessage())
      return
    }

    if (!usesWebGoogleAuth) {
      const nativeGoogle = await loadNativeGoogleSignIn()

      if (!nativeGoogle) {
        onError(
          "Google sign-in needs a development build. Use email code instead.",
        )
        return
      }

      try {
        configureNativeGoogleSignIn(nativeGoogle.GoogleSignin)

        if (Platform.OS === "android") {
          await nativeGoogle.GoogleSignin.hasPlayServices({
            showPlayServicesUpdateDialog: true,
          })
        }

        const signInResponse = await nativeGoogle.GoogleSignin.signIn()

        if (nativeGoogle.isCancelledResponse(signInResponse)) {
          return
        }

        if (!nativeGoogle.isSuccessResponse(signInResponse)) {
          onError("Google sign-in did not finish. Use email code instead.")
          return
        }

        const tokens = signInResponse.data.idToken
          ? { idToken: signInResponse.data.idToken }
          : await nativeGoogle.GoogleSignin.getTokens()

        if (!tokens.idToken) {
          onError(
            "Google did not return a verified sign-in token. Use email code instead.",
          )
          return
        }

        submitGoogleIdToken(tokens.idToken)
      } catch (error) {
        if (
          nativeGoogle.isErrorWithCode(error) &&
          error.code === nativeGoogle.statusCodes.SIGN_IN_CANCELLED
        ) {
          return
        }

        if (
          nativeGoogle.isErrorWithCode(error) &&
          error.code === nativeGoogle.statusCodes.PLAY_SERVICES_NOT_AVAILABLE
        ) {
          onError(
            "Google Play Services is not available. Use email code instead.",
          )
          return
        }

        onError("Google sign-in could not open. Use email code instead.")
      }
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
  }, [isConfigured, onError, promptAsync, request, submitGoogleIdToken])

  return {
    isConfigured,
    isPending: verifyGoogleMutation.isPending,
    startGoogleAuth,
  }
}
