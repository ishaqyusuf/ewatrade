"use client"

import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useTRPC } from "@/trpc/client"
import {
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import type { BusinessActivityActorChoice } from "@ewatrade/notifications/business-events"
import { Button, Input, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { formatRole } from "./activity-format"
import { isAccessDrift } from "./activity-read-errors"

const freshRead = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always",
  trpc: { abortOnUnmount: true },
} as const

/**
 * Searches people who appear in activity this viewer may see. Choices come
 * only from activity.filters, never from the staff directory.
 */
export function ActivityPersonPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (actor: BusinessActivityActorChoice) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {open ? (
        <SheetFrame
          title="Find a person"
          description="People who appear in activity you can see."
          mobileBottomSheet
        >
          <PersonSearch onPick={onPick} />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}

function PersonSearch({
  onPick,
}: {
  onPick: (actor: BusinessActivityActorChoice) => void
}) {
  const [text, setText] = useState("")
  const [query, setQuery] = useState("")
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim().slice(0, 160)), 250)
    return () => clearTimeout(timer)
  }, [text])
  return (
    <div className="grid gap-3">
      <Input
        type="search"
        aria-label="Search people"
        placeholder="Search by name"
        maxLength={160}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {/* A new search remounts the list so no earlier result can show. */}
      <PersonResults
        key={`${attempt}:${query}`}
        query={query}
        onPick={onPick}
        onRestart={() => setAttempt((current) => current + 1)}
      />
    </div>
  )
}

function PersonResults({
  query,
  onPick,
  onRestart,
}: {
  query: string
  onPick: (actor: BusinessActivityActorChoice) => void
  onRestart: () => void
}) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [found, setFound] = useState<BusinessActivityActorChoice[]>([])
  const page = useQuery(
    mountOwnedRead(
      trpc.activity.filters.queryOptions(
        {
          ...(query ? { actorQuery: query } : {}),
          ...(cursor ? { actorCursor: cursor } : {}),
        },
        freshRead,
      ),
      mount,
    ),
  )
  const data = page.isSuccess ? page.data : undefined
  useEffect(() => {
    if (!data) return
    setFound((current) => {
      const seen = new Set(current.map((actor) => actor.membershipId))
      return [
        ...current,
        ...data.actors.filter((actor) => !seen.has(actor.membershipId)),
      ]
    })
  }, [data])
  // Earlier choices aren't proof of current access after a refusal.
  if (page.isError && isAccessDrift(page.error))
    return (
      <div role="alert" className="grid justify-items-start gap-2 text-sm">
        <p>Your access has changed, so earlier results were cleared.</p>
        <Button variant="outline" onClick={onRestart}>
          Search again
        </Button>
      </div>
    )
  if (page.isError && !found.length)
    return (
      <div role="alert" className="grid justify-items-start gap-2 text-sm">
        <p>People couldn't load.</p>
        <Button variant="outline" onClick={() => void page.refetch()}>
          Try again
        </Button>
      </div>
    )
  if (page.isPending && !found.length)
    return (
      <output aria-live="polite" className="text-sm text-muted-foreground">
        Searching…
      </output>
    )
  return (
    <div className="grid gap-2">
      {found.length ? (
        <ul className="border-t">
          {found.map((actor) => (
            <li key={actor.membershipId} className="border-b">
              <button
                type="button"
                onClick={() => onPick(actor)}
                className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>{actor.name}</span>
                <span className="text-xs text-muted-foreground">
                  {actor.isFormer ? "Former" : formatRole(actor.role)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {query ? "Nobody matches that name." : "Nobody to show yet."}
        </p>
      )}
      {page.isError ? (
        <p role="alert" className="text-sm text-muted-foreground">
          More people couldn't load.
        </p>
      ) : null}
      {data?.actorNextCursor || page.isError ? (
        <Button
          variant="outline"
          className="justify-self-start"
          disabled={page.isFetching}
          onClick={() =>
            page.isError
              ? void page.refetch()
              : setCursor(data?.actorNextCursor ?? undefined)
          }
        >
          {page.isFetching
            ? "Loading…"
            : page.isError
              ? "Try again"
              : "More people"}
        </Button>
      ) : null}
    </div>
  )
}
