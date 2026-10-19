"use client"

import { useAssistantServiceRequestParams } from "@/hooks/use-assistant-service-request-params"
import {
  type ServiceRequestTarget,
  serviceRequestTargetSchema,
} from "@ewatrade/assistant/general/service-request-read"
import { Button } from "@ewatrade/ui"

export function OpenAssistantServiceRequestSheet({
  target,
}: { target: ServiceRequestTarget }) {
  const { open } = useAssistantServiceRequestParams()
  const parsed = serviceRequestTargetSchema.safeParse(target)
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!parsed.success}
      onClick={() => {
        if (parsed.success) void open(parsed.data)
      }}
    >
      Open request
    </Button>
  )
}
