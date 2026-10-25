import { ActionButton } from "@/components/mobile/action-button"
import {
  ListCard,
  RecordRow,
  SectionHeader,
} from "@/components/mobile/green-till/kit"
import { ScreenBar } from "@/components/mobile/green-till/screen-bar"
import { MobileScreen } from "@/components/mobile/screen"
import { SettingsScreen } from "@/components/mobile/settings-screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { onboardingDashboardUrl } from "@/lib/onboarding-web-client"
import { getSession, isLocalSessionToken } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as Clipboard from "expo-clipboard"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, Linking } from "react-native"
import {
  canConfirmAssistantWhatsAppLink,
  isAssistantWhatsAppConnectUrl,
  isFreshAssistantWhatsAppLinkStatus,
} from "./link-state"
import { WhatsAppScopePicker } from "./scope-picker"
import { selectedWhatsAppChatRoute } from "./selected-chat-route"

type Link = { id: string; url: string; expiresAt: Date; receivedAt: number }

export function AssistantWhatsAppScreen() {
  const router = useRouter()
  const auth = useAuthContext()
  const trpc = useTRPC()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [focused, setFocused] = useState(false)
  const [link, setLink] = useState<Link | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string>()
  const [pages, setPages] = useState<Array<string | undefined>>([])
  const [identityId, setIdentityId] = useState<string | null>(null)
  const [selectedChat, setSelectedChat] = useState<{
    conversationId: string
    tenantId: string
    storeId: string
    purpose: "GENERAL" | "SETUP" | "PRODUCT_CREATE"
  } | null>(null)
  const [now, setNow] = useState(Date.now())
  const lifetime = useRef(0)
  const cacheGeneration = getDataCacheGeneration()
  const context = useRef({ token: auth.token, generation: cacheGeneration })
  const realSession =
    Boolean(auth.token) &&
    !isLocalSessionToken(auth.token) &&
    !auth.token?.startsWith("qas_")
  const online = focused && !offline && realSession
  const hasScope = Boolean(auth.profile?.businessId && auth.profile.storeId)
  const create = useMutation(
    trpc.assistantChannels.createWhatsAppLink.mutationOptions({ gcTime: 0 }),
  )
  const confirm = useMutation(
    trpc.assistantChannels.confirmWhatsAppLink.mutationOptions({ gcTime: 0 }),
  )
  const revoke = useMutation(
    trpc.assistantChannels.revokeWhatsApp.mutationOptions({ gcTime: 0 }),
  )
  const createReset = useRef(create.reset)
  const confirmReset = useRef(confirm.reset)
  createReset.current = create.reset
  confirmReset.current = confirm.reset
  const connections = useQuery(
    trpc.assistantChannels.whatsAppConnections.queryOptions(
      cursor ? { cursor } : undefined,
      { enabled: online, retry: false, gcTime: 0, staleTime: 0 },
    ),
  )
  const availability = useQuery(
    trpc.assistantChannels.availability.queryOptions(undefined, {
      enabled: online && hasScope,
      retry: false,
      gcTime: 0,
    }),
  )
  const expired = Boolean(link && new Date(link.expiresAt).getTime() <= now)
  const status = useQuery(
    trpc.assistantChannels.whatsAppLink.queryOptions(
      { linkId: link?.id ?? "none" },
      {
        enabled: online && Boolean(link) && !expired,
        retry: false,
        gcTime: 0,
        refetchInterval: (query) =>
          ["awaiting_whatsapp", "awaiting_confirmation"].includes(
            query.state.data?.state ?? "",
          )
            ? 3000
            : false,
      },
    ),
  )
  const freshStatus = Boolean(
    link && isFreshAssistantWhatsAppLinkStatus(status, link.receivedAt),
  )

  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => {
        lifetime.current += 1
        setFocused(false)
        setLink(null)
        setIdentityId(null)
        setSelectedChat(null)
        setNotice(null)
        createReset.current()
        confirmReset.current()
      }
    }, []),
  )
  useEffect(() => {
    if (!link) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [link])
  useEffect(() => {
    if (!offline) return
    lifetime.current += 1
    setLink(null)
    setIdentityId(null)
    setSelectedChat(null)
    createReset.current()
    confirmReset.current()
  }, [offline])
  useEffect(() => {
    if (
      context.current.token === auth.token &&
      context.current.generation === cacheGeneration
    )
      return
    context.current = { token: auth.token, generation: cacheGeneration }
    lifetime.current += 1
    setLink(null)
    setIdentityId(null)
    setSelectedChat(null)
    setNotice(null)
    createReset.current()
    confirmReset.current()
  }, [auth.token, cacheGeneration])

  const guard = () => {
    const revision = lifetime.current
    const generation = getDataCacheGeneration()
    const token = auth.token
    const profile = auth.profile
    return () =>
      lifetime.current === revision &&
      getDataCacheGeneration() === generation &&
      getSession()?.token === token &&
      getSession()?.profile.id === profile?.id &&
      getSession()?.profile.businessId === profile?.businessId &&
      getSession()?.profile.storeId === profile?.storeId &&
      !useOperationalModeStore.getState().isOfflineMode
  }
  const start = async () => {
    if (!online || !hasScope || create.isPending) return
    const current = guard()
    setNotice(null)
    setLink(null)
    try {
      const created = await create.mutateAsync({})
      if (!current()) return
      if (!isAssistantWhatsAppConnectUrl(created.url)) {
        create.reset()
        setNotice("The WhatsApp link could not be prepared. Try again.")
        return
      }
      setNow(Date.now())
      setLink({ ...created, receivedAt: Date.now() })
      create.reset()
    } catch {
      if (current())
        setNotice(
          "Could not start a link. Check your connection and sign in again if your session is no longer fresh.",
        )
    }
  }
  const approve = async () => {
    if (
      !online ||
      !link ||
      !status.data ||
      !freshStatus ||
      confirm.isPending ||
      !canConfirmAssistantWhatsAppLink({
        localId: link.id,
        remoteId: status.data.id,
        ...status.data,
      })
    )
      return
    const current = guard()
    try {
      await confirm.mutateAsync({
        linkId: link.id,
        expectedRevision: status.data.revision,
      })
      if (!current()) return
      setLink(null)
      create.reset()
      confirm.reset()
      setCursor(undefined)
      setPages([])
      setNotice(
        "WhatsApp connected. Choose a business, Store and chat below, or send Help to EwaTrade in WhatsApp.",
      )
      void connections.refetch()
    } catch {
      if (current()) {
        setNotice(
          "Could not confirm this number. Check the connection again; if it changed or expired, start a new link. A fresh sign-in may be needed.",
        )
        void status.refetch()
      }
    }
  }
  const withdraw = (grantId: string, label: string) => {
    if (!online || revoke.isPending) return
    const current = guard()
    Alert.alert(
      "Disconnect this business?",
      `${label}. This removes this WhatsApp connection’s access to the business. Your saved chats stay in EwaTrade.`,
      [
        { text: "Keep connection", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => {
            if (!current()) return
            void revoke
              .mutateAsync({ grantId })
              .then(() => {
                if (!current()) return
                setIdentityId(null)
                setNotice("Business disconnected from WhatsApp.")
                void connections.refetch()
              })
              .catch(() => {
                if (current())
                  setNotice(
                    "Could not disconnect. Check your connection and retry.",
                  )
              })
          },
        },
      ],
    )
  }
  const open = async (copy: boolean) => {
    if (!online || !link || expired || !isAssistantWhatsAppConnectUrl(link.url))
      return
    const current = guard()
    try {
      if (copy) await Clipboard.setStringAsync(link.url)
      else await Linking.openURL(link.url)
      if (current())
        setNotice(
          copy
            ? "Private link copied. It expires in five minutes; share it only with your own device."
            : "Send the prepared Connect message, then return here to confirm your number.",
        )
    } catch {
      if (current())
        setNotice(
          "WhatsApp could not open. Try copying the link to your own device instead.",
        )
    }
  }
  const data = online ? connections.data : undefined
  const continueSelectedChat = async () => {
    if (!online || !selectedChat) return
    const current = guard()
    if (!current()) return
    const session = getSession()
    const profile = session?.profile
    try {
      const target = selectedWhatsAppChatRoute(
        selectedChat,
        profile?.businessId && profile.storeId
          ? { tenantId: profile.businessId, storeId: profile.storeId }
          : null,
        selectedChat.purpose === "PRODUCT_CREATE"
          ? onboardingDashboardUrl("")
          : undefined,
      )
      if (!target || !current()) {
        setNotice(
          "This saved chat could not open. Choose its original business and Store and check your app’s website configuration.",
        )
        return
      }
      if (target.kind === "web") await Linking.openURL(target.href)
      else
        router.push({
          pathname: target.pathname,
          params: { conversationId: target.conversationId },
        })
    } catch {
      if (current())
        setNotice(
          "This saved chat could not open. Choose its original business and Store and check your app’s website configuration.",
        )
    }
  }
  const claimed =
    status.data?.state === "awaiting_confirmation" && status.data.maskedSender
  const terminal =
    expired ||
    status.data?.state === "expired" ||
    status.data?.state === "cancelled"
  const confirmable = Boolean(
    freshStatus &&
      link &&
      status.data &&
      canConfirmAssistantWhatsAppLink(
        { localId: link.id, remoteId: status.data.id, ...status.data },
        now,
      ),
  )

  return (
    <MobileScreen
      contentClassName="gap-4 px-[18px] py-4"
      testID="assistant-whatsapp-screen"
    >
      <ScreenBar
        kind="back"
        label="Back"
        title="Assistant on WhatsApp"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/account")
        }
      />
      <SettingsScreen
        label="Your assistant"
        title="Take EwaTrade with you"
        sub="Use EwaTrade’s existing WhatsApp number ending 5343. Sign-in codes keep their separate purpose. Customer messages stay in your business messaging tools."
      />
      {!realSession ? (
        <StatusBanner
          tone="warning"
          title="Use your own account"
          message="WhatsApp connections need an ordinary signed-in account. Preview and pinned QA sessions cannot connect or manage numbers."
        />
      ) : offline ? (
        <StatusBanner
          tone="warning"
          title="Return online"
          message="Connect, confirm and disconnect need internet. Nothing is queued offline. You can also send Disconnect to EwaTrade from your connected WhatsApp number."
        />
      ) : null}
      {notice ? <StatusBanner tone="primary" message={notice} /> : null}
      {online && hasScope && availability.isPending ? (
        <Text>Checking WhatsApp availability…</Text>
      ) : null}
      {online && hasScope && availability.isError ? (
        <StatusBanner
          tone="warning"
          message="Could not check availability. Existing connections can still be managed below."
          actionLabel="Retry"
          onActionPress={() => void availability.refetch()}
        />
      ) : null}
      {online && (!hasScope || availability.data?.enabled === false) ? (
        <StatusBanner
          message={
            hasScope
              ? "New connections are not available for this account right now. You can still disconnect existing connections below."
              : "Choose an accessible business and Store to connect. You can still disconnect existing connections below."
          }
        />
      ) : null}
      {online && hasScope && availability.data?.enabled && !link ? (
        <ActionButton
          onPress={() => void start()}
          isLoading={create.isPending}
          loadingLabel="Preparing link"
          icon="WhatsApp"
        >
          Connect this business
        </ActionButton>
      ) : null}
      {online && link ? (
        <View className="gap-3 rounded-2xl bg-card p-4">
          <Text className="font-bold">
            {terminal
              ? "Link expired or cancelled"
              : claimed
                ? "Confirm your WhatsApp number"
                : status.data?.state === "confirmed"
                  ? "Connection confirmed"
                  : "Send your connection message"}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {terminal
              ? "Start a new private link to continue."
              : claimed
                ? `Is ${claimed} your number? Allow the assistant to access ${auth.profile?.businessName ?? "this business"} · ${auth.profile?.storeName ?? "this Store"} with your current permissions. Access expires after 30 days or 7 days without use. Only confirm your own number.`
                : "Open WhatsApp and send the prepared message to EwaTrade, then return here. A sign-in code never connects an assistant."}
          </Text>
          {!terminal && status.data?.state !== "confirmed" ? (
            <>
              <Text className="text-xs text-muted-foreground">
                Private link expires at{" "}
                {new Date(link.expiresAt).toLocaleTimeString()}.
              </Text>
              {claimed ? (
                <ActionButton
                  disabled={!confirmable}
                  isLoading={confirm.isPending}
                  loadingLabel="Confirming"
                  onPress={() => void approve()}
                >
                  Confirm my number
                </ActionButton>
              ) : (
                <>
                  <ActionButton
                    icon="WhatsApp"
                    onPress={() => void open(false)}
                  >
                    Open WhatsApp
                  </ActionButton>
                  <ActionButton
                    variant="outline"
                    onPress={() => void open(true)}
                  >
                    Copy private link
                  </ActionButton>
                </>
              )}
              <ActionButton
                variant="outline"
                disabled={status.isFetching}
                onPress={() => void status.refetch()}
              >
                Check connection
              </ActionButton>
            </>
          ) : null}
          {status.isError ? (
            <StatusBanner
              tone="warning"
              message="Could not read this connection. Retry, or sign in again and start a fresh link."
            />
          ) : null}
          <ActionButton
            variant="outline"
            onPress={() => {
              lifetime.current += 1
              setLink(null)
              create.reset()
              confirm.reset()
              setNotice(null)
              void connections.refetch()
            }}
          >
            {terminal ? "Start again" : "Close link"}
          </ActionButton>
        </View>
      ) : null}
      <View>
        <SectionHeader title="Your business connections" />
        {online && connections.isPending ? (
          <Text>Loading your connections…</Text>
        ) : null}
        {online && connections.isError ? (
          <StatusBanner
            tone="destructive"
            title="Couldn’t load connections"
            message="Retry with your own signed-in account. You can send Disconnect to EwaTrade in WhatsApp to revoke all its business access."
            actionLabel="Retry"
            onActionPress={() => void connections.refetch()}
          />
        ) : null}
        {data?.length === 0 ? (
          <StatusBanner message="No WhatsApp business connections on this page. Connect a business above to get started." />
        ) : null}
        {data?.map((connection) => (
          <View key={connection.id} className="mb-3 gap-2">
            <ListCard>
              <RecordRow
                avatar={{ icon: "WhatsApp", tint: "mint" }}
                title={connection.maskedSender}
                meta={[
                  `${connection.businessName} · ${connection.storeName}`,
                  connection.active
                    ? `Connected · expires ${new Date(connection.expiresAt).toLocaleDateString()} · idle limit ${new Date(connection.idleExpiresAt).toLocaleDateString()}`
                    : "Expired or disconnected · connect this business again to relink",
                ]}
              />
            </ListCard>
            {connection.active ? (
              <>
                <ActionButton
                  variant="outline"
                  disabled={!online || revoke.isPending}
                  onPress={() => setIdentityId(connection.identityId)}
                >
                  Choose business, Store or chat
                </ActionButton>
                <ActionButton
                  variant="destructive"
                  disabled={!online || revoke.isPending}
                  onPress={() =>
                    withdraw(
                      connection.id,
                      `${connection.maskedSender} · ${connection.businessName} · ${connection.storeName}`,
                    )
                  }
                >
                  Disconnect business
                </ActionButton>
              </>
            ) : connection.tenantId === auth.profile?.businessId &&
              connection.storeId === auth.profile?.storeId &&
              availability.data?.enabled ? (
              <ActionButton
                variant="outline"
                disabled={!online || Boolean(link)}
                isLoading={create.isPending}
                onPress={() => void start()}
              >
                Relink this business
              </ActionButton>
            ) : (
              <Text className="text-sm text-muted-foreground">
                To relink, choose this business and Store in EwaTrade, then
                connect this business above when available.
              </Text>
            )}
          </View>
        ))}
        {online && (pages.length > 0 || data?.length === 20) ? (
          <View className="gap-2">
            {pages.length > 0 ? (
              <ActionButton
                variant="outline"
                disabled={connections.isFetching}
                onPress={() => {
                  setCursor(pages.at(-1))
                  setPages((previous) => previous.slice(0, -1))
                }}
              >
                Previous connections
              </ActionButton>
            ) : null}
            {data?.length === 20 ? (
              <ActionButton
                variant="outline"
                disabled={connections.isFetching}
                onPress={() => {
                  setPages((previous) => [...previous, cursor])
                  setCursor(data.at(-1)?.id)
                }}
              >
                More connections
              </ActionButton>
            ) : null}
          </View>
        ) : null}
      </View>
      {identityId && online ? (
        <WhatsAppScopePicker
          key={identityId}
          identityId={identityId}
          enabled={online}
          onClose={() => setIdentityId(null)}
          onSelected={(selection) => {
            setIdentityId(null)
            setSelectedChat(selection)
            setNotice(
              "WhatsApp chat selected. Your app’s current business and Store have not changed.",
            )
            void connections.refetch()
          }}
        />
      ) : null}
      {selectedChat && online ? (
        <View className="gap-3 rounded-2xl bg-card p-4">
          {selectedChat.tenantId !== auth.profile?.businessId ||
          selectedChat.storeId !== auth.profile?.storeId ? (
            <Text>
              Select the original business and Store in EwaTrade to continue
              this exact saved chat.
            </Text>
          ) : (
            <ActionButton onPress={() => void continueSelectedChat()}>
              {selectedChat.purpose === "PRODUCT_CREATE"
                ? "Open saved item chat on web"
                : selectedChat.purpose === "SETUP"
                  ? "Continue saved Setup chat"
                  : "Continue saved chat in EwaTrade"}
            </ActionButton>
          )}
        </View>
      ) : null}
      <Text className="text-xs text-muted-foreground">
        To end all assistant access for this number, send Disconnect to EwaTrade
        in WhatsApp. Saved business records and chats remain subject to your
        account’s privacy settings.
      </Text>
    </MobileScreen>
  )
}
