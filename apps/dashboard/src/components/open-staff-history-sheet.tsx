"use client"
import { useStaffHistoryParams } from "@/hooks/use-staff-history-params"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { Button } from "@ewatrade/ui"

export function OpenStaffHistorySheet({
  target,
}: {
  target: Extract<
    NonNullable<GeneralAnswer["target"]>,
    { kind: "staff_history" }
  >
}) {
  const { open } = useStaffHistoryParams()
  return (
    <Button variant="outline" size="sm" onClick={() => void open(target)}>
      Open history
    </Button>
  )
}
