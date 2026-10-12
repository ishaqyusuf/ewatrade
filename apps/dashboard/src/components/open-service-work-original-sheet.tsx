"use client"

import { useServiceWorkOriginalParams } from "@/hooks/use-service-work-original-params"
import type { ServiceWorkOriginalTarget } from "@ewatrade/assistant/general/service-work-original"
import { Button } from "@ewatrade/ui"

export function OpenServiceWorkOriginalSheet({
  target,
}: { target: ServiceWorkOriginalTarget }) {
  const { open } = useServiceWorkOriginalParams()
  return (
    <Button variant="outline" size="sm" onClick={() => void open(target)}>
      Open original record
    </Button>
  )
}
