"use client"
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
        Loading AI allowance…
      </output>
    )
  if (query.isError)
    return (
      <div className="text-sm">
        <p>AI allowance could not be loaded.</p>
        <Button variant="ghost" onClick={() => void query.refetch()}>
          Retry
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
  return (
    <section
      className="space-y-4 rounded-lg border p-5"
      aria-label="AI allowance"
    >
      <div>
        <h2 className="font-semibold">AI allowance</h2>
        <p className="text-sm text-muted-foreground">
          Shared across this business's assistant conversations.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Tokens used</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {allowance.tokensUsed.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Tokens remaining</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {allowance.tokensRemaining.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Messages remaining</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {allowance.requestsRemaining} / {allowance.requestLimit}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        {allowance.tokenLimit.toLocaleString()} tokens per{" "}
        {allowance.windowDays} days. {reset}
      </p>
      {allowance.exhausted ? (
        <p className="text-sm">
          Your allowance is used up. You can still review drafts and create
          products with the form.
        </p>
      ) : null}
    </section>
  )
}
