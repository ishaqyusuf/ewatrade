"use client"

import { GeneralChat } from "@/components/general-assistant/general-chat"
import type { ReactNode } from "react"

export function QuickAssistantContent({
  actions,
  active,
}: { actions?: ReactNode; active?: boolean }) {
  return <GeneralChat actions={actions} active={active} />
}
