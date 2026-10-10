"use client"

import { GeneralChat } from "@/components/general-assistant/general-chat"
import type { ReactNode } from "react"

export function QuickAssistantContent({ actions }: { actions?: ReactNode }) {
  return <GeneralChat actions={actions} />
}
