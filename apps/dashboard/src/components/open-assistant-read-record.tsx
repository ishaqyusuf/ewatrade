"use client"

import { getDataCacheGeneration, useTRPCClient } from "@/trpc/client"
import { readPollInterval } from "@/trpc/query-read-errors"
import { readRecordAppLink } from "@ewatrade/assistant/channels/read-record-links"
import type { ReadRecordTarget } from "@ewatrade/assistant/general/read-record-target"
import { Button, buttonVariants } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useAssistantReadActivity } from "./general-assistant/assistant-read-activity"

/** Navigation rechecks the real browser scope; it never changes business or Store. */
export function OpenAssistantReadRecord({
  target,
}: { target: ReadRecordTarget }) {
  return useAssistantReadActivity() ? (
    <ActiveAssistantReadRecord target={target} />
  ) : null
}

function ActiveAssistantReadRecord({ target }: { target: ReadRecordTarget }) {
  const client = useTRPCClient()
  const generation = useRef(getDataCacheGeneration())
  const [appOrigin, setAppOrigin] = useState("")
  useEffect(() => setAppOrigin(window.location.origin), [])
  const context = useQuery({
    queryKey: ["assistant-read-record-context", generation.current],
    queryFn: ({ signal }) => client.tenant.current.query(undefined, { signal }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchInterval: (query) => readPollInterval(query.state.error, 15_000),
  })
  const fresh =
    context.isSuccess &&
    context.isFetchedAfterMount &&
    !context.isFetching &&
    !context.isPaused &&
    generation.current === getDataCacheGeneration()
  const currentStore = fresh ? context.data.activeStore : null
  const link =
    fresh && currentStore
      ? readRecordAppLink(target, {
          trustedAppOrigin: appOrigin,
          currentScope: {
            tenantId: context.data.tenant.id,
            storeId: currentStore.id,
          },
        })
      : undefined

  if (context.isPending || context.isFetching)
    return (
      <output className="text-xs text-muted-foreground">
        Checking record access…
      </output>
    )
  if (link)
    return (
      <Link
        href={link.href}
        prefetch={false}
        className={buttonVariants({ size: "sm", variant: "outline" })}
      >
        {link.label}
      </Link>
    )
  return (
    <div className="grid max-w-64 justify-items-start gap-2">
      <p className="text-xs text-muted-foreground">
        Select the original business and Store in EwaTrade, then check again to
        open this record.
      </p>
      {context.isError || context.isPaused ? (
        <p className="text-xs text-muted-foreground">
          Current access could not be verified.
        </p>
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => void context.refetch()}>
        Check again
      </Button>
    </div>
  )
}
