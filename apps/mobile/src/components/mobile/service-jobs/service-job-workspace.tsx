import { ClassicServiceJobWorkspace } from "./classic-service-job-workspace"
import type { ServiceJobsModel } from "./use-service-jobs"

export function ServiceJobWorkspace({
  model,
  onLinesLayout,
  onPageChange,
}: {
  model: ServiceJobsModel
  onLinesLayout: (y: number) => void
  onPageChange: () => void
}) {
  if (!model.selectedJob) return null
  return (
    <ClassicServiceJobWorkspace
      model={model}
      onLinesLayout={onLinesLayout}
      onPageChange={onPageChange}
    />
  )
}
