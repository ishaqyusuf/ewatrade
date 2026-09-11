import { StatusBanner } from "@/components/mobile/status-banner"
import { useAuthContext } from "@/hooks/use-auth"
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
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useMemo } from "react"
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { CustomerAccountSecurityControl } from "./customer-account-security-control"
import { CustomerConversationListEmpty } from "./customer-conversation-list-empty"
import { isCustomerConversationListUnavailableQaState } from "./customer-conversation-list-empty-presentation"
import { CustomerConversationListItem } from "./customer-conversation-list-item"
import { resolveCustomerConversationListQaItems } from "./customer-conversation-list-qa-state"
import {
  canFetchCustomerConversationListNextPage,
  mergeCustomerConversationAccessItems,
} from "./customer-conversation-list-state"
import { CustomerShellHeader } from "./customer-shell-header"

type ConversationItem =
  RouterOutputs["serviceCommerce"]["mobileStoreConversations"]["items"][number]

export function CustomerConversationListScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { accessProfile, isAuthenticated } = useAuthContext()
  const { qaState } = useLocalSearchParams<{ qaState?: string | string[] }>()
  const trpc = useCustomerTRPC()
  const queryClient = useQueryClient()
  const hasCredential = Boolean(getCustomerConversationSession())
  const hasLinkedCustomerHistory = Boolean(
    isAuthenticated && accessProfile?.hasCustomerHistory,
  )
  const qaUnavailable = isCustomerConversationListUnavailableQaState({
    development: __DEV__,
    qaState,
  })
  const qaItems = useMemo(
    () =>
      resolveCustomerConversationListQaItems({
        development: __DEV__,
        qaState,
      }),
    [qaState],
  )
  const qaPopulated = qaItems !== null
  const qaIsolated = qaUnavailable || qaPopulated
  const guestQuery = useInfiniteQuery(
    trpc.serviceCommerce.mobileStoreConversations.infiniteQueryOptions(
      { pageSize: 25 },
      {
        enabled: hasCredential && !qaIsolated,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const accountQuery = useInfiniteQuery(
    trpc.serviceCommerce.accountStoreConversations.infiniteQueryOptions(
      { pageSize: 25 },
      {
        enabled: hasLinkedCustomerHistory && !qaIsolated,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const credentialRejected = isCustomerCredentialError(guestQuery.error)
  const accountConversations = useMemo(
    () =>
      accountQuery.data?.pages.reduce(
        (items, page) => mergeCustomerConversationPages(items, page.items),
        [] as ConversationItem[],
      ) ?? [],
    [accountQuery.data?.pages],
  )
  const guestConversations = useMemo(
    () =>
      guestQuery.data?.pages.reduce(
        (items, page) => mergeCustomerConversationPages(items, page.items),
        [] as ConversationItem[],
      ) ?? [],
    [guestQuery.data?.pages],
  )
  const conversations = useMemo(() => {
    if (qaItems) {
      return qaItems.map((item) => ({
        ...item,
        access: "guest" as const,
      }))
    }
    return mergeCustomerConversationAccessItems({
      accountItems: accountConversations,
      credentialRejected,
      guestItems: guestConversations,
      qaUnavailable,
    })
  }, [
    accountConversations,
    credentialRejected,
    guestConversations,
    qaItems,
    qaUnavailable,
  ])
  const loading =
    conversations.length === 0 &&
    ((hasCredential && guestQuery.isLoading) ||
      (hasLinkedCustomerHistory && accountQuery.isLoading))
  const failed =
    qaUnavailable ||
    (conversations.length === 0 &&
      ((hasCredential && guestQuery.isError) ||
        (hasLinkedCustomerHistory && accountQuery.isError)))
  const refreshing = guestQuery.isRefetching || accountQuery.isRefetching
  const fetchingNext =
    guestQuery.isFetchingNextPage || accountQuery.isFetchingNextPage

  const refresh = () => {
    if (qaIsolated) return Promise.resolve([])
    return Promise.all([
      ...(hasCredential ? [guestQuery.refetch()] : []),
      ...(hasLinkedCustomerHistory ? [accountQuery.refetch()] : []),
    ])
  }

  useEffect(() => {
    if (qaIsolated) return
    const expiry = guestQuery.data?.pages.at(-1)?.credentialExpiresAt
    if (expiry) updateCustomerConversationExpiry(expiry)
  }, [guestQuery.data?.pages, qaIsolated])

  useEffect(() => {
    if (qaIsolated) return
    if (!isCustomerCredentialError(guestQuery.error)) return
    clearCustomerConversationSession()
    queryClient.removeQueries({
      queryKey: trpc.serviceCommerce.mobileStoreConversations.queryKey(),
    })
  }, [guestQuery.error, qaIsolated, queryClient, trpc])

  useEffect(() => {
    if (qaIsolated) return
    if (!isCustomerCredentialError(accountQuery.error)) return

    queryClient.removeQueries({
      queryKey: trpc.serviceCommerce.accountStoreConversations.queryKey(),
    })
    if (!hasCredential) router.replace("/")
  }, [accountQuery.error, hasCredential, qaIsolated, queryClient, router, trpc])

  return (
    <View className="flex-1 bg-background">
      <CustomerShellHeader
        accountControl={
          hasLinkedCustomerHistory ? (
            <CustomerAccountSecurityControl />
          ) : undefined
        }
      />
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
            error={failed}
            loading={loading}
            onRetry={() => void refresh()}
            retrying={refreshing}
          />
        }
        ListHeaderComponent={
          (guestQuery.isError || accountQuery.isError) &&
          conversations.length > 0 ? (
            <View className="p-4">
              <StatusBanner
                actionLabel="Retry"
                message="Showing saved results. New activity could not be loaded."
                onActionPress={() => void refresh()}
                tone="warning"
              />
            </View>
          ) : null
        }
        ListFooterComponent={
          fetchingNext ? (
            <ActivityIndicator
              accessibilityLabel="Loading more conversations"
              className="my-5"
            />
          ) : null
        }
        onEndReached={() => {
          if (
            canFetchCustomerConversationListNextPage({
              hasNextPage: guestQuery.hasNextPage,
              isFetchingNextPage: guestQuery.isFetchingNextPage,
              qaIsolated,
            })
          )
            void guestQuery.fetchNextPage()
          if (
            canFetchCustomerConversationListNextPage({
              hasNextPage: accountQuery.hasNextPage,
              isFetchingNextPage: accountQuery.isFetchingNextPage,
              qaIsolated,
            })
          )
            void accountQuery.fetchNextPage()
        }}
        onEndReachedThreshold={0.35}
        refreshControl={
          <RefreshControl
            enabled={!qaIsolated}
            onRefresh={() => void refresh()}
            refreshing={refreshing && !fetchingNext}
          />
        }
        renderItem={({ item }) => (
          <CustomerConversationListItem
            lastActivityAt={item.lastActivityAt}
            lastMessage={item.lastMessage}
            onPress={() => {
              if (qaPopulated) return
              router.push({
                pathname: "/(customer)/conversations/[conversationId]",
                params: {
                  conversationId: item.conversationId,
                  access: item.access,
                  publicToken: item.publicToken,
                },
              })
            }}
            state={item.state}
            storeAvatar={item.storeAvatar}
            storeName={item.storeName}
            unreadStoreMessages={item.unreadStoreMessages}
          />
        )}
      />
    </View>
  )
}
