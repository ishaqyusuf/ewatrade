"use client"

import { useCustomerMessageParams } from "@/hooks/use-customer-message-params"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { CustomerMessageEventKey } from "@ewatrade/customer-messages/client"
import { useQuery } from "@tanstack/react-query"
import type { WhatsAppActionState } from "./whatsapp-notify-button"

export type OrderMessagePreview = RouterOutputs["customerMessages"]["preview"]

export const PREVIEW_STALE_MS = 60_000

/** Readiness of one preview; grey states still open the sheet to explain. */
export function messageActionState(
  preview: OrderMessagePreview,
): WhatsAppActionState {
  switch (preview.state) {
    case "ready":
      return { kind: "ready" }
    case "not_composed":
      return { kind: "compose" }
    case "disabled":
      return { kind: "disabled" }
    case "no_phone":
      return { kind: "hidden" }
    case "invalid_phone":
      return { kind: "invalid_phone" }
    case "source_required":
      return {
        kind: "blocked",
        reason: preview.sourceChoices.length
          ? "Choose which record"
          : "Nothing recorded to describe",
      }
    default:
      return {
        kind: "blocked",
        reason: preview.reason ?? "Not available for this order",
      }
  }
}

/**
 * The WhatsApp action for one Order surface: one preview read. Without an
 * explicit event the server's recommended event decides the colour; payment
 * and refund entries pass the exact record id.
 */
export function useOrderMessageAction({
  orderId,
  eventKey,
  sourceId,
  enabled = true,
}: {
  orderId: string
  eventKey?: CustomerMessageEventKey
  sourceId?: string
  enabled?: boolean
}) {
  const trpc = useTRPC()
  const { setParams } = useCustomerMessageParams()
  // Without an event the server answers for its recommended one.
  const query = useQuery(
    trpc.customerMessages.preview.queryOptions(
      { orderId, eventKey, sourceId },
      { enabled, retry: false, staleTime: PREVIEW_STALE_MS },
    ),
  )
  const state: WhatsAppActionState = query.isError
    ? { kind: "error" }
    : query.data
      ? messageActionState(query.data)
      : { kind: "loading" }
  return {
    state,
    retry: () => void query.refetch(),
    open: () =>
      setParams({
        messageSheet: "order",
        messageOrderId: orderId,
        // A generic entry stays generic, so the sheet reuses this same read.
        messageEvent: eventKey ?? null,
        messageSource: sourceId ?? null,
        messageScope: null,
      }),
  }
}
