"use client"

import { DomainSheetContent } from "@/components/domains/domain-sheet-content"
import { ExternalDomainFlow } from "@/components/domains/external-domain-flow"
import { useDomainParams } from "@/hooks/use-domain-params"
import { useTRPC } from "@/trpc/client"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Sheet,
} from "@ewatrade/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

/**
 * Domain overlays from the URL: connecting your own address is a modal
 * (Midday connect pattern); buying, its progress and a domain's details are
 * right sheets.
 */
export function DomainSheet({
  store,
}: {
  store: { id: string; name: string }
}) {
  const { domainId, domainOrderId, mode, setParams } = useDomainParams()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [closeError, setCloseError] = useState<string | null>(null)
  const close = () => {
    setCloseError(null)
    void (async () => {
      try {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.domains.list.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.domains.order.queryKey(),
          }),
        ])
        await setParams(null)
      } catch (error) {
        setCloseError(
          error instanceof Error
            ? error.message
            : "The domain sheet could not be closed.",
        )
      }
    })()
  }

  return (
    <>
      <Dialog
        open={mode === "connect"}
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DialogContent className="grid max-h-[calc(100svh-2rem)] content-start gap-5 overflow-y-auto rounded-[var(--ui-radius-surface)] p-6 sm:max-w-lg">
          <DialogHeader className="pr-10">
            <DialogTitle>Connect your own web address</DialogTitle>
            <DialogDescription>
              Use a domain you already own, like yourbusiness.com.
            </DialogDescription>
          </DialogHeader>
          {mode === "connect" ? (
            <ExternalDomainFlow key={store.id} store={store} onDone={close} />
          ) : null}
        </DialogContent>
      </Dialog>
      <Sheet
        open={Boolean(mode) && mode !== "connect"}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) close()
        }}
      >
        {mode && mode !== "connect" ? (
          <DomainSheetContent
            key={`${store.id}:${mode}:${domainId}:${domainOrderId}`}
            closeError={closeError}
            mode={mode}
            store={store}
          />
        ) : null}
      </Sheet>
    </>
  )
}
