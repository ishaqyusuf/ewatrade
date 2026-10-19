"use client"

import { useAssistantManualMessageParams } from "@/hooks/use-assistant-manual-message-params"
import {
  type ServiceManualMessageTarget,
  serviceManualMessageTargetSchema,
} from "@ewatrade/assistant/general/service-message-read"
import { Button } from "@ewatrade/ui"

export function OpenAssistantManualMessageSheet({
  target,
}: { target: ServiceManualMessageTarget }) {
  const { open } = useAssistantManualMessageParams()
  const parsed = serviceManualMessageTargetSchema.safeParse(target)
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!parsed.success}
      onClick={() => {
        if (parsed.success) void open(parsed.data)
      }}
    >
      Open shared message
    </Button>
  )
}
