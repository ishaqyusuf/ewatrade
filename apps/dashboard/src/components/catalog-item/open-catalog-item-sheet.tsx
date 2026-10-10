"use client"

import { PageFab } from "@/components/page-fab/page-fab"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useSmallScreen } from "@/hooks/use-small-screen"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sheet,
  SheetTrigger,
} from "@ewatrade/ui"
import { Add01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRef, useState } from "react"
import { useCatalogThemeClass } from "./catalog-appearance"
import {
  CatalogItemKindChoices,
  CatalogItemKindLabel,
  catalogItemKinds,
} from "./catalog-item-kind-choices"
import type { SimpleCatalogItemKind } from "./form-context"

export function OpenCatalogItemSheet() {
  const themeClass = useCatalogThemeClass()
  const { setParams } = useCatalogItemParams()
  const smallScreen = useSmallScreen()
  const [chooserOpen, setChooserOpen] = useState(false)
  const choosing = useRef(false)
  function choose(kind: SimpleCatalogItemKind) {
    choosing.current = true
    setChooserOpen(false)
    void setParams({ catalogItem: "create", catalogCreateKind: kind })
  }
  const label = <HugeiconsIcon icon={Add01Icon} className="size-4" />
  if (smallScreen)
    return (
      <Sheet
        open={chooserOpen}
        onOpenChange={(open) => {
          if (open) choosing.current = false
          setChooserOpen(open)
        }}
      >
        <SheetTrigger render={<PageFab label="Add item" />} />
        <SheetFrame
          popupClassName={themeClass}
          title="Add item"
          description="Choose what you want to add."
          mobileBottomSheet
          finalFocus={() => !choosing.current}
        >
          <CatalogItemKindChoices onSelect={choose} />
        </SheetFrame>
      </Sheet>
    )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Add item"
            className="rounded-none"
          />
        }
      >
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        appearance="dashboard"
        align="end"
        sideOffset={8}
        className={`${themeClass} w-80 max-w-[calc(100vw-32px)]`}
      >
        <DropdownMenuGroup>
          {catalogItemKinds.map(({ kind }) => (
            <DropdownMenuItem
              key={kind}
              className="gap-3 py-3"
              onClick={() => choose(kind)}
            >
              <CatalogItemKindLabel kind={kind} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
