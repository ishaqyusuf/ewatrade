"use client"

import { AssistantBookingContent } from "@/components/assistant-booking-content"
import { assistantBookingReadState } from "@/components/assistant-booking-state"
import { useAssistantBookingParams } from "@/hooks/use-assistant-booking-params"
import { useTRPCClient } from "@/trpc/client"
import type { ServiceBookingTarget } from "@ewatrade/assistant/general/booking-read"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { SheetFrame } from "./sheet-frame"

/** A new observer per Open withholds previous cached data until a fresh read. */
function BookingRead({
  target,
  scopeKey,
}: { target: ServiceBookingTarget; scopeKey: string }) {
  const trpc = useTRPCClient()
  const query = useQuery({
    queryKey: [
      "assistant-original-booking",
      scopeKey,
      target.bookingId,
      target.sourceId,
      target.offeringId,
    ],
    queryFn: ({ signal }) =>
      trpc.serviceCommerce.assistantBookingDetail.query(
        {
          bookingId: target.bookingId,
          sourceId: target.sourceId,
          offeringId: target.offeringId,
        },
        { signal },
      ),
    enabled: Boolean(scopeKey),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  })
  const state = scopeKey
    ? assistantBookingReadState(target, query)
    : "unavailable"
  if (state === "loading")
    return (
      <output aria-live="polite">
        {query.isPaused
          ? "Connect to check current booking access."
          : "Loading original booking…"}
      </output>
    )
  if (state === "unavailable" || !query.data)
    return (
      <div role="alert" className="grid gap-3">
        <p>
          This original booking is unavailable for your current business, Store
          or access.
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
      <AssistantBookingContent
        booking={query.data}
        checkedAt={query.dataUpdatedAt}
      />
      <Button
        variant="outline"
        className="justify-self-start"
        onClick={() => void query.refetch()}
      >
        Refresh booking facts
      </Button>
    </div>
  )
}

export function AssistantBookingSheet({ scopeKey }: { scopeKey: string }) {
  const { isOpen, target, close } = useAssistantBookingParams()
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {isOpen ? (
        <SheetFrame
          title="Original booking"
          description="Saved time and policies are separate from current resource and Order facts."
        >
          {target ? (
            <BookingRead
              key={JSON.stringify([scopeKey, target])}
              target={target}
              scopeKey={scopeKey}
            />
          ) : (
            <p role="alert">
              This booking link is invalid. Close it and reopen the original
              saved answer.
            </p>
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
