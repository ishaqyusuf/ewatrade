"use client"

import { SecondaryMenu } from "@/components/secondary-menu"

const INVENTORY_PAGES = [
  { path: "/inventory", label: "Stock" },
  { path: "/inventory/operations", label: "History" },
  { path: "/inventory/transfers", label: "Transfers" },
]
const SHIPMENTS = { path: "/inventory/shipments", label: "Shipments" }

/** Shipments only shows to roles its page lets in (owners and admins). */
export function InventoryTabs({
  showShipments = false,
}: { showShipments?: boolean }) {
  return (
    <SecondaryMenu
      items={showShipments ? [...INVENTORY_PAGES, SHIPMENTS] : INVENTORY_PAGES}
      label="Inventory"
    />
  )
}
