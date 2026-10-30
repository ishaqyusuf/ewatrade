"use client"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { Button } from "@ewatrade/ui"
import { ArrowExpand01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { useState } from "react"
import { QuickAssistantContent } from "./quick-assistant-content"
import {
  QuickAssistantFrame,
  QuickAssistantMinimize,
} from "./quick-assistant-frame"

export function QuickAssistantPanel({
  opened,
  onMinimize,
}: { opened: boolean; onMinimize: () => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <QuickAssistantFrame
      expanded={expanded}
      opened={opened}
      onMinimize={onMinimize}
    >
      <ErrorBoundary errorComponent={WorkspaceError}>
        <QuickAssistantContent
          active={opened}
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={expanded ? "Restore chat size" : "Expand chat"}
                aria-pressed={expanded}
                title={expanded ? "Restore chat size" : "Expand chat"}
                onClick={() => setExpanded((value) => !value)}
              >
                <HugeiconsIcon icon={ArrowExpand01Icon} className="size-4" />
              </Button>
              <QuickAssistantMinimize onMinimize={onMinimize} />
            </>
          }
        />
      </ErrorBoundary>
    </QuickAssistantFrame>
  )
}
