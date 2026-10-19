"use client"
import { AssistantWorkbench } from "@/components/general-assistant/assistant-workbench"
import { SetupAssistant } from "@/components/setup-assistant/setup-assistant"

/** The assistant page; the setup modal opens from its rail. */
export function AssistantHome() {
  return (
    <>
      <AssistantWorkbench />
      <SetupAssistant
        hasCatalogItems
        offerSetup={false}
        fallback={null}
        banner={false}
      />
    </>
  )
}
