import {
  ActionButton,
  MobileScreen,
  SecondarySheetHeader,
  StatusBanner,
} from "@/components/mobile"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { shouldShowInternalDesignSystemEntry } from "@/lib/app-variant"
import { useOnboardingStore } from "@/store/onboardingStore"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import { View } from "react-native"

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function cleanPath(value: string | undefined) {
  const path = value?.trim()

  if (!path?.startsWith("/")) return "/dashboard"

  return path
}

export default function QaSessionRoute() {
  const auth = useAuthContext()
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  )
  const router = useRouter()
  const params = useLocalSearchParams<{
    payload?: string
    businessId?: string
    businessName?: string
    email?: string
    expiresAt?: string
    name?: string
    next?: string
    role?: string
    status?: string
    token?: string
    userId?: string
  }>()
  const [error, setError] = useState<string | null>(null)
  const isAllowed = shouldShowInternalDesignSystemEntry()
  const sessionInput = useMemo(() => {
    const payload = getParam(params.payload)
    const payloadParams = (() => {
      if (!payload) return null

      try {
        return JSON.parse(decodeURIComponent(payload)) as Record<
          string,
          string | undefined
        >
      } catch {
        return null
      }
    })()
    const source = payloadParams ?? params

    return {
      businessId: getParam(source.businessId)?.trim(),
      businessName: getParam(source.businessName)?.trim(),
      email: getParam(source.email)?.trim(),
      expiresAt: getParam(source.expiresAt)?.trim(),
      name: getParam(source.name)?.trim(),
      next: cleanPath(getParam(source.next)),
      role: getParam(source.role)?.trim(),
      status: getParam(source.status)?.trim(),
      token: getParam(source.token)?.trim(),
      userId: getParam(source.userId)?.trim(),
    }
  }, [params])

  useEffect(() => {
    if (!isAllowed) {
      setError("QA session import is only available in dev or preview builds.")
      return
    }

    if (
      !sessionInput.token ||
      !sessionInput.userId ||
      !sessionInput.email ||
      !sessionInput.name
    ) {
      setError("Missing token, user id, email, or name for QA session import.")
      return
    }

    completeOnboarding(true)
    auth.applyAuthenticatedSession(
      {
        expiresAt: sessionInput.expiresAt,
        profile: {
          businessId: sessionInput.businessId,
          businessName: sessionInput.businessName,
          email: sessionInput.email,
          id: sessionInput.userId,
          name: sessionInput.name,
          role: sessionInput.role,
          status: sessionInput.status,
        },
        token: sessionInput.token,
      },
      sessionInput.next,
    )
  }, [auth, completeOnboarding, isAllowed, sessionInput])

  return (
    <MobileScreen contentClassName="justify-center gap-6">
      <SecondarySheetHeader
        description="Imports an API-issued mobile session for guarded emulator QA."
        icon="ShieldCheck"
        title="QA session"
      />

      {error ? (
        <StatusBanner
          icon="TriangleAlert"
          message={error}
          title="Session import unavailable"
          tone="destructive"
        />
      ) : (
        <View className="gap-2 border-y border-border py-5">
          <Text className="font-extrabold text-foreground">
            Importing real session
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            The app will continue to the requested QA screen after the session
            is saved.
          </Text>
        </View>
      )}

      <ActionButton onPress={() => router.replace("/login")} variant="outline">
        Return to login
      </ActionButton>
    </MobileScreen>
  )
}
