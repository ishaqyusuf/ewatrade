import { ActionButton } from "@/components/mobile/action-button"
import { ListCard, RecordRow } from "@/components/mobile/green-till/kit"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import type { WhatsAppScopeSelection } from "@ewatrade/assistant/channels/whatsapp"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useEffect, useRef, useState } from "react"

type GrantChoice = { grantId: string; name: string }
type StoreChoice = { id: string; name: string }

export function WhatsAppScopePicker({
  identityId,
  enabled,
  onClose,
  onSelected,
}: {
  identityId: string
  enabled: boolean
  onClose: () => void
  onSelected: (selection: {
    conversationId: string
    tenantId: string
    storeId: string
    purpose: "GENERAL" | "SETUP" | "PRODUCT_CREATE"
  }) => void
}) {
  const trpc = useTRPC()
  const auth = useAuthContext()
  const [grant, setGrant] = useState<GrantChoice | null>(null)
  const [store, setStore] = useState<StoreChoice | null>(null)
  const [businessCursor, setBusinessCursor] = useState<string>()
  const [storeCursor, setStoreCursor] = useState<string>()
  const [chatCursor, setChatCursor] = useState<string>()
  const [attempt, setAttempt] = useState<WhatsAppScopeSelection | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const businesses = useQuery(
    trpc.assistantChannels.whatsAppBusinesses.queryOptions(
      { identityId, cursor: businessCursor },
      { enabled: enabled && !grant, retry: false, gcTime: 0, staleTime: 0 },
    ),
  )
  const stores = useQuery(
    trpc.assistantChannels.whatsAppStores.queryOptions(
      { identityId, grantId: grant?.grantId ?? "none", cursor: storeCursor },
      {
        enabled: enabled && Boolean(grant) && !store,
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    ),
  )
  const chats = useQuery(
    trpc.assistantChannels.whatsAppChats.queryOptions(
      {
        identityId,
        grantId: grant?.grantId ?? "none",
        storeId: store?.id ?? "none",
        cursor: chatCursor,
      },
      {
        enabled: enabled && Boolean(grant && store),
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    ),
  )
  const select = useMutation(
    trpc.assistantChannels.selectWhatsAppScope.mutationOptions({ gcTime: 0 }),
  )
  const pending = select.isPending
  const refresh = () => {
    if (pending || !enabled) return
    setAttempt(null)
    setNotice(null)
    if (store) void chats.refetch()
    else if (grant) void stores.refetch()
    else void businesses.refetch()
  }
  const submit = async (input: WhatsAppScopeSelection) => {
    if (!enabled || pending) return
    const token = auth.token
    const generation = getDataCacheGeneration()
    const current = () =>
      mounted.current &&
      getSession()?.token === token &&
      getDataCacheGeneration() === generation &&
      !useOperationalModeStore.getState().isOfflineMode
    setAttempt(input)
    setNotice(null)
    try {
      const result = await select.mutateAsync(input)
      if (!current()) return
      if (result.state === "superseded") {
        setAttempt(null)
        setNotice(
          "This choice was replaced elsewhere. Refresh before choosing again.",
        )
        void chats.refetch()
      } else onSelected(result)
    } catch {
      if (current())
        setNotice(
          "The choice could not be confirmed. Retry the same choice, or refresh to check your current access. No other chat is selected automatically.",
        )
    }
  }
  const choose = (action: WhatsAppScopeSelection["action"]) => {
    if (!chats.data || !grant || !store || attempt || pending) return
    void submit({
      identityId,
      grantId: grant.grantId,
      storeId: store.id,
      expectedIdentityGeneration: chats.data.identityGeneration,
      expectedSelectionGeneration: chats.data.selectionGeneration,
      expectedGrantGeneration: chats.data.grantGeneration,
      requestId: Crypto.randomUUID(),
      action,
    })
  }
  const active = store ? chats : grant ? stores : businesses
  return (
    <View
      className="gap-3 rounded-2xl bg-card p-4"
      testID="assistant-whatsapp-scope-picker"
    >
      <Text className="text-base font-bold">
        {store
          ? "Choose your chat"
          : grant
            ? "Choose a Store"
            : "Choose a business"}
      </Text>
      <Text className="text-sm text-muted-foreground">
        {grant
          ? `${grant.name}${store ? ` · ${store.name}` : ""}`
          : "Only businesses you explicitly connected to this number appear here."}
      </Text>
      {active.isPending ? <Text>Loading choices…</Text> : null}
      {active.isError ? (
        <StatusBanner
          tone="warning"
          message="Choices are unavailable or your access changed. Retry, or close and reconnect if consent expired."
          actionLabel="Retry"
          actionDisabled={pending || !enabled}
          onActionPress={refresh}
        />
      ) : null}
      {notice ? <StatusBanner tone="warning" message={notice} /> : null}
      {!grant && businesses.data ? (
        <>
          {businesses.data.choices.length === 0 ? (
            <Text>No eligible connected business on this page.</Text>
          ) : (
            <ListCard>
              {businesses.data.choices.map((choice) => (
                <RecordRow
                  key={choice.grantId}
                  avatar={{ icon: "Building2", tint: "sky" }}
                  title={choice.name}
                  onPress={() => {
                    setGrant(choice)
                    setStoreCursor(undefined)
                    setNotice(null)
                  }}
                />
              ))}
            </ListCard>
          )}
          {businesses.data.nextCursor ? (
            <ActionButton
              variant="outline"
              onPress={() => setBusinessCursor(businesses.data.nextCursor)}
            >
              More businesses
            </ActionButton>
          ) : null}
          {businessCursor ? (
            <ActionButton
              variant="outline"
              onPress={() => setBusinessCursor(undefined)}
            >
              First businesses
            </ActionButton>
          ) : null}
        </>
      ) : null}
      {grant && !store && stores.data ? (
        <>
          {stores.data.choices.length === 0 ? (
            <Text>No accessible Store on this page.</Text>
          ) : (
            <ListCard>
              {stores.data.choices.map((choice) => (
                <RecordRow
                  key={choice.id}
                  avatar={{ icon: "Store", tint: "mint" }}
                  title={choice.name}
                  onPress={() => {
                    setStore(choice)
                    setChatCursor(undefined)
                    setAttempt(null)
                    setNotice(null)
                  }}
                />
              ))}
            </ListCard>
          )}
          {stores.data.nextCursor ? (
            <ActionButton
              variant="outline"
              onPress={() => setStoreCursor(stores.data.nextCursor)}
            >
              More Stores
            </ActionButton>
          ) : null}
          {storeCursor ? (
            <ActionButton
              variant="outline"
              onPress={() => setStoreCursor(undefined)}
            >
              First Stores
            </ActionButton>
          ) : null}
        </>
      ) : null}
      {grant && store && chats.data ? (
        <>
          <Text className="text-sm text-muted-foreground">
            A new chat starts a separate General conversation. Continue a saved
            Setup chat here, or open its saved item chat on the web. Keep the
            original business and Store selected.
          </Text>
          <ActionButton
            disabled={!enabled || Boolean(attempt)}
            isLoading={pending}
            onPress={() => choose({ kind: "new" })}
          >
            Start new General chat
          </ActionButton>
          {chats.data.choices.length === 0 ? (
            <Text>No saved chat on this page.</Text>
          ) : (
            <ListCard>
              {chats.data.choices.map((chat) => (
                <RecordRow
                  key={chat.id}
                  avatar={{ icon: "MessageCircle", tint: "sky" }}
                  title={
                    chat.purpose === "GENERAL"
                      ? "General chat"
                      : chat.purpose === "SETUP"
                        ? "Setup chat"
                        : "Item chat · web continuation"
                  }
                  meta={`Updated ${new Date(chat.updatedAt).toLocaleString()}`}
                  onPress={
                    pending || attempt
                      ? undefined
                      : () =>
                          choose({
                            kind: "resume",
                            conversationId: chat.id,
                            purpose: chat.purpose,
                          })
                  }
                />
              ))}
            </ListCard>
          )}
          {chats.data.nextCursor ? (
            <ActionButton
              variant="outline"
              disabled={pending || Boolean(attempt)}
              onPress={() => setChatCursor(chats.data.nextCursor)}
            >
              More chats
            </ActionButton>
          ) : null}
          {chatCursor ? (
            <ActionButton
              variant="outline"
              disabled={pending || Boolean(attempt)}
              onPress={() => setChatCursor(undefined)}
            >
              First chats
            </ActionButton>
          ) : null}
          {attempt && !pending ? (
            <ActionButton
              disabled={!enabled}
              onPress={() => void submit(attempt)}
            >
              Retry same choice
            </ActionButton>
          ) : null}
        </>
      ) : null}
      <ActionButton
        variant="outline"
        disabled={pending || !enabled}
        onPress={refresh}
      >
        Refresh choices
      </ActionButton>
      {grant ? (
        <ActionButton
          variant="outline"
          disabled={pending}
          onPress={() => {
            setStore(null)
            setGrant(null)
            setAttempt(null)
            setNotice(null)
          }}
        >
          Choose another business
        </ActionButton>
      ) : null}
      <ActionButton variant="outline" disabled={pending} onPress={onClose}>
        Close choices
      </ActionButton>
    </View>
  )
}
