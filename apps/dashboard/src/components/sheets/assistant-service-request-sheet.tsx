"use client"

import { AssistantServiceRequestContent } from "@/components/assistant-service-request-content"
import { assistantServiceRequestReadState } from "@/components/assistant-service-request-state"
import { useAssistantServiceRequestParams } from "@/hooks/use-assistant-service-request-params"
import { useTRPCClient } from "@/trpc/client"
import type { ServiceRequestTarget } from "@ewatrade/assistant/general/service-request-read"
import { nextReadMount } from "@ewatrade/assistant/general/staff-activity-target"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { SheetFrame } from "./sheet-frame"

/**
 * Each Open owns its read: the mount id makes the cache entry unique, so a
 * still-running fetch started by an earlier Open can never satisfy this one.
 */
function ServiceRequestRead({
  target,
  scopeKey,
}: { target: ServiceRequestTarget; scopeKey: string }) {
  const trpc = useTRPCClient()
  const [mount] = useState(nextReadMount)
  const query = useQuery({
    queryKey: [
      "assistant-original-service-request",
      mount,
      scopeKey,
      target.requestId,
      target.origin.tenantId,
      target.origin.storeId,
    ],
    queryFn: ({ signal }) =>
      trpc.serviceAssistantRequests.original.query(
        { requestId: target.requestId },
        { signal },
      ),
    enabled: Boolean(scopeKey),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  })
  const state = assistantServiceRequestReadState(target, scopeKey, query)
  if (state === "loading")
    return (
      <output aria-live="polite">
        {query.isPaused
          ? "Connect to check current request access."
          : "Loading the original Service Request…"}
      </output>
    )
  if (state === "unavailable" || !query.data)
    return (
      <div role="alert" className="grid gap-3">
        <p>
          This exact Service Request is unavailable for your current business,
          Store or access. No saved details are shown.
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
      <AssistantServiceRequestContent
        record={query.data}
        checkedAt={query.dataUpdatedAt}
      />
      <Button
        variant="outline"
        className="justify-self-start"
        onClick={() => void query.refetch()}
      >
        Refresh request facts
      </Button>
    </div>
  )
}

export function AssistantServiceRequestSheet({
  scopeKey,
}: { scopeKey: string }) {
  const { isOpen, target, close } = useAssistantServiceRequestParams()
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {isOpen ? (
        <SheetFrame
          title="Original Service Request"
          description="The customer’s saved request. Current quotation facts are shown separately."
        >
          {target ? (
            <ServiceRequestRead
              key={JSON.stringify([scopeKey, target])}
              target={target}
              scopeKey={scopeKey}
            />
          ) : (
            <p role="alert">
              This request link is invalid. Close it and reopen the original
              saved answer.
            </p>
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
