"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import { SheetFrame } from "@/components/sheets/sheet-frame"
import {
  StoreConversationFormProvider,
  useStoreConversationForms,
} from "@/components/store-conversations/form-context"
import { StoreConversationSheetContent } from "@/components/store-conversations/store-conversation-sheet-content"
import {
  getStoreConversationQueueInput,
  useStoreConversationParams,
} from "@/hooks/use-store-conversation-params"
import { useTRPC } from "@/trpc/client"
import { Sheet } from "@ewatrade/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

export function StoreConversationSheet({
  storeId,
  storeIds,
}: {
  storeId: string
  storeIds: string[]
}) {
  const params = useStoreConversationParams()
  const conversationId = params.conversationId
  const open = Boolean(conversationId && params.conversationSheet === "detail")
  const requestedStoreId = params.store
  const resolvedStoreId =
    requestedStoreId && storeIds.includes(requestedStoreId)
      ? requestedStoreId
      : storeId
  const queueInput = getStoreConversationQueueInput(
    { ...params, store: resolvedStoreId },
    resolvedStoreId,
  )

  return (
    <StoreConversationFormProvider
      key={`${resolvedStoreId}:${conversationId ?? ""}`}
    >
      <StoreConversationSheetDialog
        conversationId={conversationId}
        open={open}
        params={params}
        queueInput={queueInput}
        resolvedStoreId={resolvedStoreId}
      />
    </StoreConversationFormProvider>
  )
}

function StoreConversationSheetDialog({
  conversationId,
  open,
  params,
  queueInput,
  resolvedStoreId,
}: {
  conversationId: string | null
  open: boolean
  params: ReturnType<typeof useStoreConversationParams>
  queueInput: ReturnType<typeof getStoreConversationQueueInput>
  resolvedStoreId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { resetAssignment, resetReply } = useStoreConversationForms()
  const [closeError, setCloseError] = useState<string | null>(null)
  const timelineInput =
    open && conversationId
      ? { conversationId, limit: 50, storeId: resolvedStoreId }
      : null
  const attendantInput = { storeId: resolvedStoreId }

  const refresh = async () => {
    const invalidations = [
      queryClient.invalidateQueries({
        exact: true,
        queryKey:
          trpc.serviceCommerce.storeConversationQueue.queryKey(queueInput),
      }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey:
          trpc.serviceCommerce.eligibleStoreConversationAttendants.queryKey(
            attendantInput,
          ),
      }),
    ]
    if (timelineInput) {
      invalidations.push(
        queryClient.invalidateQueries({
          exact: true,
          queryKey:
            trpc.serviceCommerce.storeConversationTimeline.queryKey(
              timelineInput,
            ),
        }),
      )
    }
    await Promise.all(invalidations)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) return
        setCloseError(null)
        void (async () => {
          try {
            await refresh()
            resetReply()
            resetAssignment()
            await params.setSelection(null)
          } catch {
            setCloseError(
              "Conversation data could not be refreshed. Try closing again.",
            )
          }
        })()
      }}
    >
      {open && conversationId ? (
        <SheetFrame
          description="Read the Store timeline, claim primary ownership, reply to the exact Request, or transfer work with an auditable reason."
          title="Conversation"
        >
          {closeError ? (
            <FormFeedback appearance="dashboard">{closeError}</FormFeedback>
          ) : null}
          <StoreConversationSheetContent
            conversationId={conversationId}
            queueInput={queueInput}
            storeId={resolvedStoreId}
          />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
