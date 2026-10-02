"use client"

import { DomainSheetContent } from "@/components/domains/domain-sheet-content"
import { useDomainParams } from "@/hooks/use-domain-params"
import { useTRPC } from "@/trpc/client"
import { Sheet } from "@ewatrade/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

export function DomainSheet({
  store,
}: {
  store: { id: string; name: string }
}) {
  const { domainId, domainOrderId, mode, setParams } = useDomainParams()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const open = Boolean(mode)
  const [closeError, setCloseError] = useState<string | null>(null)

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) return
        setCloseError(null)
        void (async () => {
          try {
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: trpc.domains.list.queryKey(),
              }),
              queryClient.invalidateQueries({
                queryKey: trpc.domains.registrantProfile.queryKey(),
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
      }}
    >
      {open ? (
        <DomainSheetContent
          key={`${store.id}:${mode}:${domainId}:${domainOrderId}`}
          closeError={closeError}
          mode={mode}
          store={store}
        />
      ) : null}
    </Sheet>
  )
}
