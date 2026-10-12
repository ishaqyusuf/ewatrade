"use client"
import { useStaffDirectorySheetParams } from "@/hooks/use-staff-directory-sheet-params"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { Button } from "@ewatrade/ui"

export function OpenStaffDirectorySheet({
  target,
}: {
  target: Extract<
    NonNullable<GeneralAnswer["target"]>,
    { kind: "staff_directory" }
  >
}) {
  const { open } = useStaffDirectorySheetParams()
  return (
    <Button variant="outline" size="sm" onClick={() => void open(target)}>
      Open directory
    </Button>
  )
}
