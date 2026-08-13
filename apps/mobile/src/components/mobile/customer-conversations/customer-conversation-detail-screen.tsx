import { EmptyState } from "@/components/mobile/empty-state"
import { View } from "@/components/ui/view"
import { isCustomerCredentialError } from "@/lib/customer-conversation-state"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { useEffect, useRef } from "react"
import { FlatList, RefreshControl } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { CustomerConversationComposer } from "./customer-conversation-composer"
import { CustomerConversationNotice } from "./customer-conversation-notice"
import { CustomerConversationRouteState } from "./customer-conversation-route-state"
import { CustomerMessage } from "./customer-message"
import { CustomerRequestChoice } from "./customer-request-choice"
import { CustomerShellHeader } from "./customer-shell-header"
import { useCustomerConversationDetail } from "./use-customer-conversation-detail"

type Message =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]["messages"][number]

export function CustomerConversationDetailScreen({
  bootstrap = false,
  conversationId = null,
  publicToken,
  targetCredentialToken = null,
  transferToken = null,
}: {
  bootstrap?: boolean
  conversationId?: string | null
  publicToken: string | null
  targetCredentialToken?: string | null
  transferToken?: string | null
}) {
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList<Message>>(null)
  const detail = useCustomerConversationDetail({
    bootstrap,
    conversationId,
    publicToken,
    targetCredentialToken,
    transferToken,
  })
  const timeline = detail.timeline.data
  const messages = mergeMessages(detail.olderMessages, timeline?.messages ?? [])
  const activeRequests =
    timeline?.requests.filter((request) => request.lifecycle === "active") ?? []
  const unavailable = !publicToken || (!bootstrap && !conversationId)
  const loading =
    detail.opening || detail.transferring || detail.timeline.isLoading
  const credentialRejected = isCustomerCredentialError(detail.timeline.error)
  const newestSequence = messages.at(-1)?.sequence ?? 0

  useEffect(() => {
    if (newestSequence === 0) return
    requestAnimationFrame(() =>
      listRef.current?.scrollToEnd({ animated: true }),
    )
  }, [newestSequence])

  return (
    <View className="flex-1 bg-background">
      <CustomerShellHeader
        backToList
        storeName={timeline?.conversation.storeName}
      />
      {!timeline ? (
        <CustomerConversationRouteState
          credentialRejected={credentialRejected}
          loading={loading}
          message={detail.notice}
          onRetry={() =>
            void (bootstrap ? detail.openStore() : detail.timeline.refetch())
          }
          unavailable={unavailable}
        />
      ) : (
        <>
          <FlatList
            ref={listRef}
            contentContainerStyle={{
              flexGrow: messages.length === 0 ? 1 : undefined,
              gap: 12,
              justifyContent: messages.length === 0 ? "center" : undefined,
              paddingBottom: Math.max(insets.bottom + 170, 190),
              paddingHorizontal: 16,
              paddingTop: 16,
            }}
            data={messages}
            keyExtractor={(message) => message.id}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <EmptyState
                icon="Mail"
                message="Send a message, then choose which Request it belongs to. No sign-up is required."
                title="What can the Store help you with?"
              />
            }
            ListHeaderComponent={
              <CustomerConversationNotice
                canLoadOlder={detail.nextCursor !== null}
                loadingOlder={detail.loadingOlder}
                message={
                  detail.notice ??
                  (detail.timeline.isError
                    ? "Unable to refresh. Messages already shown remain available."
                    : null)
                }
                onDismiss={() => detail.setNotice(null)}
                onLoadOlder={() => void detail.loadOlder()}
                requests={timeline.requests}
              />
            }
            refreshControl={
              <RefreshControl
                onRefresh={() => void detail.timeline.refetch()}
                refreshing={detail.timeline.isRefetching}
              />
            }
            renderItem={({ item }) => (
              <View className="gap-2">
                <CustomerMessage message={item} />
                {item.author.kind === "customer" && !item.request ? (
                  <CustomerRequestChoice
                    disabled={
                      detail.selecting ||
                      timeline.conversation.state !== "active"
                    }
                    onSelect={(target) =>
                      void detail.selectRequest(item.id, target)
                    }
                    requestKinds={timeline.availableRequestKinds}
                    requests={timeline.requests}
                  />
                ) : null}
              </View>
            )}
          />
          <CustomerConversationComposer
            disabled={timeline.conversation.state !== "active"}
            draft={detail.draft}
            hasActiveRequest={activeRequests.length > 0}
            onChangeDraft={detail.setDraft}
            onSend={() => void detail.sendText()}
            onToggleRequestIntent={() =>
              detail.setStartingNewRequest(!detail.startingNewRequest)
            }
            sending={detail.sending}
            startingNewRequest={detail.startingNewRequest}
          />
        </>
      )}
    </View>
  )
}

function mergeMessages(older: Message[], latest: Message[]) {
  const messages = new Map<string, Message>()
  for (const message of [...older, ...latest]) messages.set(message.id, message)
  return [...messages.values()].sort((a, b) => a.sequence - b.sequence)
}
