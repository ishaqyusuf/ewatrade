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
import {
  Add01Icon,
  ArrowDown01Icon,
  MoreVerticalIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons"
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

/** Update stock: the header button, or a row's ⋮ menu with the product preselected. */
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
                : "Update stock"
            }
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        {balance ? (
          <HugeiconsIcon icon={MoreVerticalIcon} aria-hidden="true" />
        ) : (
          <>
            <HugeiconsIcon
              icon={Add01Icon}
              data-icon="inline-start"
              aria-hidden="true"
            />
            Update stock
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              data-icon="inline-end"
              aria-hidden="true"
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        appearance="dashboard"
        align="end"
        className="min-w-64"
      >
        {balance ? (
          <>
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation()
                onAction?.()
                void open(balance.catalogItemId)
              }}
            >
              <HugeiconsIcon icon={ViewIcon} aria-hidden="true" />
              View product
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {INVENTORY_ACTIONS.map((action) => (
          <DropdownMenuItem
            key={action.label}
            className="items-start"
            onClick={(event) => {
              event.stopPropagation()
              onAction?.()
              void setParams({
                inventoryOperation: action.mode,
                inventoryProduct: balance?.productId ?? null,
                inventoryStore: balance?.storeId ?? null,
                inventoryBalance: balance?.balanceSourceId ?? null,
                inventoryPreset: "preset" in action ? action.preset : null,
              })
            }}
          >
            <span className="flex flex-col">
              <span className="font-medium">{action.label}</span>
              <span className="text-xs text-muted-foreground">
                {action.hint}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
