"use client"

import { CommerceLink } from "../commerce/navigation"

import { Alert, AlertDescription } from "@ewatrade/ui/alert"
import { Button, buttonVariants } from "@ewatrade/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@ewatrade/ui/empty"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@ewatrade/ui/sheet"
import {
  Cancel01Icon,
  Delete02Icon,
  ShoppingBag01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRef } from "react"
import {
  type BagLine,
  bagTotals,
  formatMoney,
  formatPreferredDate,
  isPreorderLine,
  lineTotalMinor,
  quantityProblem,
} from "../commerce/model"
import { useStorefrontCommerce } from "../commerce/provider"
import { storefrontItemHref } from "../links"
import { StorefrontArtwork } from "../primitives"
import { QuantityStepper } from "./quantity-stepper"

/** One note when a bag mixes items for now with items requested ahead. */
export function BagIntentNote({ lines }: { lines: BagLine[] }) {
  const ahead = lines.filter(isPreorderLine).length
  if (!ahead || ahead === lines.length) return null
  return (
    <Alert className="sf-feature-note">
      <AlertDescription>
        Some items are requested ahead. The business reviews the whole request
        before you pay.
      </AlertDescription>
    </Alert>
  )
}

export function BagLines({
  lines,
  editable,
  notes,
}: {
  lines: BagLine[]
  editable: boolean
  notes?: Record<string, string>
}) {
  const { setQuantity, removeLine, href, setBagOpen } = useStorefrontCommerce()
  return (
    <ul className="sf-feature-bag-lines">
      {lines.map((line) => {
        const total = lineTotalMinor(line.priceMinor, line.quantity)
        const problem = quantityProblem(line.quantity, line.scale)
        const note = notes?.[line.offeringId]
        return (
          <li
            key={line.offeringId}
            className="sf-feature-bag-line"
            data-issue={note ? true : undefined}
          >
            <CommerceLink
              className="sf-feature-bag-line__media"
              href={href(storefrontItemHref(line.itemId))}
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => setBagOpen(false)}
            >
              <StorefrontArtwork
                item={{
                  id: line.itemId,
                  name: line.itemName,
                  illustrationId: line.illustrationId,
                  photoUrl: line.photoUrl ?? undefined,
                  availability: null,
                }}
              />
            </CommerceLink>
            <div className="sf-feature-bag-line__body">
              <p className="sf-feature-bag-line__name">
                <CommerceLink
                  className="sf-feature-link"
                  href={href(storefrontItemHref(line.itemId))}
                  onClick={() => setBagOpen(false)}
                >
                  {line.itemName}
                </CommerceLink>
              </p>
              {line.optionName ? (
                <p className="sf-feature-muted">{line.optionName}</p>
              ) : null}
              <p className="sf-feature-muted">
                {line.priceMinor === null
                  ? "Price on request"
                  : `${formatMoney(line.priceMinor, line.currencyCode)}${line.unitLabel ? ` per ${line.unitLabel}` : ""}`}
              </p>
              {isPreorderLine(line) ? (
                <p className="sf-feature-bag-line__tag">
                  Request ahead
                  {line.preferredDate
                    ? ` · ${formatPreferredDate(line.preferredDate)}`
                    : ""}
                </p>
              ) : null}
              {note ? (
                <output className="sf-feature-bag-line__issue">{note}</output>
              ) : null}
              {editable ? (
                <div className="sf-feature-bag-line__controls">
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
                <p className="sf-feature-muted">
                  Qty {line.quantity}
                  {line.unitLabel ? ` ${line.unitLabel}` : ""}
                </p>
              )}
              {editable && problem ? (
                <p className="sf-feature-bag-line__issue">{problem}</p>
              ) : null}
            </div>
            <p className="sf-feature-bag-line__total">
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
  } = useStorefrontCommerce()
  // Open on the title, not the first quantity input: phones would raise the keyboard.
  const titleRef = useRef<HTMLHeadingElement>(null)
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
        className="sf-feature-portal sf-feature-bag-sheet"
        data-font={snapshot.composition.theme.font}
        style={themeStyle}
        initialFocus={titleRef}
      >
        <SheetHeader className="sf-feature-bag-sheet__header">
          <div>
            <SheetTitle
              ref={titleRef}
              tabIndex={-1}
              className="sf-feature-sheet-title"
            >
              Your bag
            </SheetTitle>
            <SheetDescription>
              {bag.lines.length
                ? `${totals.count} ${totals.count === 1 ? "item" : "items"} from ${snapshot.resources.business.name}`
                : "Add items to send an order request."}
            </SheetDescription>
          </div>
          {/* Full-screen on phones: touch users need a visible way back. */}
          <SheetClose
            render={<Button variant="ghost" size="icon-lg" />}
            aria-label="Close bag"
            className="sf-feature-bag-sheet__close"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
          </SheetClose>
        </SheetHeader>
        <div className="sf-feature-bag-sheet__body">
          {bag.persistence === "memory" ? (
            <Alert className="sf-feature-note">
              <AlertDescription>
                This browser isn't saving your bag. It lasts until you close
                this page.
              </AlertDescription>
            </Alert>
          ) : null}
          {bag.recovered ? (
            <Alert className="sf-feature-note">
              <AlertDescription>
                We couldn't read your saved bag, so it was reset.
              </AlertDescription>
            </Alert>
          ) : null}
          {bag.lines.length ? (
            <>
              <BagIntentNote lines={bag.lines} />
              <BagLines lines={bag.lines} editable />
            </>
          ) : (
            <Empty className="sf-feature-empty sf-feature-empty--compact">
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
          <SheetFooter className="sf-feature-bag-sheet__footer">
            <div className="sf-feature-total-row">
              <span>Subtotal</span>
              <strong>
                {totals.complete
                  ? formatMoney(totals.subtotal, currency)
                  : "To confirm"}
              </strong>
            </div>
            <p className="sf-feature-fine">
              No payment now. The business confirms stock, any delivery fee and
              the total first.
            </p>
            <CommerceLink
              className={buttonVariants({
                size: "lg",
                className: "sf-feature-primary sf-feature-full",
              })}
              href={href("/checkout")}
              aria-disabled={invalid || undefined}
              onClick={(event) => {
                if (invalid) event.preventDefault()
                else setBagOpen(false)
              }}
            >
              Continue to request
            </CommerceLink>
            <Button variant="ghost" onClick={clearBag}>
              Clear bag
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
