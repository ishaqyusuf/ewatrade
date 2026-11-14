"use client"
import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ewatrade/ui"
import {
  catalogImageUsage,
  catalogImagesForOption,
} from "@ewatrade/utils/catalog-image-editor"
import { productUsageLabels } from "@ewatrade/utils/product-usage"
import Link from "next/link"
import { CatalogPhotoPreview } from "../catalog-photo-preview"
import { type CatalogDetail, dateTime, money, orderHref } from "./display"
import { catalogDetailAffordances } from "./read-access"
export function CatalogDetailOverview({
  detail,
  storeId,
  readOnly,
  canCreateServiceJob,
}: {
  detail: CatalogDetail
  storeId: string
  readOnly: boolean
  canCreateServiceJob: boolean
}) {
  const { close, setView } = useCatalogDetailParams()
  const serviceWork = useServiceWorkParams()
  const { item, lastOrder } = detail
  const product = item.product
  const affordances = catalogDetailAffordances({
    readOnly,
    inventoryAllowed: detail.inventoryAllowed,
    canManageUsage: detail.canManageUsage,
  })
  // Stock consumed inside the business is recorded for Internal use or Both.
  const canRecordUse =
    !readOnly &&
    detail.inventoryAllowed &&
    (product?.usage === "INTERNAL_USE" || product?.usage === "BOTH")
  const units = product?.currentUnitConfiguration?.units ?? []
  const photos = affordances.privatePhotos
    ? item.photos.filter((photo) => photo.storeId === storeId)
    : []
  const showOptionPhotos = photos.some((photo) =>
    catalogImageUsage(photo).some((scope) => scope !== null),
  )
  const main =
    units.find((unit) => unit.stockBehavior === "canonical_shared") ??
    units.find((unit) => unit.factor === "1")
  const prices = item.variants.flatMap((variant) => {
    const photo =
      showOptionPhotos && variant.status !== "archived"
        ? catalogImagesForOption(photos, variant.id)[0]
        : undefined
    return variant.offerings.map((offering) => ({
      id: offering.id,
      photo,
      choice: item.variants.length > 1 ? variant.name : null,
      unit:
        units.find((unit) => unit.id === offering.productUnit?.inventoryUnitId)
          ?.name ?? offering.name,
      price:
        offering.pricingPolicy === "order_total"
          ? "Set when ordering"
          : offering.pricingPolicy === "quote_required" &&
              offering.fixedPriceMinor === null
            ? "Quote each job"
            : money(offering.fixedPriceMinor, offering.currencyCode),
      status: offering.status,
    }))
  })
  const packs = main
    ? units
        .filter((unit) => unit.id !== main.id)
        .map((unit) => `1 ${unit.name} = ${unit.factor} ${main.name}`)
    : []
  return (
    <div className="grid gap-6">
      <section className="grid gap-2" aria-label="Prices">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Prices</h3>
          {product && affordances.configureUnits ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void setView("units")}
            >
              Units
            </Button>
          ) : null}
        </div>
        <ul className="divide-y rounded-[var(--ui-radius-surface)] border">
          {prices.map((row) => (
            <li
              key={row.id}
              className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                {row.photo ? (
                  <CatalogPhotoPreview
                    key={row.photo.assetId}
                    compact
                    assetId={row.photo.assetId}
                    storeId={storeId}
                    label=""
                  />
                ) : null}
                <span className="min-w-0">
                  <span className="block truncate">
                    {row.choice ? `${row.choice} · ` : ""}
                    {row.unit}
                  </span>
                  {row.status === "active" ? null : (
                    <span className="block text-sm capitalize text-muted-foreground">
                      {row.status}
                    </span>
                  )}
                </span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {row.price}
              </span>
            </li>
          ))}
        </ul>
        {packs.length ? (
          <p className="text-sm text-muted-foreground">{packs.join(" · ")}</p>
        ) : null}
      </section>
      <div className={product ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>
        {product ? (
          <Card size="sm">
            <CardHeader>
              <CardDescription>In stock</CardDescription>
              <CardTitle>
                {!detail.inventoryAllowed
                  ? "Ask a manager"
                  : product.stockBalances.length
                    ? null
                    : "Not counted yet"}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {detail.inventoryAllowed ? (
                <>
                  {product.stockBalances.map((balance) => (
                    <p key={balance.id} className="tabular-nums">
                      {item.variants.length > 1
                        ? `${balance.variantName}: `
                        : ""}
                      <span className="font-semibold">
                        {balance.onHandQuantity} {balance.inventoryUnitName}
                      </span>
                      {Number(balance.reservedQuantity) > 0 ? (
                        <span className="text-sm text-muted-foreground">
                          {" "}
                          ({balance.reservedQuantity} held for orders)
                        </span>
                      ) : null}
                    </p>
                  ))}
                  <div className="flex flex-wrap items-center gap-3">
                    {canRecordUse ? (
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <Link
                            href={`/inventory?inventoryOperation=internal_use&inventoryProduct=${encodeURIComponent(product.id)}&inventoryQuery=${encodeURIComponent(item.name)}`}
                          />
                        }
                      >
                        Record use
                      </Button>
                    ) : null}
                    <Link
                      className="text-sm text-[var(--link)] underline underline-offset-4"
                      href={`/inventory?inventoryProduct=${encodeURIComponent(product.id)}&inventoryQuery=${encodeURIComponent(item.name)}`}
                    >
                      Open in Inventory
                    </Link>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        <Card size="sm">
          <CardHeader>
            <CardDescription>Last ordered</CardDescription>
            <CardTitle>
              {lastOrder ? dateTime(lastOrder.at) : "Not ordered yet"}
            </CardTitle>
          </CardHeader>
          {lastOrder ? (
            <CardContent className="grid gap-2">
              <p>
                {lastOrder.quantity} × {lastOrder.variantName}{" "}
                {lastOrder.unitName} · {lastOrder.customer}
              </p>
              <Link
                className="text-sm text-[var(--link)] underline underline-offset-4"
                href={orderHref(lastOrder.orderNumber)}
              >
                View {lastOrder.orderNumber}
              </Link>
            </CardContent>
          ) : null}
        </Card>
      </div>
      {product ? (
        <p className="text-sm text-muted-foreground">
          Use: {productUsageLabels[product.usage]}
        </p>
      ) : null}
      {item.description ? <p>{item.description}</p> : null}
      {item.kind === "service" && canCreateServiceJob ? (
        <div>
          <Button
            variant="outline"
            onClick={async () => {
              await close()
              await serviceWork.setParams({
                serviceSheet: "intake",
                jobId: null,
                jobStep: null,
                requestId: null,
              })
            }}
          >
            Create service job
          </Button>
        </div>
      ) : null}
    </div>
  )
}
