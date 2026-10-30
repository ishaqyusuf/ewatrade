"use client"

import { loadSheetCode } from "@/components/sheets/load-sheet-code"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { useTRPC } from "@/trpc/client"
import { Sheet, type SheetContent } from "@ewatrade/ui"
import { minorToMajorInput } from "@ewatrade/utils/currency"
import { useQuery } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import type { ComponentProps, ReactNode } from "react"
import { useCatalogThemeClass } from "./catalog-appearance"
import { CatalogItemSkeleton } from "./catalog-item-skeleton"
import { CatalogItemFormProvider } from "./form-context"

const CatalogItemContent = dynamic(
  () =>
    loadSheetCode(
      () =>
        import("./catalog-item-content").then((mod) => mod.CatalogItemContent),
      CatalogItemFrame,
    ),
  { loading: () => <CatalogItemLoading /> },
)

function CatalogItemLoading() {
  const { catalogCreateMode } = useCatalogItemParams()
  return (
    <CatalogItemFrame>
      <CatalogItemSkeleton chat={catalogCreateMode === "chat"} />
    </CatalogItemFrame>
  )
}

/** Code loading and recovery keep the item sheet's frame and Close control. */
function CatalogItemFrame({ children }: { children: ReactNode }) {
  const themeClass = useCatalogThemeClass()
  return (
    <SheetFrame
      title="Item"
      popupClassName={`${themeClass} sm:w-[min(900px,95vw)] sm:max-w-[900px]`}
    >
      {children}
    </SheetFrame>
  )
}

type CatalogItemSheetProps = {
  finalFocus?: ComponentProps<typeof SheetContent>["finalFocus"]
  allowKindChange?: boolean
  businessProfileKey?: string | null
  currencyCode: string
  onCreated: (name: string) => void
  onSaved?: (name: string) => void
  storeId: string
}

export function CatalogItemSheet(props: CatalogItemSheetProps) {
  const {
    catalogItemMode,
    catalogCreateKind,
    catalogCreateName,
    catalogCreatePrice,
    catalogEditItemId,
    setCatalogItemMode,
  } = useCatalogItemParams()
  const editItemId = catalogItemMode === "edit" ? catalogEditItemId : null
  const open = catalogItemMode === "create" || Boolean(editItemId)
  const { closeError, requestClose } = useSheetDismissal(() =>
    setCatalogItemMode(null),
  )
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose()
      }}
    >
      {editItemId ? (
        <CatalogItemEdit
          {...props}
          itemId={editItemId}
          closeError={closeError}
        />
      ) : open ? (
        <CatalogItemFormProvider
          key={props.storeId}
          initialKind={catalogCreateKind}
          initialName={catalogCreateName ?? undefined}
          initialPrice={startingPrice(catalogCreatePrice)}
        >
          <CatalogItemContent {...props} closeError={closeError} />
        </CatalogItemFormProvider>
      ) : null}
    </Sheet>
  )
}

/** The `catalogCreatePrice` param is minor units; the form holds major-unit text. */
function startingPrice(minor: string | null) {
  const value = Number(minor)
  return minor && Number.isSafeInteger(value) && value > 0
    ? minorToMajorInput(value)
    : undefined
}

/** Editing opens the same sheet and form, filled from the saved item. */
function CatalogItemEdit({
  itemId,
  closeError,
  ...props
}: CatalogItemSheetProps & { itemId: string; closeError: string | null }) {
  const trpc = useTRPC()
  const themeClass = useCatalogThemeClass()
  const item = useQuery(trpc.catalog.getItem.queryOptions({ itemId }))
  if (!item.data)
    return (
      <SheetFrame
        title="Edit item"
        closeError={closeError}
        popupClassName={`${themeClass} sm:w-[min(900px,95vw)] sm:max-w-[900px]`}
      >
        {item.isPending ? (
          <CatalogItemSkeleton />
        ) : (
          <p role="alert" className="text-sm text-destructive">
            This item could not be opened. It may have been archived.
          </p>
        )}
      </SheetFrame>
    )
  return (
    <CatalogItemFormProvider
      key={`${item.data.id}:${item.data.updatedAt}`}
      initialKind={item.data.kind}
      initialName={item.data.name}
    >
      <CatalogItemContent
        {...props}
        allowKindChange={false}
        closeError={closeError}
        editItem={item.data}
      />
    </CatalogItemFormProvider>
  )
}
