"use client"

import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import { conversationAppLink } from "@ewatrade/assistant/channels/conversation-links"
import { workflowConversationAppLink } from "@ewatrade/assistant/channels/workflow"
import { Button } from "@ewatrade/ui"
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import {
  WhatsAppScopePicker,
  type WhatsAppSelectedChat,
} from "./whatsapp-scope-picker"

// Use shared static route rules, then navigate relatively on this dashboard.
const navigationOrigin = "https://dash.ewatrade.com"

export function WhatsAppConnections({ actorUserId }: { actorUserId: string }) {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const generation = useRef(getDataCacheGeneration())
  const currentActor = useRef(actorUserId)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [pickerId, setPickerId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [selectedChat, setSelectedChat] = useState<{
    selection: WhatsAppSelectedChat
    actorUserId: string
    selectedAt: number
  } | null>(null)
  const [mountedAt] = useState(Date.now())
  const [now, setNow] = useState(Date.now())
  const connections = useInfiniteQuery({
    queryKey: [
      ...trpc.assistantChannels.whatsAppConnections.queryKey(),
      actorUserId,
      "pages",
    ],
    queryFn: ({ pageParam, signal }) =>
      client.assistantChannels.whatsAppConnections.query(
        pageParam ? { cursor: pageParam } : undefined,
        { signal },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.length === 20 ? last.at(-1)?.id : undefined,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchInterval: 30_000,
  })
  const revoke = useMutation(
    trpc.assistantChannels.revokeWhatsApp.mutationOptions({ gcTime: 0 }),
  )
  const context = useQuery({
    queryKey: [
      "whatsapp-selected-chat-context",
      actorUserId,
      generation.current,
      selectedChat?.selection.conversationId,
    ],
    queryFn: ({ signal }) => client.tenant.current.query(undefined, { signal }),
    enabled:
      Boolean(selectedChat) && generation.current === getDataCacheGeneration(),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchInterval: 15_000,
  })
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (currentActor.current === actorUserId) return
    currentActor.current = actorUserId
    setSelectedChat(null)
    setPickerId(null)
  }, [actorUserId])
  useEffect(() => {
    if (selectedChat) void context.refetch()
  }, [selectedChat, context.refetch])
  const contextFresh =
    selectedChat &&
    context.isSuccess &&
    context.isFetchedAfterMount &&
    context.dataUpdatedAt >= selectedChat.selectedAt &&
    !context.isFetching &&
    !context.isPaused &&
    generation.current === getDataCacheGeneration() &&
    selectedChat.actorUserId === actorUserId &&
    context.data.actorUserId === actorUserId
  const selectedScope =
    contextFresh && context.data.activeStore
      ? {
          tenantId: context.data.tenant.id,
          storeId: context.data.activeStore.id,
        }
      : null
  const selectedHref =
    selectedChat && selectedScope
      ? selectedChat.selection.purpose === "GENERAL"
        ? conversationAppLink(
            {
              purpose: "GENERAL",
              conversationId: selectedChat.selection.conversationId,
              origin: {
                tenantId: selectedChat.selection.tenantId,
                storeId: selectedChat.selection.storeId,
              },
            },
            { trustedAppOrigin: navigationOrigin, currentScope: selectedScope },
          )?.href
        : workflowConversationAppLink(
            {
              purpose: selectedChat.selection.purpose,
              conversationId: selectedChat.selection.conversationId,
              origin: {
                tenantId: selectedChat.selection.tenantId,
                storeId: selectedChat.selection.storeId,
              },
            },
            { trustedAppOrigin: navigationOrigin, currentScope: selectedScope },
          )
      : undefined
  const selectedPath = selectedHref ? new URL(selectedHref) : null
  const fresh =
    connections.isSuccess &&
    connections.isFetchedAfterMount &&
    connections.dataUpdatedAt >= mountedAt &&
    !connections.isPaused &&
    generation.current === getDataCacheGeneration()
  const rows = fresh ? connections.data.pages.flat() : []
  const needsAccountSession =
    connections.error instanceof TRPCClientError &&
    ["FORBIDDEN", "UNAUTHORIZED"].includes(connections.error.data?.code ?? "")
  const remove = async (grantId: string) => {
    setError("")
    setNotice("")
    try {
      await revoke.mutateAsync({ grantId })
      if (generation.current !== getDataCacheGeneration()) return
      setConfirmId(null)
      setPickerId(null)
      setSelectedChat(null)
      setNotice("WhatsApp access removed for this business.")
      await connections.refetch()
    } catch {
      setError(
        "Could not remove access. Try again. If your session expired, sign in again.",
      )
    }
  }
  return (
    <section
      className="grid gap-4"
      aria-labelledby="whatsapp-connections-title"
    >
      <div>
        <h2 id="whatsapp-connections-title" className="font-medium">
          Your WhatsApp access
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Remove access here even if you no longer have access to a business or
          Store. To reconnect, choose that business and Store in EwaTrade, then
          create a new link above.
        </p>
      </div>
      {connections.isPending ? (
        <output className="text-sm">Loading connections…</output>
      ) : null}
      {connections.isError || connections.isPaused ? (
        <div className="grid justify-items-start gap-2">
          <p role="alert" className="text-sm">
            {needsAccountSession
              ? "Sign in with your own account to manage WhatsApp access. Demo and restricted sessions cannot manage personal connections."
              : "Could not load your connections."}
          </p>
          {!needsAccountSession ? (
            <Button
              variant="outline"
              onClick={() => void connections.refetch()}
            >
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
      {selectedChat ? (
        selectedPath ? (
          <Link
            href={`${selectedPath.pathname}${selectedPath.search}`}
            prefetch={false}
            className="text-sm underline"
          >
            Open selected{" "}
            {selectedChat.selection.purpose === "SETUP"
              ? "Setup"
              : selectedChat.selection.purpose === "PRODUCT_CREATE"
                ? "Product"
                : "saved"}{" "}
            chat in EwaTrade
          </Link>
        ) : context.isPending || context.isFetching ? (
          <output className="text-sm">Checking selected chat access…</output>
        ) : (
          <div className="grid justify-items-start gap-2">
            <p className="text-sm text-muted-foreground">
              Select the original business and Store in EwaTrade, then check
              again to open the selected chat. Refresh this page if your account
              or Store changed.
            </p>
            <Button variant="ghost" onClick={() => void context.refetch()}>
              Check chat access again
            </Button>
          </div>
        )
      ) : null}
      {fresh && !rows.length ? (
        <p className="border p-5 text-sm text-muted-foreground">
          You have no WhatsApp assistant connections.
        </p>
      ) : null}
      {rows.map((row) => {
        const active =
          row.active &&
          row.expiresAt.getTime() > now &&
          row.idleExpiresAt.getTime() > now
        return (
          <article key={row.id} className="grid gap-3 border p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-medium">{row.maskedSender}</h3>
                <p className="mt-1 text-sm">
                  {row.businessName} · {row.storeName ?? "Previous Store"}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {active ? "Connected" : "Inactive or expired"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Access ends {row.expiresAt.toLocaleString()}; inactive access ends{" "}
              {row.idleExpiresAt.toLocaleString()}.
            </p>
            {active ? (
              <Button
                variant="outline"
                className="justify-self-start"
                onClick={() => setPickerId(pickerId === row.id ? null : row.id)}
              >
                {pickerId === row.id
                  ? "Close chat choices"
                  : "Choose WhatsApp chat"}
              </Button>
            ) : null}
            {pickerId === row.id && active ? (
              <WhatsAppScopePicker
                key={`${row.id}:${row.generation}:${row.identityGeneration}:${row.selectionGeneration}`}
                identityId={row.identityId}
                onSelected={(selection) => {
                  setSelectedChat({
                    selection,
                    actorUserId,
                    selectedAt: Date.now(),
                  })
                  setPickerId(null)
                  setNotice(
                    "Chat selected. Your next WhatsApp messages use this chat. Follow its instructions for confirmation or complete review in EwaTrade.",
                  )
                  void connections.refetch()
                }}
              />
            ) : null}
            {confirmId === row.id ? (
              <div className="grid justify-items-start gap-3 border-t pt-3">
                <p className="text-sm">
                  Remove {row.maskedSender}’s access to {row.businessName}?
                  Pending assistant work for this business will stop.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={revoke.isPending}
                    onClick={() => void remove(row.id)}
                  >
                    {revoke.isPending ? "Removing…" : "Remove access"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={revoke.isPending}
                    onClick={() => setConfirmId(null)}
                  >
                    Keep access
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="justify-self-start"
                disabled={revoke.isPending}
                onClick={() => {
                  setError("")
                  setConfirmId(row.id)
                }}
              >
                Remove business access
              </Button>
            )}
          </article>
        )
      })}
      {fresh && connections.hasNextPage ? (
        <Button
          variant="outline"
          disabled={connections.isFetchingNextPage}
          onClick={() => void connections.fetchNextPage()}
        >
          {connections.isFetchingNextPage ? "Loading…" : "More connections"}
        </Button>
      ) : null}
      {notice ? <output className="text-sm">{notice}</output> : null}
      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}
    </section>
  )
}
