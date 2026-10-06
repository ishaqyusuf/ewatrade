"use client"
import {
  InlineRowCheckbox,
  InlineSelectAllCheckbox,
  InlineSelectionStatus,
  useInlineSelection,
} from "@/components/tables/core"
import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import Link from "next/link"
import { useMemo } from "react"
import { CatalogDetailActivity } from "./activity"
import { type CatalogDetail, dateTime, money, orderHref } from "./display"
export function CatalogDetailOverview({
  detail,
  storeId,
}: { detail: CatalogDetail; storeId: string }) {
  const { setParams, close } = useCatalogDetailParams()
  const { setParams: setItemParams } = useCatalogItemParams()
  const { item, lastOrder } = detail
  const product = item.product
  const units = product?.currentUnitConfiguration?.units ?? []
  const main =
    units.find((unit) => unit.stockBehavior === "canonical_shared") ??
    units.find((unit) => unit.factor === "1")
  const offeringIds = useMemo(
    () =>
      item.variants.flatMap((variant) =>
        variant.offerings.map((offering) => offering.id),
      ),
    [item.variants],
  )
  const offeringSelection = useInlineSelection({
    ids: offeringIds,
    scope: `${item.id}:${storeId}`,
  })
  return (
    <div className="grid gap-6">
      <div className={product ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Last ordered</CardDescription>
            <CardTitle>
              {lastOrder ? dateTime(lastOrder.at) : "Not ordered yet"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {lastOrder ? (
              <>
                <p>
                  {lastOrder.quantity} × {lastOrder.variantName}{" "}
                  {lastOrder.unitName} · {lastOrder.customer}
                </p>
                <Link
                  className="text-sm underline underline-offset-4"
                  href={orderHref(lastOrder.orderNumber)}
                >
                  View {lastOrder.orderNumber}
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                The latest non-cancelled recorded order will appear here.
              </p>
            )}
          </CardContent>
        </Card>
        {product ? (
          <Card size="sm">
            <CardHeader>
              <CardDescription>Stock on hand</CardDescription>
              <CardTitle>
                {!detail.inventoryAllowed
                  ? "Inventory access required"
                  : product.stockBalances.length
                    ? "Recorded balances"
                    : "Stock not recorded"}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {detail.inventoryAllowed ? (
                <>
                  {product.stockBalances.map((balance) => (
                    <p key={balance.id} className="text-sm">
                      {balance.variantName}: {balance.onHandQuantity}{" "}
                      {balance.inventoryUnitName}{" "}
                      <span className="text-muted-foreground">
                        ({balance.reservedQuantity} reserved)
                      </span>
                    </p>
                  ))}
                  {item.variants
                    .filter(
                      (variant) =>
                        !product.stockBalances.some(
                          (balance) => balance.variantId === variant.id,
                        ),
                    )
                    .map((variant) => (
                      <p
                        key={variant.id}
                        className="text-sm text-muted-foreground"
                      >
                        {variant.name}: stock not recorded
                      </p>
                    ))}
                  <Link
                    className="text-sm underline underline-offset-4"
                    href={`/inventory?inventoryProduct=${encodeURIComponent(product.id)}&inventoryQuery=${encodeURIComponent(item.name)}`}
                  >
                    View inventory
                  </Link>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ask a manager to view this store's stock.
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Current prices</h3>
          {product && detail.inventoryAllowed ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await close()
                await setItemParams({ productUnits: product.id })
              }}
            >
              Configure units
            </Button>
          ) : null}
        </div>
        <InlineSelectionStatus selection={offeringSelection} />
        <div className="overflow-x-auto border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <InlineSelectAllCheckbox
                    selection={offeringSelection}
                    label="Select all current prices"
                  />
                </TableHead>
                <TableHead>Choice</TableHead>
                <TableHead>Selling unit</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {item.variants.flatMap((variant) =>
                variant.offerings.map((offering) => (
                  <TableRow
                    key={offering.id}
                    data-state={
                      offeringSelection.isSelected(offering.id)
                        ? "selected"
                        : undefined
                    }
                  >
                    <TableCell>
                      <InlineRowCheckbox
                        selection={offeringSelection}
                        id={offering.id}
                        label={`Select ${variant.name} ${offering.name}`}
                      />
                    </TableCell>
                    <TableCell>{variant.name}</TableCell>
                    <TableCell>
                      {units.find(
                        (unit) =>
                          unit.id === offering.productUnit?.inventoryUnitId,
                      )?.name ?? offering.name}
                    </TableCell>
                    <TableCell>
                      {offering.pricingPolicy === "order_total"
                        ? "Enter price during order"
                        : offering.pricingPolicy === "quote_required" &&
                            offering.fixedPriceMinor === null
                          ? "Quote required"
                          : money(
                              offering.fixedPriceMinor,
                              offering.currencyCode,
                            )}
                    </TableCell>
                    <TableCell className="capitalize">
                      {offering.status}
                    </TableCell>
                  </TableRow>
                )),
              )}
            </TableBody>
          </Table>
        </div>
        {main ? (
          <p className="text-xs text-muted-foreground">
            {units
              .filter((unit) => unit.id !== main.id)
              .map(
                (unit) =>
                  `1 ${unit.name} = ${unit.factor} ${main.name}${unit.stockBehavior === "alternate_transaction" ? " · shared stock" : ""}`,
              )
              .join(" · ") || `Main unit: ${main.name}`}
          </p>
        ) : null}
      </section>
      {item.description ? (
        <p className="text-sm text-muted-foreground">{item.description}</p>
      ) : null}
      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Recent activity</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void setParams({
                catalogDetailTab: "activity",
                catalogActivity: null,
              })
            }
          >
            All activity
          </Button>
        </div>
        <CatalogDetailActivity
          itemId={item.id}
          storeId={storeId}
          inventoryAllowed={detail.inventoryAllowed && Boolean(product)}
          preview
        />
      </section>
    </div>
  )
}
