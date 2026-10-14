import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { CustomerMessageEventKey } from "@ewatrade/customer-messages/client"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import {
  PREVIEW_STALE_MS,
  type WhatsAppActionState,
  messageActionState,
} from "./message-model"

export type OrderMessageTarget = {
  orderId: string
  eventKey?: CustomerMessageEventKey
  sourceId?: string
}

/** A committed change to offer telling the customer about. */
export type MessageFollowUpTarget = {
  eventKey: CustomerMessageEventKey
  sourceId?: string
  done: string
}

/** Opaque ids only: the phone and text never go into route params. */
export function useOpenCustomerMessage() {
  const router = useRouter()
  return (target: OrderMessageTarget) =>
    router.push({
      pathname: "/customer-message-modal",
      params: {
        orderId: target.orderId,
        ...(target.eventKey ? { eventKey: target.eventKey } : {}),
        ...(target.sourceId ? { sourceId: target.sourceId } : {}),
      },
    })
}

/**
 * One preview read for one Order surface. Offline or without a phone there
 * is no action: queued work isn't a recorded Order yet.
 */
export function useOrderMessageAction({
  target,
  hasPhone,
}: {
  target: OrderMessageTarget
  hasPhone: boolean
}) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const open = useOpenCustomerMessage()
  const enabled = hasPhone && !offline
  const query = useQuery(
    trpc.customerMessages.preview.queryOptions(
      {
        orderId: target.orderId,
        eventKey: target.eventKey,
        sourceId: target.sourceId,
      },
      { enabled, retry: false, staleTime: PREVIEW_STALE_MS },
    ),
  )
  const state: WhatsAppActionState = !enabled
    ? { kind: "hidden" }
    : query.isError
      ? { kind: "error" }
      : query.data
        ? messageActionState(query.data)
        : { kind: "loading" }
  return {
    state,
    // A generic entry stays generic, so the modal reuses this same read.
    open: () => open(target),
    retry: () => void query.refetch(),
  }
}
