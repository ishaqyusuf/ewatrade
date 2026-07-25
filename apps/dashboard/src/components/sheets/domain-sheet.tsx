"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { DomainContent } from "@/components/domains/domain-content"
import { getDomainSheetHeader } from "@/components/domains/domain-sheet-header"
import { DomainFormProvider } from "@/components/domains/domain/form-context"
import { useDomainParams } from "@/hooks/use-domain-params"
import { useTRPC } from "@/trpc/client"
import { useQueryClient } from "@tanstack/react-query"

export function DomainSheet({
  store,
}: {
  store: { id: string; name: string }
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { mode, setParams } = useDomainParams()
  const header = mode ? getDomainSheetHeader(mode) : null

  async function close() {
    setParams(null)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.domains.list.queryKey() }),
      queryClient.invalidateQueries({
        queryKey: trpc.domains.registrantProfile.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.domains.order.queryKey(),
      }),
    ])
  }

  return (
    <DashboardSheet
      description={header?.description}
      onClose={close}
      open={Boolean(mode)}
      title={header?.title ?? "Domain"}
    >
      {mode ? (
        <DomainFormProvider key={mode}>
          <DomainContent store={store} />
        </DomainFormProvider>
      ) : null}
    </DashboardSheet>
  )
}
