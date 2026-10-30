"use client"

import { loadSheetCode } from "@/components/sheets/load-sheet-code"
import { SheetBodyLoading, SheetFrame } from "@/components/sheets/sheet-frame"
import { useStorefrontParams } from "@/hooks/use-storefront-params"
import { Sheet } from "@ewatrade/ui"
import dynamic from "next/dynamic"
import { type ComponentProps, type ReactNode, useState } from "react"
import type { StorefrontContentPanel as ContentPanel } from "./storefront-content-panel"
import "./storefront-content.css"

type StorefrontContentSheetProps = ComponentProps<typeof ContentPanel>

const StorefrontContentPanel = dynamic(
  () =>
    loadSheetCode(
      () =>
        import("./storefront-content-panel").then(
          (mod) => mod.StorefrontContentPanel,
        ),
      StorefrontContentFrame,
    ),
  {
    loading: () => (
      <StorefrontContentFrame>
        <SheetBodyLoading />
      </StorefrontContentFrame>
    ),
  },
)

/** Code loading and recovery keep the generator's sheet, title and Close. */
function StorefrontContentFrame({ children }: { children: ReactNode }) {
  const params = useStorefrontParams()
  return (
    <Sheet
      open={!!params.content}
      onOpenChange={(next) => {
        if (!next) void params.setParams({ content: null })
      }}
    >
      <SheetFrame
        title="Generate content"
        popupClassName="sf-content-sheet sm:w-[min(650px,95vw)] sm:max-w-[650px]"
        headerClassName="sf-content-sheet-header"
        contentClassName="sf-content-sheet-body"
        finalFocus={() =>
          document.querySelector<HTMLElement>(
            "[data-storefront-content-trigger]",
          ) ?? false
        }
      >
        {children}
      </SheetFrame>
    </Sheet>
  )
}

export function StorefrontContentSheet(props: StorefrontContentSheetProps) {
  const { content } = useStorefrontParams()
  const open = !!content
  // First open activates the generator; it then stays mounted, so its draft,
  // run, review and form state survive closing and reopening as before.
  const [activated, setActivated] = useState(open)
  if (open && !activated) setActivated(true)
  // Its area scope still starts from the section selected when Studio mounted.
  const [initialSectionId] = useState(props.sectionId)
  if (!activated) return null
  return <StorefrontContentPanel {...props} sectionId={initialSectionId} />
}
