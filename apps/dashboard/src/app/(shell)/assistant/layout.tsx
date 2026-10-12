import { AssistantHome } from "@/components/product-assistant/assistant-home"
import type { ReactNode } from "react"

/**
 * The chat lives in the layout so moving between /assistant and
 * /assistant/c/[id] keeps it mounted: drafts and streaming replies survive.
 * The pages only give each URL its own route.
 */
export default function AssistantLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AssistantHome />
      {children}
    </>
  )
}
