"use client"

import { useTRPC } from "@/trpc/client"
import { Button, buttonVariants } from "@ewatrade/ui"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"

/**
 * Overview: the one lifecycle nudge the daily sweep chose for this owner
 * (`growth.activeNudge`). The card only renders what the server sends; it
 * never decides eligibility. Hidden when there is none.
 */
export function LifecycleNudgeCard() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const nudgeQuery = trpc.growth.activeNudge.queryOptions()
  const nudge = useQuery({ ...nudgeQuery, staleTime: 5 * 60_000 })
  const dismiss = useMutation(
    trpc.growth.dismissNudge.mutationOptions({
      onSuccess: () => queryClient.setQueryData(nudgeQuery.queryKey, null),
    }),
  )
  const card = nudge.data
  if (!card) return null
  return (
    <section
      aria-labelledby="lifecycle-nudge-title"
      className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="grid min-w-0 flex-1 gap-1">
        <h2 id="lifecycle-nudge-title" className="font-semibold">
          {card.title}
        </h2>
        <p className="text-sm text-muted-foreground">{card.body}</p>
        <div className="pt-2">
          <Link href={card.ctaPath} className={buttonVariants({ size: "sm" })}>
            {card.ctaLabel}
          </Link>
        </div>
      </div>
      <Button
        aria-label="Dismiss"
        className="-mr-2 -mt-2 shrink-0"
        disabled={dismiss.isPending}
        onClick={() => dismiss.mutate({ id: card.id })}
        size="icon"
        variant="ghost"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
      </Button>
    </section>
  )
}
