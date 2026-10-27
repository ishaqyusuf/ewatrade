"use client"

import { StorefrontArtwork } from "@ewatrade/storefront-runtime/primitives"
import {
  Button,
  ButtonGroup,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
  ToggleGroup,
  ToggleGroupItem,
  buttonVariants,
} from "@ewatrade/ui"
import {
  ArrowLeft01Icon,
  MinusSignIcon,
  PlusSignIcon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useId, useState } from "react"
import type { PublicCatalogItem } from "../../../storefront-contracts/src/resources"
import {
  formatMoney,
  lineTotalMinor,
  quantityProblem,
  stepQuantity,
  stockWording,
} from "./commerce"
import { useCommerceStudio } from "./context"

export function QuantityStepper({
  id,
  value,
  scale,
  onChange,
  label,
  invalid,
  describedBy,
  max,
}: {
  id: string
  value: string
  scale: number
  onChange: (value: string) => void
  label: string
  invalid?: boolean
  describedBy?: string
  max?: number
}) {
  const atMax = max !== undefined && Number(value) >= max
  return (
    <ButtonGroup className="cs-stepper" aria-label={label}>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={Number(value) <= 1}
        onClick={() => onChange(stepQuantity(value, -1, scale))}
      >
        <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
      </Button>
      <Input
        id={id}
        className="cs-stepper__input"
        value={value}
        inputMode={scale > 0 ? "decimal" : "numeric"}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) =>
          onChange(event.target.value.replace(/[^\d.]/g, "").slice(0, 11))
        }
      />
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={atMax}
        onClick={() => onChange(stepQuantity(value, 1, scale))}
      >
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
      </Button>
    </ButtonGroup>
  )
}

export function ProductDetail({ item }: { item: PublicCatalogItem }) {
  const { snapshot, ordering, addToBag, setBagOpen, href, preview } =
    useCommerceStudio()
  const firstAvailable =
    item.options.find((option) => option.stock !== "out_of_stock") ??
    item.options[0]
  const [optionId, setOptionId] = useState(firstAvailable?.id ?? "")
  const [quantity, setQuantity] = useState("1")
  const [error, setError] = useState<string | null>(null)
  const ids = { qty: useId(), qtyError: useId(), note: useId() }
  const option =
    item.options.find((entry) => entry.id === optionId) ?? firstAvailable
  if (!option) return null
  const scale = option.unit?.scale ?? 0
  const unit = option.unit?.label ?? null
  const stock = stockWording(option.stock)
  const soldOut =
    option.stock === "out_of_stock" || option.availability === "OUT_OF_STOCK"
  const priceOnRequest = option.priceMinor === null
  const problem = quantityProblem(quantity, scale)
  const total = lineTotalMinor(option.priceMinor, quantity)
  const whatsapp = snapshot.resources.contact.whatsAppPhone
  const enquiry = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hello ${snapshot.resources.business.name}, I'm interested in ${item.name}${item.options.length > 1 ? ` (${option.name})` : ""}.`,
      )}`
    : null
  const add = () => {
    if (problem) {
      setError(problem)
      return
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
    })
    if (failure) {
      setError(failure)
      return
    }
    setError(null)
    // The bag sheet opens with focus on its title; a toast would cover that header.
    setBagOpen(true)
  }
  return (
    <article className="cs-product cs-wrap">
      <nav className="cs-breadcrumb" aria-label="Breadcrumb">
        <a href={href("/shop")}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          Shop
        </a>
        {item.category ? (
          <>
            <span aria-hidden="true">/</span>
            <a
              href={href(
                `/shop?category=${encodeURIComponent(item.category.id)}`,
              )}
            >
              {item.category.name}
            </a>
          </>
        ) : null}
      </nav>
      <div className="cs-product__grid">
        <div className="cs-product__media">
          <StorefrontArtwork item={{ ...item, availability: null }} />
        </div>
        <div className="cs-product__info">
          <h1 className="cs-display cs-display--product">{item.name}</h1>
          <p className="cs-product__price">
            {priceOnRequest ? (
              "Price on request"
            ) : (
              <>
                {formatMoney(option.priceMinor as number, option.currencyCode)}
                {unit ? <span className="cs-unit"> per {unit}</span> : null}
              </>
            )}
          </p>
          {item.description ? (
            <p className="cs-lead cs-product__desc">{item.description}</p>
          ) : null}
          {item.options.length > 1 ? (
            <FieldSet className="cs-options">
              <FieldLegend variant="label">Choose an option</FieldLegend>
              <ToggleGroup
                className="cs-option-group"
                value={[option.id]}
                onValueChange={(value: string[]) => {
                  const next = value[0]
                  if (next) {
                    setOptionId(next)
                    setError(null)
                  }
                }}
                aria-label="Options"
              >
                {item.options.map((entry) => {
                  const wording = stockWording(entry.stock)
                  return (
                    <ToggleGroupItem
                      key={entry.id}
                      value={entry.id}
                      className="cs-option"
                      aria-label={`${entry.name}, ${entry.priceMinor === null ? "price on request" : formatMoney(entry.priceMinor, entry.currencyCode)}, ${wording.label}`}
                    >
                      <span className="cs-option__name">{entry.name}</span>
                      <span className="cs-option__price">
                        {entry.priceMinor === null
                          ? "On request"
                          : formatMoney(entry.priceMinor, entry.currencyCode)}
                      </span>
                      {entry.stock === "low_stock" ||
                      entry.stock === "out_of_stock" ? (
                        <span className="cs-stock" data-tone={wording.tone}>
                          {wording.label}
                        </span>
                      ) : null}
                    </ToggleGroupItem>
                  )
                })}
              </ToggleGroup>
            </FieldSet>
          ) : null}
          {ordering && !priceOnRequest && !soldOut ? (
            <Field className="cs-qty" data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={ids.qty}>
                Quantity{unit ? ` (${unit})` : ""}
              </FieldLabel>
              <div className="cs-qty__row">
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
                <span className="cs-stock" data-tone={stock.tone}>
                  {stock.label}
                </span>
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
          <div className="cs-product__actions">
            {soldOut ? (
              <output className="cs-stock cs-stock--block" data-tone="out">
                {item.options.length > 1
                  ? "This option is sold out."
                  : "Sold out right now."}
              </output>
            ) : null}
            {ordering && !priceOnRequest && !soldOut ? (
              <Button
                size="lg"
                className="cs-primary cs-add"
                onClick={add}
                disabled={preview && false}
              >
                Add to bag
                {total !== null
                  ? ` · ${formatMoney(total, option.currencyCode)}`
                  : ""}
              </Button>
            ) : null}
            {(priceOnRequest || soldOut || !ordering) && enquiry ? (
              <a
                className={buttonVariants({
                  size: "lg",
                  variant:
                    ordering && !priceOnRequest && !soldOut
                      ? "outline"
                      : "default",
                  className: "cs-add",
                })}
                href={enquiry}
                target="_blank"
                rel="noreferrer"
              >
                <HugeiconsIcon icon={WhatsappIcon} strokeWidth={1.8} />
                Ask on WhatsApp
              </a>
            ) : null}
          </div>
          {ordering && !priceOnRequest && !soldOut ? (
            <p className="cs-fine" id={ids.note}>
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
