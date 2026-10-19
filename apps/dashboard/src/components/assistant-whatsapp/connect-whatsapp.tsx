"use client"

import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import { Button, buttonVariants } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import QRCode from "qrcode"
import { useCallback, useEffect, useRef, useState } from "react"

export type WhatsAppConnectScope = {
  actorUserId: string
  tenantId: string
  storeId: string
  businessName: string
  storeName: string
}

type LinkRequest = { id: string; url: string; expiresAt: Date }

/** A one-time link stays in this mounted scope; only the user confirms a claim. */
export function ConnectWhatsApp({ scope }: { scope: WhatsAppConnectScope }) {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const cache = useQueryClient()
  const generation = useRef(getDataCacheGeneration())
  const mounted = useRef(true)
  const requestRevision = useRef(0)
  const [link, setLink] = useState<LinkRequest | null>(null)
  const [qr, setQr] = useState("")
  const [copyState, setCopyState] = useState("")
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState("")
  const current = useCallback(
    () => mounted.current && generation.current === getDataCacheGeneration(),
    [],
  )
  const context = useQuery({
    queryKey: [
      "whatsapp-connect-context",
      scope.actorUserId,
      scope.tenantId,
      scope.storeId,
    ],
    queryFn: ({ signal }) => client.tenant.current.query(undefined, { signal }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchInterval: 15_000,
  })
  const contextMatches =
    context.isSuccess &&
    context.isFetchedAfterMount &&
    !context.isPaused &&
    context.data.actorUserId === scope.actorUserId &&
    context.data.tenant.id === scope.tenantId &&
    context.data.activeStore?.id === scope.storeId &&
    current()
  const available = useQuery(
    trpc.assistantChannels.availability.queryOptions(undefined, {
      enabled: contextMatches,
      staleTime: 0,
      gcTime: 0,
      retry: false,
      refetchOnMount: "always",
      refetchInterval: 15_000,
    }),
  )
  const enabled =
    contextMatches &&
    available.isSuccess &&
    available.isFetchedAfterMount &&
    !available.isPaused &&
    available.data.enabled
  const status = useQuery(
    trpc.assistantChannels.whatsAppLink.queryOptions(
      { linkId: link?.id ?? "none" },
      {
        enabled:
          enabled && Boolean(link) && now < (link?.expiresAt.getTime() ?? 0),
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchInterval: (query) =>
          ["confirmed", "cancelled", "expired"].includes(
            query.state.data?.state ?? "",
          )
            ? false
            : 2_000,
      },
    ),
  )
  const create = useMutation(
    trpc.assistantChannels.createWhatsAppLink.mutationOptions({ gcTime: 0 }),
  )
  const confirm = useMutation(
    trpc.assistantChannels.confirmWhatsAppLink.mutationOptions({ gcTime: 0 }),
  )

  useEffect(() => {
    mounted.current = true
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => {
      mounted.current = false
      requestRevision.current += 1
      window.clearInterval(timer)
    }
  }, [])
  useEffect(() => {
    if (!enabled) {
      requestRevision.current += 1
      setLink(null)
      setQr("")
      setCopyState("")
    }
  }, [enabled])
  useEffect(() => {
    let active = true
    setQr("")
    if (link && enabled && Date.now() < link.expiresAt.getTime()) {
      void QRCode.toDataURL(link.url, { width: 208, margin: 2 }).then(
        (value) => {
          if (active && current()) setQr(value)
        },
        () => {
          /* The open and copy actions remain available. */
        },
      )
    }
    return () => {
      active = false
    }
  }, [link, enabled, current])

  const state =
    status.isSuccess && status.data.id === link?.id ? status.data : null
  const expired =
    Boolean(link && now >= link.expiresAt.getTime()) ||
    state?.state === "expired" ||
    state?.state === "cancelled"
  const connected = state?.state === "confirmed" || confirm.isSuccess
  useEffect(() => {
    if (expired || connected) {
      setQr("")
      setCopyState("")
      setLink((value) => (value?.url ? { ...value, url: "" } : value))
    }
  }, [expired, connected])
  const start = async () => {
    setError("")
    setLink(null)
    setCopyState("")
    confirm.reset()
    const revision = ++requestRevision.current
    try {
      const value = await create.mutateAsync({})
      if (current() && revision === requestRevision.current) setLink(value)
    } catch {
      if (current())
        setError(
          "Could not create a link. Try again, or sign in again for a fresh session.",
        )
    } finally {
      create.reset()
    }
  }
  const approve = async () => {
    if (
      !link ||
      !state ||
      state.state !== "awaiting_confirmation" ||
      expired ||
      !enabled ||
      status.isPaused ||
      context.isFetching ||
      available.isFetching
    )
      return
    setError("")
    try {
      await confirm.mutateAsync({
        linkId: link.id,
        expectedRevision: state.revision,
      })
      if (!current()) return
      setQr("")
      await Promise.all([
        status.refetch(),
        cache.invalidateQueries({
          queryKey: trpc.assistantChannels.whatsAppConnections.queryKey(),
        }),
      ])
    } catch {
      if (current()) {
        setError(
          "The link could not be confirmed. Check the latest number below and try again, or sign in again.",
        )
        void status.refetch()
      }
    }
  }

  return (
    <section
      className="grid gap-4 border p-5"
      aria-labelledby="whatsapp-connect-title"
    >
      <div>
        <h2 id="whatsapp-connect-title" className="font-medium">
          Connect your WhatsApp
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {scope.businessName} · {scope.storeName}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Use your EwaTrade assistant from WhatsApp. You will send a prefilled
          message to EwaTrade, then approve the number here. Access follows your
          current business permissions.
        </p>
      </div>
      {context.isPending || (available.isPending && contextMatches) ? (
        <output className="text-sm">Checking availability…</output>
      ) : null}
      {context.isError || available.isError ? (
        <div className="grid gap-2">
          <p role="alert" className="text-sm">
            Could not check availability.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void context.refetch()
              void available.refetch()
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {context.isSuccess && !contextMatches ? (
        <output className="text-sm">
          Your business or Store changed. Refresh this page before connecting.
        </output>
      ) : null}
      {contextMatches && available.isSuccess && !available.data.enabled ? (
        <p className="text-sm text-muted-foreground">
          WhatsApp assistant is not available for this account yet. You can
          still remove existing access below.
        </p>
      ) : null}
      {enabled && connected ? (
        <div className="grid justify-items-start gap-3">
          <output className="text-sm">
            Connected{state?.maskedSender ? `: ${state.maskedSender}` : ""}.
            Send Help to the EwaTrade chat to choose a business, Store or
            conversation.
          </output>
          <Button
            variant="outline"
            disabled={create.isPending}
            onClick={() => void start()}
          >
            Create a fresh connection
          </Button>
        </div>
      ) : null}
      {enabled && !connected && (!link || expired) ? (
        <div className="grid justify-items-start gap-2">
          {expired ? (
            <output className="text-sm">
              This link expired or was cancelled. Create a new one to continue.
            </output>
          ) : null}
          <Button
            disabled={
              create.isPending || context.isFetching || available.isFetching
            }
            onClick={() => void start()}
          >
            {create.isPending
              ? "Creating link…"
              : expired
                ? "Create a new link"
                : "Connect WhatsApp"}
          </Button>
        </div>
      ) : null}
      {enabled && link && !expired && !connected ? (
        <div className="grid gap-4">
          {qr ? (
            <img
              src={qr}
              width={208}
              height={208}
              alt="Scan to open your private EwaTrade connection message in WhatsApp"
              className="border bg-white"
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <a
              className={buttonVariants()}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              Open WhatsApp
            </a>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link.url)
                  if (current()) setCopyState("Link copied. Keep it private.")
                } catch {
                  if (current())
                    setCopyState(
                      "Could not copy. Use Open WhatsApp or scan the code.",
                    )
                }
              }}
            >
              Copy link
            </Button>
          </div>
          {copyState ? <output className="text-sm">{copyState}</output> : null}
          <p className="text-sm text-muted-foreground">
            Send the prefilled message. Keep this private link to yourself. It
            expires in{" "}
            {Math.max(0, Math.ceil((link.expiresAt.getTime() - now) / 60_000))}{" "}
            min.
          </p>
          {status.isError || status.isPaused ? (
            <div className="grid gap-2">
              <p role="alert" className="text-sm">
                {status.isPaused
                  ? "Connection check paused while offline. Reconnect, then check again."
                  : "Could not check the WhatsApp reply."}
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
          {state?.state === "awaiting_whatsapp" ? (
            <output className="text-sm">
              Waiting for your message in WhatsApp…
            </output>
          ) : null}
          {state?.state === "awaiting_confirmation" &&
          state.maskedSender &&
          !status.isError ? (
            <div className="grid justify-items-start gap-3 border-t pt-4">
              <p className="text-sm">
                Allow <strong>{state.maskedSender}</strong> to use your
                assistant for{" "}
                <strong>
                  {scope.businessName} · {scope.storeName}
                </strong>
                ?
              </p>
              <p className="text-sm text-muted-foreground">
                Access expires after 30 days, or 7 days without use. You can
                remove it at any time.
              </p>
              <Button
                disabled={
                  confirm.isPending ||
                  status.isFetching ||
                  status.isPaused ||
                  context.isFetching ||
                  available.isFetching ||
                  !status.isFetchedAfterMount
                }
                onClick={() => void approve()}
              >
                {confirm.isPending ? "Confirming…" : "Confirm this number"}
              </Button>
            </div>
          ) : null}
          <Button
            variant="ghost"
            disabled={create.isPending || confirm.isPending}
            onClick={() => void start()}
          >
            Use a new link
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm">
          {error}{" "}
          <Link href="/login?next=%2Faccount%2Fwhatsapp" className="underline">
            Sign in again
          </Link>
        </p>
      ) : null}
    </section>
  )
}
