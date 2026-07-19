import { MobileScreen, StatusBanner } from "@/components/mobile"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { shouldShowInternalDesignSystemEntry } from "@/lib/app-variant"
import type { MobileSession } from "@/lib/session-store"
import { useOnboardingStore } from "@/store/onboardingStore"
import { useLocalSearchParams } from "expo-router"
import { useEffect, useMemo, useRef } from "react"
import { View } from "react-native"

type QaSessionPayload = {
  expiresAt?: string
  next?: string
  profile?: MobileSession["profile"]
  token?: string
}

function parsePayload(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value
  if (!rawValue) throw new Error("The QA session payload is missing.")

  let decodedValue = rawValue
  try {
    decodedValue = decodeURIComponent(rawValue)
  } catch {
    // Expo Router may already have decoded the path segment.
  }

  const payload = JSON.parse(decodedValue) as QaSessionPayload
  if (!payload.token?.trim()) {
    throw new Error("The QA session token is missing.")
  }
  if (
    !payload.profile?.id?.trim() ||
    !payload.profile.email?.trim() ||
    !payload.profile.name?.trim()
  ) {
    throw new Error("The QA session profile is incomplete.")
  }

  const next =
    payload.next?.startsWith("/") && !payload.next.startsWith("//")
      ? payload.next
      : "/dashboard"

  return {
    next,
    session: {
      expiresAt: payload.expiresAt,
      profile: payload.profile,
      token: payload.token,
    } satisfies MobileSession,
  }
}

export default function QaSessionImportRoute() {
  const params = useLocalSearchParams<{ payload?: string | string[] }>()
  const auth = useAuthContext()
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  )
  const appliedImportRef = useRef<string | null>(null)
  const result = useMemo(() => {
    if (!shouldShowInternalDesignSystemEntry()) {
      return {
        error:
          "QA session import is only available in development or preview builds.",
      }
    }

    try {
      return { value: parsePayload(params.payload) }
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "The QA session could not be imported.",
      }
    }
  }, [params.payload])

  useEffect(() => {
    if (!result.value) return

    const importKey = `${result.value.session.token}:${result.value.next}`
    if (appliedImportRef.current === importKey) return

    appliedImportRef.current = importKey
    completeOnboarding(true)
    auth.applyAuthenticatedSession(result.value.session, result.value.next)
  }, [auth, completeOnboarding, result])

  return (
    <MobileScreen
      contentClassName="items-center justify-center gap-5"
      scroll={false}
    >
      {result.error ? (
        <StatusBanner
          icon="AlertCircle"
          message={result.error}
          title="QA session unavailable"
          tone="destructive"
        />
      ) : (
        <View className="items-center gap-2">
          <Text className="text-xl font-extrabold text-foreground">
            Loading QA business
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            Applying a real local API session.
          </Text>
        </View>
      )}
    </MobileScreen>
  )
}
