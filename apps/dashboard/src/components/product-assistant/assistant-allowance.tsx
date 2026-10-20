"use client"
import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-page"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

export function AssistantAllowance({ compact = false }: { compact?: boolean }) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.productAssistant.capabilities.queryOptions(undefined, {
      staleTime: 0,
      refetchInterval: 30000,
    }),
  )
  if (query.isPending)
    return (
      <output className="text-sm text-muted-foreground">
        Loading AI messages…
      </output>
    )
  if (query.isError)
    return (
      <div className="text-sm">
        <p>Couldn't load your AI messages.</p>
        <Button variant="ghost" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  if (!query.data?.enabled) return null
  const allowance = query.data.allowance
  const reset = allowance.resetsAt
    ? `Resets ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(allowance.resetsAt))}`
    : `Your ${allowance.windowDays}-day allowance starts with your next message.`
  if (compact)
    return (
      <p className="text-right text-xs text-muted-foreground">
        <span className="max-md:hidden">
          {allowance.tokensRemaining.toLocaleString()} tokens ·{" "}
        </span>
        {allowance.requestsRemaining} messages left
        <span className="max-md:hidden"> · {reset}</span>
      </p>
    )
  const share = allowance.requestLimit
    ? Math.round((allowance.requestsRemaining / allowance.requestLimit) * 100)
    : 0
  const comesBack = allowance.resetsAt
    ? `They come back on ${new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(allowance.resetsAt))}.`
    : `Your ${allowance.windowDays}-day allowance starts with your next message.`
  return (
    <SettingsSection title="AI assistant">
      <SettingsRow
        label="Messages left"
        description={
          <>
            <span
              className="mt-1.5 mb-1.5 block h-1.5 max-w-72 overflow-hidden rounded-full bg-muted"
              aria-hidden="true"
            >
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${share}%` }}
              />
            </span>
            {allowance.exhausted
              ? `You've used all your AI messages. ${comesBack} You can still add products with the form.`
              : `Everyone in your business shares these. ${comesBack}`}
          </>
        }
      >
        <span className="text-sm tabular-nums">
          {allowance.requestsRemaining} of {allowance.requestLimit}
        </span>
      </SettingsRow>
    </SettingsSection>
  )
}
