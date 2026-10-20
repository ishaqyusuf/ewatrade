"use client"
import { AiDraftReview } from "@/components/customer-messages/ai-draft-review"
import { OrderMessagePanel } from "@/components/customer-messages/order-message-panel"
import { TemplateEditor } from "@/components/customer-messages/template-editor"
import { useOrderMessageAction } from "@/components/customer-messages/use-order-message-action"
import { WhatsAppNotifyButton } from "@/components/customer-messages/whatsapp-notify-button"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useCustomerMessageParams } from "@/hooks/use-customer-message-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { getCustomerMessageEvent } from "@ewatrade/customer-messages/client"
import { Button, Sheet } from "@ewatrade/ui"
import { useCallback, useRef } from "react"

const COPY = {
  order: {
    title: "WhatsApp message",
    description: "Review it here, then send it from WhatsApp.",
  },
  "compose-all": {
    title: "Write WhatsApp messages",
    description: "Draft several at once, then save the ones you want.",
  },
} as const

/**
 * The one WhatsApp message overlay: Order preview/compose, saved wording and
 * Compose all. GlobalSheets keys it by user, business and Store, so drafts
 * never carry across a switch.
 */
export function CustomerMessageSheet() {
  const params = useCustomerMessageParams()
  const dirty = useRef(false)
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value
  }, [])
  const close = async () => {
    dirty.current = false
    await params.close()
  }
  const { closeError, requestClose } = useSheetDismissal(async () => {
    if (
      dirty.current &&
      !window.confirm("Discard this message? Your changes aren’t saved.")
    )
      return
    dirty.current = false
    await params.close()
  })
  const mode = params.messageSheet
  const open =
    (mode === "order" && Boolean(params.messageOrderId)) ||
    (mode === "template" && Boolean(params.messageEvent)) ||
    mode === "compose-all"
  // Saved wording is titled by its message, e.g. "Out for delivery".
  const event =
    mode === "template" && params.messageEvent
      ? getCustomerMessageEvent(params.messageEvent)
      : null
  const copy = event
    ? { title: event.label, description: event.description }
    : mode && mode !== "template"
      ? COPY[mode]
      : null
  return (
    <>
      {params.messageOffer && !open ? (
        <MessageOffer
          key={params.messageOffer}
          orderId={params.messageOffer}
          onOpen={() =>
            void params.setParams({
              messageSheet: "order",
              messageOrderId: params.messageOffer,
              // A new Order offers its "recorded" message; the picker still
              // lets staff choose an initial payment deliberately.
              messageEvent: "order.recorded",
              messageSource: null,
              messageOffer: null,
            })
          }
          onDismiss={() => void params.setParams({ messageOffer: null })}
        />
      ) : null}
      <Sheet
        open={open}
        onOpenChange={(value) => {
          if (!value) void requestClose()
        }}
      >
        {open && copy ? (
          <SheetFrame
            title={copy.title}
            description={copy.description}
            closeError={closeError}
            mobileBottomSheet
            popupClassName="sm:max-w-[560px]"
          >
            {mode === "order" && params.messageOrderId ? (
              <OrderMessagePanel
                key={params.messageOrderId}
                orderId={params.messageOrderId}
                eventKey={params.messageEvent}
                sourceId={params.messageSource}
                onDirtyChange={onDirtyChange}
              />
            ) : null}
            {mode === "template" && params.messageEvent ? (
              <TemplateEditor
                eventKey={params.messageEvent}
                scope={params.messageScope ?? "business"}
                storeId={params.messageStoreId}
                onDirtyChange={onDirtyChange}
                onDone={() => void close()}
                onCancel={() => void requestClose()}
              />
            ) : null}
            {mode === "compose-all" ? (
              <AiDraftReview
                scope={params.messageScope ?? "business"}
                storeId={params.messageStoreId}
                onDirtyChange={onDirtyChange}
                onDone={() => void params.close()}
              />
            ) : null}
          </SheetFrame>
        ) : null}
      </Sheet>
    </>
  )
}

/** After a new Order: an optional offer. It never opens WhatsApp itself. */
function MessageOffer({
  orderId,
  onOpen,
  onDismiss,
}: {
  orderId: string
  onOpen: () => void
  onDismiss: () => void
}) {
  const action = useOrderMessageAction({
    orderId,
    eventKey: "order.recorded",
  })
  if (action.state.kind === "hidden") return null
  return (
    <div className="fixed right-4 bottom-4 left-4 z-50 flex flex-wrap items-center gap-3 rounded-lg border bg-background p-4 shadow-lg sm:left-auto sm:max-w-md">
      <output className="min-w-0 flex-1 text-sm">
        Order recorded. Let the customer know on WhatsApp?
      </output>
      <WhatsAppNotifyButton
        size="sm"
        state={action.state}
        onOpen={onOpen}
        onRetry={action.retry}
      />
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  )
}
