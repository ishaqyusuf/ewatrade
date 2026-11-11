"use client"

import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import { readPollInterval } from "@/trpc/query-read-errors"
import { Button } from "@ewatrade/ui"
import { useInfiniteQuery, useMutation } from "@tanstack/react-query"
import { useRef, useState } from "react"

export function TelegramConnections({ actorUserId }: { actorUserId: string }) {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const generation = useRef(getDataCacheGeneration())
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const connections = useInfiniteQuery({
    queryKey: [
      ...trpc.assistantChannels.telegramConnections.queryKey(),
      actorUserId,
      "pages",
    ],
    queryFn: ({ pageParam, signal }) =>
      client.assistantChannels.telegramConnections.query(
        pageParam ? { cursor: pageParam } : undefined,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchInterval: (query) => readPollInterval(query.state.error, 30_000),
  })
  const revoke = useMutation(
    trpc.assistantChannels.revokeTelegram.mutationOptions({ gcTime: 0 }),
  )
  const fresh =
    connections.isSuccess &&
    connections.isFetchedAfterMount &&
    !connections.isPaused &&
    generation.current === getDataCacheGeneration()
  const rows = fresh ? connections.data.pages.flatMap((page) => page.items) : []

  async function remove(grantId: string) {
    if (
      !fresh ||
      confirmId !== grantId ||
      generation.current !== getDataCacheGeneration()
    )
      return
    setNotice("")
    setError("")
    try {
      await revoke.mutateAsync({ grantId })
      if (generation.current !== getDataCacheGeneration()) return
      setConfirmId(null)
      setNotice("Telegram access removed.")
      void connections.refetch()
    } catch {
      if (generation.current === getDataCacheGeneration())
        setError("Could not remove Telegram access. Try again.")
    }
  }

  return (
    <section
      className="grid gap-4"
      aria-labelledby="telegram-connections-title"
    >
      <div>
        <h2 id="telegram-connections-title" className="font-medium">
          Your Telegram access
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You can remove a connection even after you lose access to its business
          or Store.
        </p>
      </div>
      {connections.isPending && !connections.isPaused ? (
        <output className="text-sm">Loading connections…</output>
      ) : null}
      {connections.isError || connections.isPaused ? (
        <div className="grid justify-items-start gap-2">
          <p role="alert" className="text-sm">
            Could not load Telegram connections.
          </p>
          <Button
            variant="outline"
            disabled={connections.isPaused}
            onClick={() => void connections.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {fresh && rows.length === 0 ? (
        <p className="border p-5 text-sm text-muted-foreground">
          You have no Telegram assistant connections.
        </p>
      ) : null}
      {rows.map((row) => {
        const active =
          !row.revokedAt &&
          row.expiresAt.getTime() > Date.now() &&
          row.idleExpiresAt.getTime() > Date.now()
        return (
          <article key={row.id} className="grid gap-3 border p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-medium">{row.maskedSender}</h3>
                <p className="mt-1 text-sm">
                  {row.tenantName ?? "Previous business"} ·{" "}
                  {row.storeName ?? "Previous Store"}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {row.revokedAt ? "Removed" : active ? "Connected" : "Expired"}
              </span>
            </div>
            {confirmId === row.id && !row.revokedAt ? (
              <div className="grid justify-items-start gap-3 border-t pt-3">
                <p className="text-sm">
                  Remove Telegram access to {row.tenantName ?? "this business"}?
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
            ) : !row.revokedAt ? (
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
            ) : null}
          </article>
        )
      })}
      {fresh && connections.hasNextPage ? (
        <Button
          variant="outline"
          disabled={connections.isFetchingNextPage}
          onClick={() => void connections.fetchNextPage()}
        >
          More connections
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
