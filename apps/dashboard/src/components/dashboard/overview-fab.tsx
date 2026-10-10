"use client"

import { requestQuickAssistant } from "@/components/page-fab/fab-slot"
import { type PageFabAction, PageFabMenu } from "@/components/page-fab/page-fab"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useOrderParams } from "@/hooks/use-order-params"
import {
  BubbleChatIcon,
  Package01Icon,
  ShoppingCart01Icon,
  ToolsIcon,
} from "@hugeicons/core-free-icons"
import { useRouter } from "next/navigation"

export function OverviewFab({
  catalog,
  orders,
  assistant,
}: { catalog: boolean; orders: boolean; assistant: boolean }) {
  const router = useRouter()
  const { setParams } = useCatalogItemParams()
  const { setParams: setOrderParams } = useOrderParams()
  const actions: PageFabAction[] = []
  if (catalog)
    actions.push(
      {
        label: "Add product",
        icon: Package01Icon,
        onSelect: () =>
          void setParams({
            catalogItem: "create",
            catalogCreateKind: "product",
          }),
      },
      {
        label: "Add service",
        icon: ToolsIcon,
        onSelect: () =>
          void setParams({
            catalogItem: "create",
            catalogCreateKind: "service",
          }),
      },
    )
  if (orders)
    actions.push({
      label: "New order",
      icon: ShoppingCart01Icon,
      onSelect: () => void setOrderParams({ orderSheet: "create" }),
    })
  if (assistant)
    actions.push({
      label: "Assistant",
      icon: BubbleChatIcon,
      onSelect: () => {
        if (!requestQuickAssistant()) router.push("/assistant")
      },
    })
  if (actions.length === 0) return null
  // Listed top-down: the first action sits furthest from the button.
  return <PageFabMenu label="Quick add" actions={actions.reverse()} />
}
