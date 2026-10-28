"use client"

import { StorefrontFeatureFrame } from "./frame"

import { CommerceLink } from "../commerce/navigation"

import type { PublicCatalogItem } from "@ewatrade/storefront-contracts/resources"
import { Button, buttonVariants } from "@ewatrade/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@ewatrade/ui/field"
import { Input } from "@ewatrade/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@ewatrade/ui/toggle-group"
import { ArrowLeft01Icon, WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useId, useRef, useState } from "react"
import {
  addDays,
  dateInZone,
  defaultBusinessTimeZone,
  formatMoney,
  formatPreferredDate,
  lineTotalMinor,
  offeringAvailability,
  preorderDates,
  quantityProblem,
  stockWording,
} from "../commerce/model"
import { useStorefrontCommerce } from "../commerce/provider"
import { CommerceGallery } from "./gallery"

export { QuantityStepper } from "./quantity-stepper"
import { QuantityStepper } from "./quantity-stepper"

export function ProductDetail({ item }: { item: PublicCatalogItem }) {
  return (
    <StorefrontFeatureFrame>
      <ProductDetailBody item={item} />
    </StorefrontFeatureFrame>
  )
}

function ProductDetailBody({ item }: { item: PublicCatalogItem }) {
  const { snapshot, ordering, addToBag, setBagOpen, href, preview, bag } =
    useStorefrontCommerce()
  const firstAvailable =
    item.options.find((option) => option.stock !== "out_of_stock") ??
    item.options[0]
  const [optionId, setOptionId] = useState(firstAvailable?.id ?? "")
  const [quantity, setQuantity] = useState("1")
  const [error, setError] = useState<string | null>(null)
  const [intent, setIntent] = useState<"purchase" | "preorder">("purchase")
  const [date, setDate] = useState("")
  const [dateError, setDateError] = useState<string | null>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const ids = {
    qty: useId(),
    qtyError: useId(),
    note: useId(),
    date: useId(),
  }
  const option =
    item.options.find((entry) => entry.id === optionId) ?? firstAvailable
  if (!option) return null
  const scale = option.unit?.scale ?? 0
  const unit = option.unit?.label ?? null
  const stock = stockWording(option.stock, option.lowStockQuantity)
  const { manualUnavailable, blockedNow, bookAhead } = offeringAvailability(
    item,
    option,
  )
  const priceOnRequest = option.priceMinor === null
  // Not available now: only a dated request ahead, and only when the business allows it.
  const requestAhead =
    bookAhead && (blockedNow || intent === "preorder") && !priceOnRequest
  const orderable = ordering && !priceOnRequest && (!blockedNow || bookAhead)
  const timeZone =
    snapshot.resources.business.timezone ?? defaultBusinessTimeZone
  const earliest = addDays(dateInZone(timeZone), 1)
  const problem = quantityProblem(quantity, scale)
  const total = lineTotalMinor(option.priceMinor, quantity)
  const whatsapp = snapshot.resources.contact.whatsAppPhone
  const enquiry = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hello ${snapshot.resources.business.name}, I'm interested in ${item.name}${item.options.length > 1 ? ` (${option.name})` : ""}.`,
      )}`
    : null
  const failDate = (message: string) => {
    setDateError(message)
    requestAnimationFrame(() => dateRef.current?.focus())
  }
  const add = () => {
    if (problem) {
      setError(problem)
      return
    }
    if (requestAhead) {
      if (!date) return failDate("Choose a date.")
      if (date < earliest) return failDate("Choose a date after today.")
      // One request carries one preferred date for everything requested ahead.
      const other = preorderDates(bag.lines).find((entry) => entry !== date)
      if (other)
        return failDate(
          `Your bag already has items requested ahead for ${formatPreferredDate(other)}. One request uses one date, so choose ${formatPreferredDate(other)} or send this separately.`,
        )
    }
    const failure = addToBag({
      itemId: item.id,
      offeringId: option.id,
      quantity,
      priceMinor: option.priceMinor,
      currencyCode: option.currencyCode,
      itemName: item.name.slice(0, 160),
      optionName: item.options.length > 1 ? option.name.slice(0, 160) : "",
      unitLabel: unit,
      scale,
      photoUrl: item.photoUrl ?? null,
      illustrationId: item.illustrationId,
      ...(requestAhead
        ? { intent: "preorder" as const, preferredDate: date }
        : {}),
    })
    if (failure) {
      setError(failure)
      return
    }
    setError(null)
    setDateError(null)
    // The bag sheet opens with focus on its title; a toast would cover that header.
    setBagOpen(true)
  }
  return (
    <article className="sf-feature-product sf-feature-wrap">
      <nav className="sf-feature-breadcrumb" aria-label="Breadcrumb">
        <CommerceLink href={href("/shop")}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          Shop
        </CommerceLink>
        {item.category ? (
          <>
            <span aria-hidden="true">/</span>
            <CommerceLink
              href={href(
                `/shop?category=${encodeURIComponent(item.category.id)}`,
              )}
            >
              {item.category.name}
            </CommerceLink>
          </>
        ) : null}
      </nav>
      <div className="sf-feature-product__grid">
        <div className="sf-feature-product__media">
          <CommerceGallery item={item} kind="product" />
        </div>
        <div className="sf-feature-product__info">
          <h1 className="sf-feature-display sf-feature-display--product">
            {item.name}
          </h1>
          <p className="sf-feature-product__price">
            {priceOnRequest ? (
              "Price on request"
            ) : (
              <>
                {formatMoney(option.priceMinor as number, option.currencyCode)}
                {unit ? (
                  <span className="sf-feature-unit"> per {unit}</span>
                ) : null}
              </>
            )}
          </p>
          {item.description ? (
            <p className="sf-feature-lead sf-feature-product__desc">
              {item.description}
            </p>
          ) : null}
          {item.options.length > 1 ? (
            <FieldSet className="sf-feature-options">
              <FieldLegend variant="label">Choose an option</FieldLegend>
              <ToggleGroup
                className="sf-feature-option-group"
                value={[option.id]}
                onValueChange={(value: string[]) => {
                  const next = value[0]
                  if (next) {
                    setOptionId(next)
                    setError(null)
                    setDateError(null)
                  }
                }}
                aria-label="Options"
              >
                {item.options.map((entry) => {
                  const wording = stockWording(
                    entry.stock,
                    entry.lowStockQuantity,
                  )
                  return (
                    <ToggleGroupItem
                      key={entry.id}
                      value={entry.id}
                      className="sf-feature-option"
                      aria-label={`${entry.name}, ${entry.priceMinor === null ? "price on request" : formatMoney(entry.priceMinor, entry.currencyCode)}, ${wording.label}`}
                    >
                      <span className="sf-feature-option__name">
                        {entry.name}
                      </span>
                      <span className="sf-feature-option__price">
                        {entry.priceMinor === null
                          ? "On request"
                          : formatMoney(entry.priceMinor, entry.currencyCode)}
                      </span>
                      {entry.stock === "low_stock" ||
                      entry.stock === "out_of_stock" ? (
                        <span
                          className="sf-feature-stock"
                          data-tone={wording.tone}
                        >
                          {wording.label}
                        </span>
                      ) : null}
                    </ToggleGroupItem>
                  )
                })}
              </ToggleGroup>
            </FieldSet>
          ) : null}
          {orderable && bookAhead && !blockedNow ? (
            <FieldSet className="sf-feature-options">
              <FieldLegend variant="label">When do you need it?</FieldLegend>
              <ToggleGroup
                className="sf-feature-option-group"
                value={[intent]}
                onValueChange={(value: string[]) => {
                  const next = value[0]
                  if (next === "purchase" || next === "preorder") {
                    setIntent(next)
                    setDateError(null)
                  }
                }}
                aria-label="When do you need it?"
              >
                <ToggleGroupItem value="purchase" className="sf-feature-option">
                  <span className="sf-feature-option__name">Now</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="preorder" className="sf-feature-option">
                  <span className="sf-feature-option__name">A later date</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </FieldSet>
          ) : null}
          {orderable && requestAhead ? (
            <Field
              className="sf-feature-qty"
              data-invalid={dateError ? true : undefined}
            >
              <FieldLabel htmlFor={ids.date}>Preferred date</FieldLabel>
              <FieldDescription id={`${ids.date}-help`}>
                A preference, not a reservation.{" "}
                {snapshot.resources.business.name} confirms stock and the date
                before you pay.
              </FieldDescription>
              <Input
                id={ids.date}
                ref={dateRef}
                type="date"
                min={earliest}
                value={date}
                aria-invalid={dateError ? true : undefined}
                aria-describedby={`${ids.date}-help${dateError ? ` ${ids.date}-error` : ""}`}
                onChange={(event) => {
                  setDate(event.target.value)
                  setDateError(null)
                }}
              />
              {dateError ? (
                <FieldError id={`${ids.date}-error`}>{dateError}</FieldError>
              ) : null}
            </Field>
          ) : null}
          {orderable ? (
            <Field
              className="sf-feature-qty"
              data-invalid={error ? true : undefined}
            >
              <FieldLabel htmlFor={ids.qty}>
                Quantity{unit ? ` (${unit})` : ""}
              </FieldLabel>
              <div className="sf-feature-qty__row">
                <QuantityStepper
                  id={ids.qty}
                  value={quantity}
                  scale={scale}
                  label="Quantity"
                  invalid={Boolean(error)}
                  describedBy={error ? ids.qtyError : undefined}
                  onChange={(value) => {
                    setQuantity(value)
                    setError(null)
                  }}
                />
                {requestAhead ? null : (
                  <span className="sf-feature-stock" data-tone={stock.tone}>
                    {stock.label}
                  </span>
                )}
              </div>
              {scale > 0 ? (
                <FieldDescription>
                  You can order part of a {unit ?? "unit"}, up to {scale}{" "}
                  decimal places.
                </FieldDescription>
              ) : null}
              {error ? (
                <FieldError id={ids.qtyError}>{error}</FieldError>
              ) : null}
            </Field>
          ) : null}
          <div className="sf-feature-product__actions">
            {blockedNow ? (
              <output
                className="sf-feature-stock sf-feature-stock--block"
                data-tone="out"
              >
                {bookAhead && !priceOnRequest
                  ? "Sold out now: request ahead"
                  : manualUnavailable
                    ? "Unavailable"
                    : item.options.length > 1
                      ? "This option is sold out."
                      : "Sold out right now."}
              </output>
            ) : null}
            {orderable ? (
              <Button
                size="lg"
                className="sf-feature-primary sf-feature-add"
                onClick={add}
                disabled={preview && false}
              >
                {requestAhead ? "Request ahead" : "Add to bag"}
                {total !== null
                  ? ` · ${formatMoney(total, option.currencyCode)}`
                  : ""}
              </Button>
            ) : null}
            {(!orderable || blockedNow) && enquiry ? (
              <CommerceLink
                className={buttonVariants({
                  size: "lg",
                  variant: orderable ? "outline" : "default",
                  className: "sf-feature-add",
                })}
                href={enquiry}
                target="_blank"
                rel="noreferrer"
              >
                <HugeiconsIcon icon={WhatsappIcon} strokeWidth={1.8} />
                Ask on WhatsApp
              </CommerceLink>
            ) : null}
          </div>
          {orderable && requestAhead ? (
            <p className="sf-feature-fine" id={ids.note}>
              This is a request ahead, not a reservation.{" "}
              {snapshot.resources.business.name} confirms stock, the date
              {snapshot.resources.commerce?.fulfilment.includes("delivery")
                ? " and any delivery fee"
                : ""}{" "}
              before you pay.
            </p>
          ) : orderable ? (
            <p className="sf-feature-fine" id={ids.note}>
              This is an order request. {snapshot.resources.business.name}{" "}
              confirms stock
              {snapshot.resources.commerce?.fulfilment.includes("delivery")
                ? " and any delivery fee"
                : ""}{" "}
              before you pay.
              {option.stock === "unknown"
                ? " Stock for this item is confirmed by the shop."
                : ""}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}
