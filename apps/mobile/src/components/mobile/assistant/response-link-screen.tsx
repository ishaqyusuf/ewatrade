import { ActionButton } from "@/components/mobile/action-button"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { assistantResponseNativePath } from "@/lib/assistant-response-link"
import { getSession, getSessionGeneration } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { assistantResponseMessageId } from "@ewatrade/assistant/channels/conversation-links"
import { useMutation } from "@tanstack/react-query"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { ScrollView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { AssistantHeader } from "./assistant-ui"

type Result = RouterOutputs["assistant"]["responseLink"]
export function AssistantResponseLinkScreen() {
  const params = useLocalSearchParams<{ messageId?: string | string[] }>()
  const parsed = assistantResponseMessageId.safeParse(params.messageId)
  const messageId = parsed.success ? parsed.data : null
  const auth = useAuthContext()
  const trpc = useTRPC()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const lookup = useMutation(
    trpc.assistant.responseLink.mutationOptions({ gcTime: 0 }),
  )
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const lifetime = useRef(0)
  const identity = `${auth.token}:${auth.profile?.businessId}:${auth.profile?.storeId}:${auth.profile?.role}:${auth.profile?.status}:${getSessionGeneration()}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: Identity changes and explicit retries invalidate the lookup lifetime.
  useEffect(() => {
    const observed = ++lifetime.current
    const generation = getSessionGeneration()
    const current = () =>
      lifetime.current === observed && generation === getSessionGeneration()
    setResult(null)
    setError(null)
    if (messageId && auth.token && !offline)
      void lookup
        .mutateAsync({ messageId })
        .then((value) => {
          if (!current()) return
          if (value.status === "ready")
            router.replace({
              pathname: "/ask-assistant",
              params: {
                conversationId: value.conversationId,
                messageId: value.messageId,
              },
            })
          else setResult(value)
        })
        .catch(() => {
          if (current())
            setError(
              "Couldn't check this response. Check your connection or sign in again.",
            )
        })
    return () => {
      lifetime.current++
    }
  }, [
    messageId,
    identity,
    auth.token,
    offline,
    retry,
    lookup.mutateAsync,
    router,
  ])

  async function switchWorkspace() {
    const initial = getSession()
    if (
      !messageId ||
      !initial ||
      result?.status !== "scope_mismatch" ||
      busy ||
      offline
    )
      return
    const observed = lifetime.current
    const generation = getSessionGeneration()
    setBusy(true)
    setError(null)
    try {
      const fresh = await lookup.mutateAsync({ messageId })
      const latest = getSession()
      if (
        observed !== lifetime.current ||
        generation !== getSessionGeneration() ||
        latest?.token !== initial.token ||
        latest?.profile.businessId !== initial.profile.businessId ||
        latest?.profile.storeId !== initial.profile.storeId
      )
        return
      if (fresh.status === "unavailable") {
        setResult(fresh)
        return
      }
      auth.applyAuthenticatedSession(
        {
          ...initial,
          profile: {
            ...initial.profile,
            businessId: fresh.tenantId,
            businessSlug: fresh.tenantSlug,
            businessName: fresh.businessName,
            storeId: fresh.storeId,
            storeName: fresh.storeName,
            currencyCode: fresh.currencyCode,
            role: fresh.role,
            staffAccessMode: fresh.staffAccessMode,
            catalogEditor: fresh.catalogEditor,
            status: "ACTIVE",
          },
        },
        assistantResponseNativePath(messageId),
      )
    } catch {
      if (
        observed === lifetime.current &&
        generation === getSessionGeneration()
      )
        setError(
          "This workspace could not be selected. Check your access and try again.",
        )
    } finally {
      if (observed === lifetime.current) setBusy(false)
    }
  }

  const signIn = () =>
    router.push({
      pathname: "/login",
      params: {
        returnTo: messageId
          ? assistantResponseNativePath(messageId)
          : undefined,
      },
    })
  return (
    <View className="flex-1 bg-card" style={{ paddingTop: insets.top }}>
      <AssistantHeader title="Assistant" />
      <ScrollView
        contentContainerStyle={{
          padding: 24,
          gap: 20,
          flexGrow: 1,
          justifyContent: "center",
        }}
      >
        <Text className="text-2xl font-bold text-foreground">
          {!messageId
            ? "This response is unavailable"
            : !auth.token
              ? "Sign in to view your response"
              : result?.status === "scope_mismatch"
                ? "Switch to view this response"
                : result?.status === "unavailable"
                  ? "This response isn't available for this account"
                  : offline
                    ? "Reconnect to view your response"
                    : error
                      ? "Couldn’t open this response"
                      : "Opening your saved response…"}
        </Text>
        {!auth.token ? (
          <>
            <Text className="text-base text-muted-foreground">
              Your saved answer will open after sign-in. Use the account
              connected to WhatsApp.
            </Text>
            <ActionButton onPress={signIn}>Sign in</ActionButton>
          </>
        ) : result?.status === "scope_mismatch" ? (
          <>
            <Text className="text-base text-foreground">
              {result.businessName} · {result.storeName}
            </Text>
            <Text className="text-sm text-muted-foreground">
              Your WhatsApp workspace will stay as it is.
            </Text>
            <ActionButton
              disabled={busy || offline}
              onPress={() => void switchWorkspace()}
            >
              Switch and view response
            </ActionButton>
          </>
        ) : result?.status === "unavailable" ? (
          <>
            <Text className="text-base text-muted-foreground">
              The response may have been removed, or your access may have
              changed.
            </Text>
            <ActionButton onPress={signIn}>Switch account</ActionButton>
          </>
        ) : null}
        {error ? (
          <Text
            accessibilityRole="alert"
            className="text-base text-destructive"
          >
            {error}
          </Text>
        ) : null}
        {error || offline ? (
          <ActionButton
            disabled={offline}
            onPress={() => setRetry((value) => value + 1)}
          >
            Try again
          </ActionButton>
        ) : null}
        {auth.token ? (
          <ActionButton
            variant="outline"
            onPress={() => router.replace("/ask-assistant")}
          >
            Open assistant
          </ActionButton>
        ) : null}
      </ScrollView>
    </View>
  )
}
