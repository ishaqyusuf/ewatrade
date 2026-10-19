"use client"

import { AssistantManualMessageContent } from "@/components/assistant-manual-message-content"
import { assistantManualMessageReadState } from "@/components/assistant-manual-message-state"
import { useAssistantManualMessageParams } from "@/hooks/use-assistant-manual-message-params"
import { useTRPCClient } from "@/trpc/client"
import type { ServiceManualMessageTarget } from "@ewatrade/assistant/general/service-message-read"
import { nextReadMount } from "@ewatrade/assistant/general/staff-activity-target"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { SheetFrame } from "./sheet-frame"

/**
 * Each Open owns its read: the mount id makes the cache entry unique, so a
 * still-running fetch started by an earlier Open can never satisfy this one.
 */
function ManualMessageRead({
  target,
  scopeKey,
}: { target: ServiceManualMessageTarget; scopeKey: string }) {
  const trpc = useTRPCClient()
  const [mount] = useState(nextReadMount)
  const query = useQuery({
    queryKey: [
      "assistant-original-manual-message",
      mount,
      scopeKey,
      target.jobId,
      target.intentId,
      target.shareId,
    ],
    queryFn: ({ signal }) =>
      trpc.serviceCommunications.manualMessageOriginal.query(
        {
          jobId: target.jobId,
          intentId: target.intentId,
          shareId: target.shareId,
        },
        { signal },
      ),
    enabled: Boolean(scopeKey),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  })
  const state = assistantManualMessageReadState(target, scopeKey, query)
  if (state === "loading")
    return (
      <output aria-live="polite">
        {query.isPaused
          ? "Connect to check current message access."
          : "Loading the original shared message…"}
      </output>
    )
  if (state === "unavailable" || !query.data)
    return (
      <div role="alert" className="grid gap-3">
        <p>
          This exact saved message is unavailable for your current business,
          Store or access. No delivery is inferred.
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
      <AssistantManualMessageContent
        record={query.data}
        checkedAt={query.dataUpdatedAt}
      />
      <Button
        variant="outline"
        className="justify-self-start"
        onClick={() => void query.refetch()}
      >
        Refresh message facts
      </Button>
    </div>
  )
}

export function AssistantManualMessageSheet({
  scopeKey,
}: { scopeKey: string }) {
  const { isOpen, target, close } = useAssistantManualMessageParams()
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {isOpen ? (
        <SheetFrame
          title="Original shared message"
          description="A staff member’s record of a message they shared themselves. Nothing was sent by ẸwáTrade."
        >
          {target ? (
            <ManualMessageRead
              key={JSON.stringify([scopeKey, target])}
              target={target}
              scopeKey={scopeKey}
            />
          ) : (
            <p role="alert">
              This message link is invalid. Close it and reopen the original
              saved answer.
            </p>
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
