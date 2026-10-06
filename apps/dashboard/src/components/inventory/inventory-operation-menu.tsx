"use client"

import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { INVENTORY_ACTIONS } from "@/lib/inventory-operations"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import { ArrowDown01Icon, MoreVerticalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

type BalanceContext = {
  storeId: string
  productId: string
  catalogItemId: string
  balanceSourceId: string
  productName: string
  variantName: string
  inventoryUnitName: string
}

export function InventoryOperationMenu({
  balance,
  onAction,
}: { balance?: BalanceContext; onAction?: () => void }) {
  const { setParams } = useInventoryParams()
  const { open } = useCatalogDetailParams()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant={balance ? "ghost" : "default"}
            size={balance ? "icon-sm" : "default"}
            className="rounded-none"
            data-row-interactive="true"
            aria-label={
              balance
                ? `Actions for ${balance.productName}, ${balance.variantName}, ${balance.inventoryUnitName}`
                : "Stock operation"
            }
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        {balance ? (
          <HugeiconsIcon icon={MoreVerticalIcon} aria-hidden="true" />
        ) : (
          <>
            Stock operation{" "}
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="ml-2 size-4"
              aria-hidden="true"
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent appearance="dashboard" align="end">
        {balance ? (
          <>
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation()
                onAction?.()
                void open(balance.catalogItemId)
              }}
            >
              View item
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {INVENTORY_ACTIONS.map((action) => (
          <DropdownMenuItem
            key={action.mode}
            onClick={(event) => {
              event.stopPropagation()
              onAction?.()
              void setParams({
                inventoryOperation: action.mode,
                inventoryProduct: balance?.productId ?? null,
                inventoryStore: balance?.storeId ?? null,
                inventoryBalance: balance?.balanceSourceId ?? null,
              })
            }}
          >
            {action.label === "Adjust" ? "Adjust stock" : action.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation()
            onAction?.()
            void setParams({
              inventoryOperation: "adjustment",
              inventoryProduct: balance?.productId ?? null,
              inventoryStore: balance?.storeId ?? null,
              inventoryBalance: balance?.balanceSourceId ?? null,
              inventoryPreset: "loss",
            })
          }}
        >
          Record damage or loss
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
