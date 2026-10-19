"use client"

import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { WhatsAppScopeSelection } from "@ewatrade/assistant/channels/whatsapp"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRef, useState } from "react"

export type WhatsAppSelectedChat = Pick<
  Extract<
    RouterOutputs["assistantChannels"]["selectWhatsAppScope"],
    { state: "selected" }
  >,
  "purpose" | "conversationId" | "tenantId" | "storeId"
>

export function WhatsAppScopePicker({
  identityId,
  onSelected,
}: {
  identityId: string
  onSelected: (selection: WhatsAppSelectedChat) => void
}) {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const [visit] = useState(() => crypto.randomUUID())
  const generation = useRef(getDataCacheGeneration())
  const [businessCursor, setBusinessCursor] = useState<string>()
  const [storeCursor, setStoreCursor] = useState<string>()
  const [chatCursor, setChatCursor] = useState<string>()
  const [grantId, setGrantId] = useState("")
  const [storeId, setStoreId] = useState("")
  const [error, setError] = useState("")
  const attempt = useRef<{ key: string; requestId: string } | null>(null)
  const businesses = useQuery({
    queryKey: [
      "whatsapp-scope-businesses",
      identityId,
      businessCursor,
      visit,
      generation.current,
    ],
    queryFn: ({ signal }) =>
      client.assistantChannels.whatsAppBusinesses.query(
        {
          identityId,
          cursor: businessCursor,
        },
        { signal },
      ),
    enabled: generation.current === getDataCacheGeneration(),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })
  const stores = useQuery({
    queryKey: [
      "whatsapp-scope-stores",
      identityId,
      grantId,
      storeCursor,
      visit,
      generation.current,
    ],
    queryFn: ({ signal }) =>
      client.assistantChannels.whatsAppStores.query(
        {
          identityId,
          grantId: grantId || "none",
          cursor: storeCursor,
        },
        { signal },
      ),
    enabled:
      Boolean(grantId) && generation.current === getDataCacheGeneration(),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })
  const chats = useQuery({
    queryKey: [
      "whatsapp-scope-chats",
      identityId,
      grantId,
      storeId,
      chatCursor,
      visit,
      generation.current,
    ],
    queryFn: ({ signal }) =>
      client.assistantChannels.whatsAppChats.query(
        {
          identityId,
          grantId: grantId || "none",
          storeId: storeId || "none",
          cursor: chatCursor,
        },
        { signal },
      ),
    enabled:
      Boolean(grantId && storeId) &&
      generation.current === getDataCacheGeneration(),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })
  const select = useMutation(
    trpc.assistantChannels.selectWhatsAppScope.mutationOptions({ gcTime: 0 }),
  )
  const businessFresh =
    businesses.isSuccess &&
    businesses.isFetchedAfterMount &&
    !businesses.isFetching &&
    !businesses.isPaused
  const storeFresh =
    stores.isSuccess &&
    stores.isFetchedAfterMount &&
    !stores.isFetching &&
    !stores.isPaused
  const chatFresh =
    chats.isSuccess &&
    chats.isFetchedAfterMount &&
    !chats.isFetching &&
    !chats.isPaused
  const selectedBusiness = businessFresh
    ? businesses.data.choices.find((row) => row.grantId === grantId)
    : null
  const selectedStore = storeFresh
    ? stores.data.choices.find((row) => row.id === storeId)
    : null
  const ready =
    selectedBusiness &&
    selectedStore &&
    chatFresh &&
    chats.data.identityGeneration === stores.data?.identityGeneration &&
    chats.data.selectionGeneration === stores.data?.selectionGeneration &&
    chats.data.grantGeneration === stores.data?.grantGeneration &&
    generation.current === getDataCacheGeneration()
  const choose = async (action: WhatsAppScopeSelection["action"]) => {
    if (!ready || !chats.data) return
    setError("")
    const input = {
      identityId,
      grantId,
      storeId,
      expectedIdentityGeneration: chats.data.identityGeneration,
      expectedGrantGeneration: chats.data.grantGeneration,
      expectedSelectionGeneration: chats.data.selectionGeneration,
      action,
    }
    const key = JSON.stringify(input)
    if (attempt.current?.key !== key)
      attempt.current = { key, requestId: crypto.randomUUID() }
    try {
      const result = await select.mutateAsync({
        ...input,
        requestId: attempt.current.requestId,
      })
      if (generation.current !== getDataCacheGeneration()) return
      if (result.state === "superseded") {
        attempt.current = null
        refresh()
        setError(
          "Your WhatsApp chat selection changed elsewhere. Choose again from the refreshed businesses and Stores.",
        )
        return
      }
      onSelected({
        purpose: result.purpose,
        conversationId: result.conversationId,
        tenantId: result.tenantId,
        storeId: result.storeId,
      })
    } catch {
      if (generation.current === getDataCacheGeneration())
        setError(
          "Could not select this chat. Retry the same choice, or refresh choices if your access changed.",
        )
    }
  }
  const refresh = () => {
    setGrantId("")
    setStoreId("")
    setBusinessCursor(undefined)
    setStoreCursor(undefined)
    setChatCursor(undefined)
    setError("")
    void businesses.refetch()
  }
  return (
    <div className="grid gap-3 border-t pt-4">
      <p className="text-sm text-muted-foreground">
        Choose where your next WhatsApp messages go. Existing chats and drafts
        keep their original business and Store.
      </p>
      {businesses.isPending ? (
        <output className="text-sm">Loading businesses…</output>
      ) : null}
      {businessFresh ? (
        <div className="grid gap-2">
          <label htmlFor={`business-${visit}`} className="text-sm">
            Business
          </label>
          <select
            id={`business-${visit}`}
            className="border bg-background p-2 text-sm"
            value={grantId}
            disabled={select.isPending}
            onChange={(event) => {
              setGrantId(event.target.value)
              setStoreId("")
              setStoreCursor(undefined)
              setChatCursor(undefined)
              setError("")
            }}
          >
            <option value="">Choose a business</option>
            {businesses.data.choices.map((row) => (
              <option key={row.grantId} value={row.grantId}>
                {row.name}
              </option>
            ))}
          </select>
          {!businesses.data.choices.length ? (
            <p className="text-sm text-muted-foreground">
              No businesses are currently available for this connection.
            </p>
          ) : null}
          {businesses.data.nextCursor ? (
            <Button
              variant="ghost"
              onClick={() => {
                setBusinessCursor(businesses.data.nextCursor)
                setGrantId("")
                setStoreId("")
              }}
            >
              More businesses
            </Button>
          ) : null}
          {businessCursor ? (
            <Button variant="ghost" onClick={refresh}>
              First businesses
            </Button>
          ) : null}
        </div>
      ) : null}
      {grantId && stores.isPending ? (
        <output className="text-sm">Loading Stores…</output>
      ) : null}
      {selectedBusiness && storeFresh ? (
        <div className="grid gap-2">
          <label htmlFor={`store-${visit}`} className="text-sm">
            Store
          </label>
          <select
            id={`store-${visit}`}
            className="border bg-background p-2 text-sm"
            value={storeId}
            disabled={select.isPending}
            onChange={(event) => {
              setStoreId(event.target.value)
              setChatCursor(undefined)
              setError("")
            }}
          >
            <option value="">Choose a Store</option>
            {stores.data.choices.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
          {!stores.data.choices.length ? (
            <p className="text-sm text-muted-foreground">
              No Stores are currently accessible.
            </p>
          ) : null}
          {stores.data.nextCursor ? (
            <Button
              variant="ghost"
              onClick={() => {
                setStoreCursor(stores.data.nextCursor)
                setStoreId("")
              }}
            >
              More Stores
            </Button>
          ) : null}
          {storeCursor ? (
            <Button
              variant="ghost"
              onClick={() => {
                setStoreCursor(undefined)
                setStoreId("")
              }}
            >
              First Stores
            </Button>
          ) : null}
        </div>
      ) : null}
      {selectedStore && chats.isPending ? (
        <output className="text-sm">Loading chats…</output>
      ) : null}
      {ready ? (
        <div className="grid justify-items-start gap-2">
          <p className="text-sm">
            Next WhatsApp chat:{" "}
            <strong>
              {selectedBusiness?.name} · {selectedStore?.name}
            </strong>
          </p>
          <Button
            disabled={select.isPending}
            onClick={() => void choose({ kind: "new" })}
          >
            {select.isPending ? "Selecting…" : "Start a new general chat"}
          </Button>
          {chats.data.choices.map((row) => (
            <Button
              key={row.id}
              variant="outline"
              disabled={select.isPending}
              onClick={() =>
                void choose({
                  kind: "resume",
                  conversationId: row.id,
                  purpose: row.purpose,
                })
              }
            >
              Continue{" "}
              {row.purpose === "GENERAL"
                ? "general"
                : row.purpose === "SETUP"
                  ? "setup"
                  : "product"}{" "}
              chat · {row.updatedAt.toLocaleString()}
            </Button>
          ))}
          <p className="text-xs text-muted-foreground">
            Follow the selected chat’s instructions for confirmation. Complete
            or richer reviews may open the same saved chat in EwaTrade.
          </p>
          {chats.data.nextCursor ? (
            <Button
              variant="ghost"
              disabled={select.isPending}
              onClick={() => setChatCursor(chats.data.nextCursor)}
            >
              More chats
            </Button>
          ) : null}
          {chatCursor ? (
            <Button
              variant="ghost"
              disabled={select.isPending}
              onClick={() => setChatCursor(undefined)}
            >
              First chats
            </Button>
          ) : null}
        </div>
      ) : null}
      {businesses.isError ||
      stores.isError ||
      chats.isError ||
      businesses.isPaused ||
      stores.isPaused ||
      chats.isPaused ? (
        <p role="alert" className="text-sm">
          Choices are unavailable. Your connection, permissions or WhatsApp
          availability may have changed.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}
      <Button
        variant="ghost"
        className="justify-self-start"
        disabled={select.isPending}
        onClick={refresh}
      >
        Refresh choices
      </Button>
    </div>
  )
}
