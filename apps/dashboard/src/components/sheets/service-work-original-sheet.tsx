"use client"

import { ServiceWorkOriginalContent } from "@/components/service-work-original-content"
import { serviceWorkOriginalReadState } from "@/components/service-work-original-state"
import { useServiceWorkOriginalParams } from "@/hooks/use-service-work-original-params"
import { useTRPCClient } from "@/trpc/client"
import type { ServiceWorkOriginalTarget } from "@ewatrade/assistant/general/service-work-original"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { SheetFrame } from "./sheet-frame"

function OriginalRead({
  target,
  scopeKey,
  timeZone,
  onOpenCurrentJob,
}: {
  target: ServiceWorkOriginalTarget
  scopeKey: string
  timeZone: string
  onOpenCurrentJob: () => void
}) {
  const client = useTRPCClient()
  const query = useQuery({
    queryKey: ["assistant-work-original", scopeKey, target],
    queryFn: ({ signal }) =>
      client.serviceAssistantWork.original.query(target, { signal }),
    enabled: Boolean(scopeKey),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  })
  const state = serviceWorkOriginalReadState(target, scopeKey, query)
  if (state === "loading")
    return (
      <output aria-live="polite">
        {query.isPaused
          ? "Connect to check current Service work access."
          : "Loading original Service record…"}
      </output>
    )
  if (state !== "ready" || !query.data)
    return (
      <div role="alert" className="grid gap-3">
        <p>
          This original Service record is unavailable for your current business,
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
      <ServiceWorkOriginalContent
        record={query.data}
        timeZone={timeZone}
        onOpenCurrentJob={onOpenCurrentJob}
      />
      <Button
        variant="outline"
        className="justify-self-start"
        onClick={() => void query.refetch()}
      >
        Refresh current access
      </Button>
    </div>
  )
}

export function ServiceWorkOriginalSheet({
  scopeKey,
  timeZone,
}: { scopeKey: string; timeZone: string }) {
  const { isOpen, target, close, openCurrentJob } =
    useServiceWorkOriginalParams()
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {isOpen ? (
        <SheetFrame
          title="Original Service record"
          description="Original facts and current Job state are separate."
        >
          {target ? (
            <OriginalRead
              key={JSON.stringify([scopeKey, target])}
              target={target}
              scopeKey={scopeKey}
              timeZone={timeZone}
              onOpenCurrentJob={() => void openCurrentJob(target.jobId)}
            />
          ) : (
            <p role="alert">
              This Service record link is invalid. Close it and reopen the
              original receipt.
            </p>
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
