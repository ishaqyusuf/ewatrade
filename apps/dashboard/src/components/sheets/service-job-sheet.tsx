"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { ServiceJobWorkspace } from "@/components/service-work/service-job-workspace"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"

export function ServiceJobSheet({ canManage }: { canManage: boolean }) {
  const { jobId, setParams, sheet } = useServiceWorkParams()
  const open = sheet === "job" && Boolean(jobId)

  return (
    <DashboardSheet
      open={open}
      onClose={() => setParams(null)}
      title="Service Job"
      description="Line progress, evidence, assignment, promises, and customer-safe updates."
    >
      {jobId ? (
        <ServiceJobWorkspace canManage={canManage} jobId={jobId} />
      ) : null}
    </DashboardSheet>
  )
}
