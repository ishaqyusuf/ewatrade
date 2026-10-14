"use client"

import type { CustomerMessageEventKey } from "@ewatrade/customer-messages/client"
import { Button } from "@ewatrade/ui"
import { useOrderMessageAction } from "./use-order-message-action"
import { WhatsAppNotifyButton } from "./whatsapp-notify-button"

export type MessageFollowUpTarget = {
  eventKey: CustomerMessageEventKey
  sourceId?: string
  done: string
}

/**
 * After a committed change: offer to tell the customer. Shown only when the
 * Order has a phone; it never opens WhatsApp by itself.
 */
export function MessageFollowUp({
  orderId,
  target,
  onOpen,
  onDismiss,
}: {
  orderId: string
  target: MessageFollowUpTarget
  onOpen: (open: () => void) => void
  onDismiss: () => void
}) {
  const action = useOrderMessageAction({
    orderId,
    eventKey: target.eventKey,
    sourceId: target.sourceId,
  })
  if (action.state.kind === "hidden") return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-600/25 bg-emerald-500/5 px-4 py-3 text-sm">
      <output>{target.done} Let the customer know?</output>
      <div className="flex items-center gap-2">
        <WhatsAppNotifyButton
          size="sm"
          state={action.state}
          onOpen={() => onOpen(action.open)}
          onRetry={action.retry}
        />
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}
