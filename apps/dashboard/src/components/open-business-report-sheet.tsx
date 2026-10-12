"use client"
import { useBusinessReportParams } from "@/hooks/use-business-report-params"
import type { BusinessReportTarget } from "@ewatrade/assistant/general/business-report-target"
import { Button } from "@ewatrade/ui"
export function OpenBusinessReportSheet({
  target,
}: { target: BusinessReportTarget }) {
  const { open } = useBusinessReportParams()
  return (
    <Button variant="outline" size="sm" onClick={() => void open(target)}>
      Open report
    </Button>
  )
}
