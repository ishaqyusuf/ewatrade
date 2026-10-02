"use client"

import { ServiceJobWorkspace } from "@/components/service-work/service-job-workspace"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet } from "@ewatrade/ui"

export function ServiceJobSheet({
  canManage,
  storeId,
}: {
  canManage: boolean
  storeId: string
}) {
  const { jobId, setParams, sheet } = useServiceWorkParams()
  const open = sheet === "job" && Boolean(jobId)
  const { closeError, requestClose } = useSheetDismissal(() => setParams(null))

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose()
      }}
    >
      {open && jobId ? (
        <SheetFrame
          closeError={closeError}
          title="Service Job"
          description="Line progress, evidence, assignment, promises, and customer-safe updates."
        >
          <ServiceJobWorkspace
            canManage={canManage}
            jobId={jobId}
            key={`${storeId}:${jobId}:${canManage}`}
          />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
