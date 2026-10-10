"use client"

import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { type ComponentProps, useState } from "react"
import { useCatalogThemeClass } from "./catalog-appearance"
import { CatalogItemKindChoices } from "./catalog-item-kind-choices"
import { CatalogItemSheetHeader } from "./catalog-item-sheet-header"
import { CatalogItemSkeleton } from "./catalog-item-skeleton"
import { CatalogItemForm } from "./form"
import { useCatalogItemForm } from "./form-context"

type CatalogItemContentProps = {
  finalFocus?: ComponentProps<typeof SheetFrame>["finalFocus"]
  closeError?: string | null
  allowKindChange?: boolean
  businessProfileKey?: string | null
  currencyCode: string
  onCreated: (name: string) => void
  storeId: string
}

export function CatalogItemContent(props: CatalogItemContentProps) {
  const themeClass = useCatalogThemeClass()
  const { form, setForm } = useCatalogItemForm()
  const { setParams, catalogConversation, catalogCreateMode } =
    useCatalogItemParams()
  const [footerHost, setFooterHost] = useState<HTMLDivElement | null>(null)
  return (
    <SheetFrame
      loadingFallback={
        <CatalogItemSkeleton chat={catalogCreateMode === "chat"} />
      }
      finalFocus={props.finalFocus}
      closeError={props.closeError}
      popupClassName={`${themeClass} ${catalogCreateMode === "chat" ? "sm:w-[min(1120px,95vw)] sm:max-w-[1120px]" : "sm:w-[min(900px,95vw)] sm:max-w-[900px]"}`}
      mobileBottomSheet={!form.kind}
      title={
        form.kind === "product"
          ? "Add product"
          : form.kind === "service"
            ? "Add service"
            : "Add item"
      }
      description={
        // Chat mode keeps the top compact; the chat itself explains the step.
        catalogCreateMode === "chat"
          ? undefined
          : form.kind === "product"
            ? "Name it and choose how you count it. Add details when you need them."
            : form.kind === "service"
              ? "Name the service, then set a fixed price or quote each job."
              : "Choose what you want to add."
      }
      header={
        props.allowKindChange === false ||
        catalogCreateMode === "chat" ? null : (
          <CatalogItemSheetHeader />
        )
      }
      // Chat mode has no form action, so it skips the empty footer bar.
      footer={
        form.kind && catalogCreateMode !== "chat" ? (
          <div className="w-full" ref={setFooterHost} />
        ) : undefined
      }
    >
      {form.kind ? (
        <CatalogItemForm
          key={catalogConversation ?? "new"}
          {...props}
          footerHost={footerHost}
        />
      ) : (
        <CatalogItemKindChoices
          onSelect={(kind) => {
            setForm((current) => ({ ...current, kind }))
            void setParams({ catalogCreateKind: kind })
          }}
        />
      )}
    </SheetFrame>
  )
}
