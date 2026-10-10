"use client"
import { AssistantWorkbench } from "@/components/general-assistant/assistant-workbench"
import { SetupAssistant } from "@/components/setup-assistant/setup-assistant"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

export function AssistantProductEntry({
  label = "Add with AI",
}: { label?: string }) {
  const trpc = useTRPC()
  const state = useQuery(trpc.productAssistant.capabilities.queryOptions())
  const { setParams } = useCatalogItemParams()
  if (!state.data?.enabled) return null
  return (
    <Button
      variant="outline"
      onClick={() =>
        void setParams({
          catalogItem: "create",
          catalogCreateKind: "product",
          catalogCreateMode: "chat",
          catalogConversation: null,
        })
      }
    >
      {label}
    </Button>
  )
}

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
