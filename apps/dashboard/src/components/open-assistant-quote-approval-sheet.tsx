"use client"

import { useAssistantQuoteApprovalParams } from "@/hooks/use-assistant-quote-approval-params"
import {
  type QuoteApprovalTarget,
  quoteApprovalTargetSchema,
} from "@ewatrade/assistant/general/quote-reads"
import { Button } from "@ewatrade/ui"

export function OpenAssistantQuoteApprovalSheet({
  target,
}: { target: QuoteApprovalTarget }) {
  const { open } = useAssistantQuoteApprovalParams()
  const parsed = quoteApprovalTargetSchema.safeParse(target)
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!parsed.success}
      onClick={() => {
        if (parsed.success) void open(parsed.data)
      }}
    >
      Open quotation
    </Button>
  )
}
