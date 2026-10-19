import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { getBaseUrl } from "@/lib/base-url"
import { getSession, isLocalSessionToken } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { getDataCacheGeneration } from "@/trpc/client"
import { useFocusEffect, useRouter } from "expo-router"
import { fetch as nativeFetch } from "expo/fetch"
import { useCallback, useEffect, useRef, useState } from "react"
import { ActionButton } from "../action-button"
import { MobileScreen } from "../screen"
import { StatusBanner } from "../status-banner"
import {
  createAssistantDataFile,
  shareAssistantDataFile,
} from "./assistant-data-file"
import {
  assistantDataTransferMessage,
  shareAssistantData,
} from "./assistant-data-transfer"
import { QuietHeader } from "./quiet-settings"
import { useOpenPolicy } from "./use-open-policy"

export function AssistantDataScreen() {
  const router = useRouter()
  const auth = useAuthContext()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const { openPolicy, linkError } = useOpenPolicy()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const lifetime = useRef(0)
  const focused = useRef(false)
  const operation = useRef<AbortController | null>(null)
  const generation = getDataCacheGeneration()
  const owner = useRef({
    token: auth.token,
    userId: auth.profile?.id,
    generation,
    offline,
  })
  const cancel = useCallback(() => {
    lifetime.current += 1
    operation.current?.abort()
  }, [])
  useFocusEffect(
    useCallback(() => {
      focused.current = true
      setNotice(null)
      return () => {
        focused.current = false
        cancel()
      }
    }, [cancel]),
  )
  useEffect(() => {
    if (
      owner.current.token !== auth.token ||
      owner.current.userId !== auth.profile?.id ||
      owner.current.generation !== generation ||
      owner.current.offline !== offline
    ) {
      cancel()
      setNotice(null)
    }
    owner.current = {
      token: auth.token,
      userId: auth.profile?.id,
      generation,
      offline,
    }
  }, [auth.token, auth.profile?.id, generation, offline, cancel])
  const real = Boolean(
    auth.token &&
      auth.profile?.id &&
      !isLocalSessionToken(auth.token) &&
      !auth.token.startsWith("qas_"),
  )
  const download = async () => {
    if (operation.current || offline || !real) return
    const controller = new AbortController()
    operation.current = controller
    const started = lifetime.current
    const cache = getDataCacheGeneration()
    const current = () =>
      focused.current &&
      started === lifetime.current &&
      cache === getDataCacheGeneration() &&
      !useOperationalModeStore.getState().isOfflineMode
    setBusy(true)
    setNotice(null)
    const timer = setTimeout(() => controller.abort(), 120_000)
    try {
      await shareAssistantData(
        {
          baseUrl: getBaseUrl(),
          currentIdentity: () => {
            const session = getSession()
            return session
              ? { userId: session.profile.id, token: session.token }
              : null
          },
          isCurrent: current,
          fetch: nativeFetch,
          createFile: createAssistantDataFile,
          share: shareAssistantDataFile,
        },
        controller.signal,
      )
      if (current())
        setNotice(
          "The share sheet has closed. EwaTrade’s temporary copy was removed.",
        )
    } catch (error) {
      if (current()) setNotice(assistantDataTransferMessage(error))
    } finally {
      clearTimeout(timer)
      if (operation.current === controller) operation.current = null
      if (focused.current) setBusy(false)
    }
  }
  return (
    <MobileScreen contentClassName="gap-5 px-[18px] py-2">
      <QuietHeader
        title="Your assistant data"
        backLabel="Account and privacy"
        onBack={() => router.back()}
      />
      <View className="gap-3 px-1">
        <Text className="text-base leading-6 text-foreground">
          Download your private assistant chats, saved drafts and usage, plus
          original files still retained for your account.
        </Text>
        <Text className="text-sm leading-6 text-muted-foreground">
          Shared business records may need a privacy review. Some protected
          details are excluded, with reasons in the download. Files held by
          WhatsApp or other providers are separate.
        </Text>
        <Text className="text-sm leading-6 text-muted-foreground">
          Choose where to save or share the file. EwaTrade removes its temporary
          device copy when sharing ends or you cancel; copies you save or send
          remain with the destination you choose.
        </Text>
      </View>
      {!real ? (
        <StatusBanner
          tone="warning"
          message="Sign in with your own account to download assistant data. QA and offline sample sessions cannot export."
        />
      ) : offline ? (
        <StatusBanner
          tone="warning"
          message="Connect to the internet and turn off offline mode to download your assistant data."
        />
      ) : null}
      {notice || linkError ? (
        <StatusBanner message={notice ?? linkError ?? ""} />
      ) : null}
      <ActionButton
        disabled={!real || offline}
        isLoading={busy}
        loadingLabel="Preparing private download…"
        onPress={() => void download()}
      >
        Download and share
      </ActionButton>
      {busy ? (
        <ActionButton
          variant="outline"
          onPress={() => {
            operation.current?.abort()
          }}
        >
          Cancel download
        </ActionButton>
      ) : null}
      <ActionButton variant="ghost" onPress={() => void openPolicy("support")}>
        Contact support
      </ActionButton>
    </MobileScreen>
  )
}
