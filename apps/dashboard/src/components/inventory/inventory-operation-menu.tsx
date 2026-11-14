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
  AlertDiamondIcon,
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
type InventoryAction = (typeof INVENTORY_ACTIONS)[number]

function useStartAction(balance?: BalanceContext, onAction?: () => void) {
  const { setParams } = useInventoryParams()
  return (action: InventoryAction) => {
    onAction?.()
    void setParams({
      inventoryOperation: action.mode,
      inventoryProduct: balance?.productId ?? null,
      inventoryStore: balance?.storeId ?? null,
      inventoryBalance: balance?.balanceSourceId ?? null,
      inventoryPreset: "preset" in action ? action.preset : null,
    })
  }
}

const stockIn = INVENTORY_ACTIONS[0]
const otherActions = INVENTORY_ACTIONS.slice(1)

/**
 * Page actions: Stock in is the everyday job, so it is one tap; the other
 * stock changes sit under More.
 */
export function InventoryActions() {
  const start = useStartAction()
  return (
    <>
      <Button
        type="button"
        className="max-sm:flex-1"
        onClick={() => start(stockIn)}
      >
        <HugeiconsIcon
          icon={Add01Icon}
          data-icon="inline-start"
          aria-hidden="true"
        />
        {stockIn.label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="max-sm:flex-1"
              aria-label="More stock changes"
            />
          }
        >
          More
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            data-icon="inline-end"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          appearance="dashboard"
          align="end"
          className="min-w-60"
        >
          {otherActions.map((action) => (
            <DropdownMenuItem key={action.label} onClick={() => start(action)}>
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

/** A stock line's ⋮ menu, with the product and store already chosen. */
export function InventoryOperationMenu({
  balance,
  onAction,
}: { balance: BalanceContext; onAction?: () => void }) {
  const { setParams } = useInventoryParams()
  const { open } = useCatalogDetailParams()
  const start = useStartAction(balance, onAction)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-row-interactive="true"
            aria-label={`Actions for ${balance.productName}, ${balance.variantName}, ${balance.inventoryUnitName}`}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <HugeiconsIcon icon={MoreVerticalIcon} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        appearance="dashboard"
        align="end"
        className="min-w-60"
      >
        {INVENTORY_ACTIONS.map((action) => (
          <DropdownMenuItem
            key={action.label}
            onClick={(event) => {
              event.stopPropagation()
              start(action)
            }}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation()
            onAction?.()
            void setParams({ inventoryLevel: balance.balanceSourceId })
          }}
        >
          <HugeiconsIcon icon={AlertDiamondIcon} aria-hidden="true" />
          Low-stock level
        </DropdownMenuItem>
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
