"use client"

import { AssistantQuoteApprovalContent } from "@/components/assistant-quote-approval-content"
import { assistantQuoteApprovalReadState } from "@/components/assistant-quote-approval-state"
import { useAssistantQuoteApprovalParams } from "@/hooks/use-assistant-quote-approval-params"
import { useTRPCClient } from "@/trpc/client"
import type { QuoteApprovalTarget } from "@ewatrade/assistant/general/quote-reads"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { SheetFrame } from "./sheet-frame"

/** A new observer per Open withholds previous cached data until a fresh read. */
function QuoteApprovalRead({
  target,
  scopeKey,
}: { target: QuoteApprovalTarget; scopeKey: string }) {
  const trpc = useTRPCClient()
  const query = useQuery({
    queryKey: [
      "assistant-original-quotation",
      scopeKey,
      target.approvalId,
      target.quoteId,
      target.quoteVersionId,
    ],
    queryFn: ({ signal }) =>
      trpc.serviceCommerce.assistantQuoteApprovalDetail.query(
        {
          approvalId: target.approvalId,
          quoteId: target.quoteId,
          quoteVersionId: target.quoteVersionId,
        },
        { signal },
      ),
    enabled: Boolean(scopeKey),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  })
  const state = scopeKey
    ? assistantQuoteApprovalReadState(target, query)
    : "unavailable"
  if (state === "loading")
    return (
      <output aria-live="polite">
        {query.isPaused
          ? "Connect to check current quotation access."
          : "Loading original quotation…"}
      </output>
    )
  if (state === "unavailable" || !query.data)
    return (
      <div role="alert" className="grid gap-3">
        <p>
          This original quotation is unavailable for your current business,
          Store or access.
        </p>
        <Button
          variant="outline"
          disabled={!scopeKey}
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  return (
    <div className="grid gap-5">
      <AssistantQuoteApprovalContent
        approval={query.data}
        checkedAt={query.dataUpdatedAt}
      />
      <Button
        variant="outline"
        className="justify-self-start"
        onClick={() => void query.refetch()}
      >
        Refresh current review
      </Button>
    </div>
  )
}

export function AssistantQuoteApprovalSheet({
  scopeKey,
}: { scopeKey: string }) {
  const { isOpen, target, close } = useAssistantQuoteApprovalParams()
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {isOpen ? (
        <SheetFrame
          title="Original quotation"
          description="Saved version facts and current eligibility are separate."
        >
          {target ? (
            <QuoteApprovalRead
              key={JSON.stringify([scopeKey, target])}
              target={target}
              scopeKey={scopeKey}
            />
          ) : (
            <p role="alert">
              This quotation link is invalid. Close it and reopen the original
              saved answer.
            </p>
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
