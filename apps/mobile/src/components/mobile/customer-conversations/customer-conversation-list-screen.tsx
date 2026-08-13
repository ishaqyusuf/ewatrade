import { StatusBanner } from "@/components/mobile/status-banner"
import {
  isCustomerCredentialError,
  mergeCustomerConversationPages,
} from "@/lib/customer-conversation-state"
import {
  clearCustomerConversationSession,
  getCustomerConversationSession,
  updateCustomerConversationExpiry,
} from "@/lib/customer-conversation-store"
import { useCustomerTRPC } from "@/trpc/customer-client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useEffect, useMemo } from "react"
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { CustomerConversationListEmpty } from "./customer-conversation-list-empty"
import { CustomerConversationListItem } from "./customer-conversation-list-item"
import { CustomerShellHeader } from "./customer-shell-header"

type ConversationItem =
  RouterOutputs["serviceCommerce"]["mobileStoreConversations"]["items"][number]

export function CustomerConversationListScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const trpc = useCustomerTRPC()
  const queryClient = useQueryClient()
  const hasCredential = Boolean(getCustomerConversationSession())
  const query = useInfiniteQuery(
    trpc.serviceCommerce.mobileStoreConversations.infiniteQueryOptions(
      { pageSize: 25 },
      {
        enabled: hasCredential,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const conversations = useMemo(
    () =>
      query.data?.pages.reduce(
        (items, page) => mergeCustomerConversationPages(items, page.items),
        [] as ConversationItem[],
      ) ?? [],
    [query.data?.pages],
  )
  const credentialRejected = isCustomerCredentialError(query.error)

  useEffect(() => {
    const expiry = query.data?.pages.at(-1)?.credentialExpiresAt
    if (expiry) updateCustomerConversationExpiry(expiry)
  }, [query.data?.pages])

  useEffect(() => {
    if (!isCustomerCredentialError(query.error)) return
    clearCustomerConversationSession()
    queryClient.clear()
  }, [query.error, queryClient])

  return (
    <View className="flex-1 bg-background">
      <CustomerShellHeader />
      <FlatList
        contentContainerStyle={{
          flexGrow: conversations.length === 0 ? 1 : undefined,
          paddingBottom: Math.max(insets.bottom + 24, 40),
        }}
        data={conversations}
        keyExtractor={(item) => item.conversationId}
        ListEmptyComponent={
          <CustomerConversationListEmpty
            credentialRejected={credentialRejected}
            error={query.isError}
            loading={query.isLoading}
            onRetry={() => void query.refetch()}
          />
        }
        ListHeaderComponent={
          query.isError && conversations.length > 0 ? (
            <View className="p-4">
              <StatusBanner
                actionLabel="Retry"
                message="Showing saved results. New activity could not be loaded."
                onActionPress={() => void query.refetch()}
                tone="warning"
              />
            </View>
          ) : null
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <ActivityIndicator
              accessibilityLabel="Loading more conversations"
              className="my-5"
            />
          ) : null
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            void query.fetchNextPage()
          }
        }}
        onEndReachedThreshold={0.35}
        refreshControl={
          <RefreshControl
            onRefresh={() => void query.refetch()}
            refreshing={query.isRefetching && !query.isFetchingNextPage}
          />
        }
        renderItem={({ item }) => (
          <CustomerConversationListItem
            lastActivityAt={item.lastActivityAt}
            lastMessage={item.lastMessage}
            onPress={() =>
              router.push({
                pathname: "/(customer)/conversations/[conversationId]",
                params: {
                  conversationId: item.conversationId,
                  publicToken: item.publicToken,
                },
              })
            }
            state={item.state}
            storeAvatar={item.storeAvatar}
            storeName={item.storeName}
          />
        )}
      />
    </View>
  )
}
