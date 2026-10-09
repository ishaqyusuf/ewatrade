"use client"
import { GeneralChat } from "@/components/general-assistant/general-chat"
import { PageHeader } from "@/components/page-header"
import { SetupAssistant } from "@/components/setup-assistant/setup-assistant"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { AssistantAllowance } from "./assistant-allowance"

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

export function AssistantHome() {
  const trpc = useTRPC()
  const state = useQuery(trpc.productAssistant.capabilities.queryOptions())
  const { setParams } = useCatalogItemParams()
  return (
    <div className="flex flex-1 flex-col gap-6 py-6">
      <PageHeader
        title="AI assistant"
        description="Ask about your business, record everyday work, add products and continue setting up."
      />
      <GeneralChat />
      {state.isPending ? (
        <output>Loading your assistant…</output>
      ) : state.isError ? (
        <div>
          <p>We couldn't load your assistant.</p>
          <Button onClick={() => void state.refetch()}>Retry</Button>
        </div>
      ) : !state.data?.enabled ? (
        <p>
          Adding products with AI isn't available for this business. You can
          still add products in Catalog.
        </p>
      ) : (
        <>
          <section className="rounded-lg border p-6">
            <h2 className="text-lg font-semibold">
              What product would you like to add?
            </h2>
            <p className="mb-4 mt-2 text-sm text-muted-foreground">
              Describe what you sell or use. We'll help you prepare one product,
              then you review it before creating.
            </p>
            <AssistantProductEntry label="Add product with AI" />
            {state.data.drafts.length ? (
              <div className="mt-5 space-y-2">
                <h3 className="text-sm font-medium">
                  Unfinished product drafts
                </h3>
                {state.data.drafts.map((draft) => (
                  <Button
                    key={draft.id}
                    variant="ghost"
                    className="block"
                    onClick={() =>
                      void setParams({
                        catalogItem: "create",
                        catalogCreateKind: "product",
                        catalogCreateMode: "chat",
                        catalogConversation: draft.id,
                      })
                    }
                  >
                    Continue {draft.title ?? "product draft"}
                  </Button>
                ))}
              </div>
            ) : null}
          </section>
          <AssistantAllowance />
          <SetupAssistant hasCatalogItems offerSetup={false} fallback={null} />
        </>
      )}
    </div>
  )
}
