"use client"

import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import { readPollInterval } from "@/trpc/query-read-errors"
import { Button, buttonVariants } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import QRCode from "qrcode"
import { useCallback, useEffect, useRef, useState } from "react"

type TelegramConnectScope = {
  actorUserId: string
  tenantId: string
  storeId: string
  businessName: string
  storeName: string
}

type LinkRequest = { id: string; url: string; expiresAt: Date }

export function ConnectTelegram({ scope }: { scope: TelegramConnectScope }) {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const cache = useQueryClient()
  const generation = useRef(getDataCacheGeneration())
  const mounted = useRef(false)
  const requestVersion = useRef(0)
  const [link, setLink] = useState<LinkRequest | null>(null)
  const [qr, setQr] = useState("")
  const [expired, setExpired] = useState(false)
  const [connected, setConnected] = useState("")
  const [error, setError] = useState("")
  const current = useCallback(
    () => mounted.current && generation.current === getDataCacheGeneration(),
    [],
  )
  const context = useQuery({
    queryKey: [
      "telegram-connect",
      scope.actorUserId,
      scope.tenantId,
      scope.storeId,
    ],
    queryFn: ({ signal }) => client.tenant.current.query(undefined, { signal }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchInterval: (query) => readPollInterval(query.state.error, 15_000),
  })
  const matches =
    context.isSuccess &&
    context.isFetchedAfterMount &&
    !context.isPaused &&
    context.data.actorUserId === scope.actorUserId &&
    context.data.tenant.id === scope.tenantId &&
    context.data.activeStore?.id === scope.storeId &&
    generation.current === getDataCacheGeneration()
  const availability = useQuery(
    trpc.assistantChannels.telegramAvailability.queryOptions(undefined, {
      enabled: matches,
      staleTime: 0,
      gcTime: 0,
      retry: false,
      refetchOnMount: "always",
      refetchInterval: (query) => readPollInterval(query.state.error, 15_000),
    }),
  )
  const enabled =
    matches &&
    availability.isFetchedAfterMount &&
    !availability.isPaused &&
    availability.isSuccess &&
    availability.data.enabled
  const create = useMutation(
    trpc.assistantChannels.createTelegramLink.mutationOptions({ gcTime: 0 }),
  )
  const confirm = useMutation(
    trpc.assistantChannels.confirmTelegramLink.mutationOptions({ gcTime: 0 }),
  )
  const status = useQuery(
    trpc.assistantChannels.telegramLink.queryOptions(
      { linkId: link?.id ?? "none" },
      {
        enabled: enabled && Boolean(link) && !expired,
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchInterval: (query) => {
          const state = query.state.data?.state
          return state === "awaiting_telegram" ||
            state === "awaiting_confirmation" ||
            !state
            ? readPollInterval(query.state.error, 2_000)
            : false
        },
      },
    ),
  )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      requestVersion.current += 1
      setLink(null)
      setConnected("")
    }
  }, [enabled])

  useEffect(() => {
    if (!link) return
    const expiry = window.setTimeout(
      () => {
        setExpired(true)
        setLink(null)
      },
      Math.max(0, link.expiresAt.getTime() - Date.now()),
    )
    return () => window.clearTimeout(expiry)
  }, [link])

  const claim =
    status.isSuccess && status.data.id === link?.id ? status.data : null
  const visibleLink =
    enabled &&
    link &&
    !expired &&
    Date.now() < link.expiresAt.getTime() &&
    !status.isError &&
    !status.isPaused &&
    (!claim || claim.state === "awaiting_telegram")
      ? link
      : null

  useEffect(() => {
    let active = true
    setQr("")
    if (visibleLink)
      void QRCode.toDataURL(visibleLink.url, { width: 208, margin: 2 }).then(
        (data) => {
          if (active && current()) setQr(data)
        },
        () => {
          /* The direct link remains available. */
        },
      )
    return () => {
      active = false
    }
  }, [visibleLink, current])

  async function start() {
    if (!enabled || !current()) return
    setLink(null)
    setExpired(false)
    setConnected("")
    setError("")
    const version = ++requestVersion.current
    try {
      const request = await create.mutateAsync({
        tenantId: scope.tenantId,
        storeId: scope.storeId,
      })
      if (current() && version === requestVersion.current) setLink(request)
    } catch {
      if (current() && version === requestVersion.current)
        setError(
          "Could not create a Telegram link. Refresh the page or sign in again.",
        )
    } finally {
      create.reset()
    }
  }

  async function approve() {
    if (
      !enabled ||
      !current() ||
      !link ||
      link.expiresAt.getTime() <= Date.now() ||
      claim?.state !== "awaiting_confirmation" ||
      !claim.maskedSender ||
      !status.isFetchedAfterMount ||
      status.isFetching ||
      status.isPaused ||
      context.isFetching ||
      availability.isFetching
    )
      return
    setError("")
    const version = requestVersion.current
    try {
      const connection = await confirm.mutateAsync({
        linkId: link.id,
        revision: claim.revision,
      })
      if (!current()) return
      void cache.invalidateQueries({
        queryKey: trpc.assistantChannels.telegramConnections.queryKey(),
      })
      if (version === requestVersion.current) {
        setConnected(connection.maskedSender || claim.maskedSender)
        setExpired(false)
        setLink(null)
      }
    } catch {
      if (current() && version === requestVersion.current) {
        setError(
          "Could not confirm the connection. Check the latest Telegram account or sign in again.",
        )
        void status.refetch()
      }
    }
  }

  return (
    <section
      className="grid gap-4 border p-5"
      aria-labelledby="telegram-connect-title"
    >
      <div>
        <h2 id="telegram-connect-title" className="font-medium">
          Connect your Telegram
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {scope.businessName} · {scope.storeName}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Open the EwaTrade bot in Telegram, tap Start, then return here to
          confirm your Telegram account.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          To switch businesses or Stores, make the selection in EwaTrade and
          connect again.
        </p>
      </div>
      {context.isPending || (matches && availability.isPending) ? (
        <output className="text-sm">Checking availability…</output>
      ) : null}
      {context.isError || availability.isError ? (
        <div className="grid justify-items-start gap-2">
          <p role="alert" className="text-sm">
            Could not check availability.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void context.refetch()
              if (matches) void availability.refetch()
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {context.isSuccess && !matches ? (
        <output className="text-sm">
          Refresh this page before connecting to your current business and
          Store.
        </output>
      ) : null}
      {matches && availability.isSuccess && !availability.data.enabled ? (
        <p className="text-sm text-muted-foreground">
          Telegram assistant is unavailable for this account.
        </p>
      ) : null}
      {enabled && (connected || claim?.state === "confirmed") ? (
        <output className="text-sm">
          Connected{connected ? ` to ${connected}` : ""}. You can return to
          Telegram and send a message.
        </output>
      ) : null}
      {enabled &&
      (!link ||
        ["cancelled", "expired", "confirmed"].includes(claim?.state ?? "")) ? (
        <div className="grid justify-items-start gap-2">
          {expired ||
          claim?.state === "expired" ||
          claim?.state === "cancelled" ? (
            <output className="text-sm">Create a new link to continue.</output>
          ) : null}
          <Button
            disabled={
              create.isPending || context.isFetching || availability.isFetching
            }
            onClick={() => void start()}
          >
            {create.isPending
              ? "Creating link…"
              : connected
                ? "Create a new connection"
                : "Connect Telegram"}
          </Button>
        </div>
      ) : null}
      {visibleLink ? (
        <div className="grid justify-items-start gap-3">
          {qr ? (
            <img
              src={qr}
              width={208}
              height={208}
              alt="Scan to open the EwaTrade bot in Telegram"
              className="border bg-white"
            />
          ) : null}
          <a
            href={visibleLink.url}
            className={buttonVariants()}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Open Telegram
          </a>
          <output className="text-sm">
            Waiting for you to start the bot in Telegram…
          </output>
        </div>
      ) : null}
      {enabled && link && (status.isError || status.isPaused) ? (
        <div className="grid justify-items-start gap-2">
          <p role="alert" className="text-sm">
            Could not check the Telegram connection.
          </p>
          <Button
            variant="outline"
            disabled={status.isPaused}
            onClick={() => void status.refetch()}
          >
            Check again
          </Button>
        </div>
      ) : null}
      {enabled &&
      !expired &&
      claim?.state === "awaiting_confirmation" &&
      claim.maskedSender ? (
        <div className="grid justify-items-start gap-3 border-t pt-4">
          <p className="text-sm">
            Check that <strong>{claim.maskedSender}</strong> matches the account
            shown by the bot. Confirm to give it access to{" "}
            <strong>
              {scope.businessName} · {scope.storeName}
            </strong>
            ?
          </p>
          <Button
            disabled={
              confirm.isPending ||
              !status.isFetchedAfterMount ||
              status.isFetching ||
              status.isPaused ||
              context.isFetching ||
              availability.isFetching
            }
            onClick={() => void approve()}
          >
            {confirm.isPending ? "Confirming…" : "Confirm Telegram account"}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}
    </section>
  )
}
