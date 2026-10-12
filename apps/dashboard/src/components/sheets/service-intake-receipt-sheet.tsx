"use client"
import { ServiceIntakeReceiptContent } from "@/components/service-work/service-intake-receipt-content"
import { useServiceIntakeReceiptParams } from "@/hooks/use-service-intake-receipt-params"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { SheetFrame } from "./sheet-frame"

export function ServiceIntakeReceiptSheet({ timeZone }: { timeZone: string }) {
  const params = useServiceIntakeReceiptParams()
  const trpc = useTRPC()
  const query = useQuery(
    trpc.serviceAssistantIntake.receipt.queryOptions(
      { intakeId: params.intakeId ?? "" },
      {
        enabled: params.isOpen && Boolean(params.intakeId),
        retry: false,
        staleTime: 0,
      },
    ),
  )
  return (
    <Sheet
      open={params.isOpen}
      onOpenChange={(open) => {
        if (!open) void params.close()
      }}
    >
      {params.isOpen ? (
        <SheetFrame
          title="Service intake receipt"
          description="Original intake and current work links."
          footer={
            query.data && !query.isError && !query.isPaused ? (
              <Button
                variant="outline"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Refresh
              </Button>
            ) : null
          }
        >
          {!params.intakeId ? (
            <p role="alert">
              This intake link is invalid. Close it and open the original
              receipt.
            </p>
          ) : query.isPending || query.isFetching || query.isPaused ? (
            <output aria-live="polite">Loading original intake…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>
                This intake is unavailable for your current Store or access.
              </p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <ServiceIntakeReceiptContent
              receipt={query.data}
              timeZone={timeZone}
              onOpenOrder={(id) => void params.openOrder(id)}
              onOpenJob={(id) => void params.openJob(id)}
            />
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
