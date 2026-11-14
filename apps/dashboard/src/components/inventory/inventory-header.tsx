"use client"

import type { ViewOption } from "@/components/view-switcher"
import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  GridViewIcon,
  LayoutTable01Icon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import type { ReactNode } from "react"
import { InventoryTabs } from "./inventory-tabs"

// The saved value stays "cards" so existing view cookies keep working.
export const inventoryViewOptions = [
  { value: "table", label: "Table", icon: LayoutTable01Icon },
  { value: "list", label: "List", icon: ListViewIcon },
  { value: "cards", label: "Grid", icon: GridViewIcon },
] as const satisfies readonly ViewOption<DirectoryView>[]

export const inventoryHistoryViewOptions = [
  { value: "table", label: "Table", icon: LayoutTable01Icon },
  { value: "list", label: "List", icon: ListViewIcon },
] as const satisfies readonly ViewOption<DirectoryView>[]

/** What every Inventory page gets from its route: who may see what. */
export type InventoryPageAccess = {
  /** The store picker; only for businesses with more than one store. */
  storePicker?: ReactNode
  /** Shipments post bills and stock cost: owners and admins only. */
  showShipments?: boolean
}

/**
 * Inventory pages share one header: the store being looked at (phones and
 * tablets; the top bar shows it from 1024px), the section tabs, then search
 * and the page's actions. The top bar already names the page.
 */
export function InventoryPageHeader({
  storePicker,
  showShipments = false,
  search,
  actions,
  children,
}: InventoryPageAccess & {
  search?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="grid min-w-0 gap-4">
      {storePicker ? (
        <div className="flex min-w-0 lg:hidden" data-inventory-store>
          {storePicker}
        </div>
      ) : null}
      <InventoryTabs showShipments={showShipments} />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {search ? (
          <div className="min-w-0 flex-1 basis-full sm:basis-72">{search}</div>
        ) : null}
        {actions ? (
          <div className="flex min-w-0 items-center gap-2 max-sm:w-full sm:ml-auto">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </header>
  )
}
