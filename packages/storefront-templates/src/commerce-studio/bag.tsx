"use client"

import { StorefrontArtwork } from "@ewatrade/storefront-runtime/primitives"
import {
  Alert,
  AlertDescription,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  buttonVariants,
} from "@ewatrade/ui"
import { Delete02Icon, ShoppingBag01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  type BagLine,
  bagTotals,
  formatMoney,
  lineTotalMinor,
  quantityProblem,
} from "./commerce"
import { useCommerceStudio } from "./context"
import { QuantityStepper } from "./product"

export function BagLines({
  lines,
  editable,
  notes,
}: {
  lines: BagLine[]
  editable: boolean
  notes?: Record<string, string>
}) {
  const { setQuantity, removeLine } = useCommerceStudio()
  return (
    <ul className="cs-bag-lines">
      {lines.map((line) => {
        const total = lineTotalMinor(line.priceMinor, line.quantity)
        const problem = quantityProblem(line.quantity, line.scale)
        const note = notes?.[line.offeringId]
        return (
          <li
            key={line.offeringId}
            className="cs-bag-line"
            data-issue={note ? true : undefined}
          >
            <span className="cs-bag-line__media">
              <StorefrontArtwork
                item={{
                  id: line.itemId,
                  name: line.itemName,
                  illustrationId: line.illustrationId,
                  photoUrl: line.photoUrl ?? undefined,
                  availability: null,
                }}
              />
            </span>
            <div className="cs-bag-line__body">
              <p className="cs-bag-line__name">{line.itemName}</p>
              {line.optionName ? (
                <p className="cs-muted">{line.optionName}</p>
              ) : null}
              <p className="cs-muted">
                {line.priceMinor === null
                  ? "Price on request"
                  : `${formatMoney(line.priceMinor, line.currencyCode)}${line.unitLabel ? ` per ${line.unitLabel}` : ""}`}
              </p>
              {note ? (
                <output className="cs-bag-line__issue">{note}</output>
              ) : null}
              {editable ? (
                <div className="cs-bag-line__controls">
                  <QuantityStepper
                    id={`qty-${line.offeringId}`}
                    value={line.quantity}
                    scale={line.scale}
                    label={`Quantity of ${line.itemName}`}
                    invalid={Boolean(problem)}
                    onChange={(value) => setQuantity(line.offeringId, value)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(line.offeringId)}
                    aria-label={`Remove ${line.itemName}`}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                    Remove
                  </Button>
                </div>
              ) : (
                <p className="cs-muted">
                  Qty {line.quantity}
                  {line.unitLabel ? ` ${line.unitLabel}` : ""}
                </p>
              )}
              {editable && problem ? (
                <p className="cs-bag-line__issue">{problem}</p>
              ) : null}
            </div>
            <p className="cs-bag-line__total">
              {total === null ? "—" : formatMoney(total, line.currencyCode)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

export function BagSheet() {
  const {
    bag,
    bagOpen,
    setBagOpen,
    clearBag,
    snapshot,
    href,
    ordering,
    themeStyle,
  } = useCommerceStudio()
  if (!ordering) return null
  const totals = bagTotals(bag.lines)
  const currency = bag.lines[0]?.currencyCode ?? snapshot.currencyCode
  const invalid = bag.lines.some((line) =>
    quantityProblem(line.quantity, line.scale),
  )
  return (
    <Sheet open={bagOpen} onOpenChange={setBagOpen}>
      <SheetContent
        side="right"
        className="cs-portal cs-bag-sheet"
        data-font={snapshot.composition.theme.font}
        style={themeStyle}
      >
        <SheetHeader>
          <SheetTitle>Your bag</SheetTitle>
          <SheetDescription>
            {bag.lines.length
              ? `${totals.count} ${totals.count === 1 ? "item" : "items"} from ${snapshot.resources.business.name}`
              : "Add items to send an order request."}
          </SheetDescription>
        </SheetHeader>
        <div className="cs-bag-sheet__body">
          {bag.persistence === "memory" ? (
            <Alert className="cs-note">
              <AlertDescription>
                This browser isn't saving your bag. It lasts until you close
                this page.
              </AlertDescription>
            </Alert>
          ) : null}
          {bag.recovered ? (
            <Alert className="cs-note">
              <AlertDescription>
                We couldn't read your saved bag, so it was reset.
              </AlertDescription>
            </Alert>
          ) : null}
          {bag.lines.length ? (
            <BagLines lines={bag.lines} editable />
          ) : (
            <Empty className="cs-empty cs-empty--compact">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={ShoppingBag01Icon} strokeWidth={1.6} />
                </EmptyMedia>
                <EmptyTitle>Your bag is empty</EmptyTitle>
                <EmptyDescription>
                  Browse the shop and add what you need.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
        {bag.lines.length ? (
          <SheetFooter className="cs-bag-sheet__footer">
            <div className="cs-total-row">
              <span>Subtotal</span>
              <strong>
                {totals.complete
                  ? formatMoney(totals.subtotal, currency)
                  : "To confirm"}
              </strong>
            </div>
            <p className="cs-fine">
              No payment now. The business confirms stock, any delivery fee and
              the total first.
            </p>
            <a
              className={buttonVariants({
                size: "lg",
                className: "cs-primary cs-full",
              })}
              href={href("/checkout")}
              aria-disabled={invalid || undefined}
              onClick={(event) => {
                if (invalid) event.preventDefault()
              }}
            >
              Continue to request
            </a>
            <Button variant="ghost" onClick={clearBag}>
              Clear bag
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
