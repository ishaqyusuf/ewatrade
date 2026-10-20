"use client"

import { SecondaryMenu } from "@/components/secondary-menu"

const INVENTORY_PAGES = [
  { path: "/inventory", label: "Stock" },
  { path: "/inventory/operations", label: "History" },
  { path: "/inventory/transfers", label: "Transfers" },
]

/** Stock, History and Transfers were only reachable from the sidebar. */
export function InventoryTabs() {
  return <SecondaryMenu items={INVENTORY_PAGES} label="Inventory" />
}
