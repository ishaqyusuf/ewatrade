"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
  RadioGroup,
  RadioGroupItem,
  Spinner,
  Textarea,
  buttonVariants,
} from "@ewatrade/ui"
import { ArrowLeft01Icon, UserIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useId, useRef, useState } from "react"
import { BagLines } from "./bag"
import {
  type BagLine,
  bagTotals,
  formatMoney,
  issueMessage,
  newClientId,
  quantityProblem,
  stockWording,
} from "./commerce"
import { useCommerceStudio } from "./context"

type Fields = {
  customerName: string
  customerPhone: string
  customerEmail: string
  fulfilment: "pickup" | "delivery"
  deliveryAddress: string
  notes: string
}

/** Same request ID while the bag and details are unchanged, so a retry can't duplicate. */
function stableRequestId(fingerprint: string) {
  const key = "ewatrade.storefront.pending-request"
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as {
      fingerprint: string
      id: string
    } | null
    if (stored?.fingerprint === fingerprint) return stored.id
    const id = newClientId()
    window.sessionStorage.setItem(key, JSON.stringify({ fingerprint, id }))
    return id
  } catch {
    return null
  }
}
function forgetRequestId() {
  try {
    window.sessionStorage.removeItem("ewatrade.storefront.pending-request")
  } catch {}
}

export function CommerceCheckout() {
  const {
    bag,
    bagReady,
    adapter,
    snapshot,
    header,
    customer,
    accounts,
    ordering,
    href,
    clearBag,
    updateLine,
    removeLine,
    preview,
  } = useCommerceStudio()
  const methods = [
    ...(header.offerPickup ? (["pickup"] as const) : []),
    ...(header.offerDelivery ? (["delivery"] as const) : []),
  ]
  const offered = methods.length ? methods : (["pickup"] as const)
  const [fields, setFields] = useState<Fields>({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    fulfilment: offered[0] ?? "pickup",
    deliveryAddress: "",
    notes: "",
  })
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>(
    {},
  )
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [checks, setChecks] = useState<
    Record<
      string,
      {
        priceMinor: number | null
        stock: string
        available: boolean
        enough: boolean
      }
    >
  >({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  // Wide layouts show the summary beside the form; phones start collapsed.
  useEffect(() => {
    if (window.matchMedia("(min-width: 900px)").matches) setSummaryOpen(true)
  }, [])
  const busy = useRef(false)
  const summaryRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const ids = {
    name: useId(),
    phone: useId(),
    email: useId(),
    address: useId(),
    notes: useId(),
  }
  const currency = bag.lines[0]?.currencyCode ?? snapshot.currencyCode

  // Re-check current prices/availability whenever the bag changes.
  const signature = bag.lines
    .map((line) => `${line.offeringId}:${line.quantity}:${line.priceMinor}`)
    .join("|")
  // biome-ignore lint/correctness/useExhaustiveDependencies: signature captures the bag lines.
  useEffect(() => {
    if (!bagReady || !bag.lines.length) return
    let cancelled = false
    setChecking(true)
    adapter
      .checkBag(bag.lines)
      .then((result) => {
        if (cancelled || !result.ok) return
        const next: Record<string, string> = {}
        const map: typeof checks = {}
        for (const line of result.lines) {
          map[line.offeringId] = line
          const saved = bag.lines.find(
            (entry) => entry.offeringId === line.offeringId,
          )
          if (!saved) continue
          if (!line.available)
            next[line.offeringId] = "This item is no longer available."
          else if (line.priceMinor === null)
            next[line.offeringId] = "This item is now priced on request."
          else if (line.priceMinor !== saved.priceMinor)
            next[line.offeringId] =
              `The price is now ${formatMoney(line.priceMinor, saved.currencyCode)}.`
          else if (line.stock === "out_of_stock")
            next[line.offeringId] = "This just sold out."
          else if (!line.enough)
            next[line.offeringId] =
              "Not enough in stock for this quantity. Try fewer."
        }
        setChecks(map)
        setNotes(next)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [bagReady, signature, adapter])

  if (!ordering)
    return (
      <section className="cs-section">
        <div className="cs-wrap cs-narrow">
          <Empty className="cs-empty">
            <EmptyHeader>
              <EmptyTitle>Ordering isn't available here</EmptyTitle>
              <EmptyDescription>
                This shop isn't taking order requests on this site right now.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <a
                className={buttonVariants({ variant: "outline" })}
                href={href("/")}
              >
                Back to the shop
              </a>
            </EmptyContent>
          </Empty>
        </div>
      </section>
    )
  if (bagReady && !bag.lines.length)
    return (
      <section className="cs-section">
        <div className="cs-wrap cs-narrow">
          <Empty className="cs-empty">
            <EmptyHeader>
              <EmptyTitle>Your bag is empty</EmptyTitle>
              <EmptyDescription>
                Add items from the shop to send an order request.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <a
                className={buttonVariants({ className: "cs-primary" })}
                href={href("/shop")}
              >
                Browse the shop
              </a>
            </EmptyContent>
          </Empty>
        </div>
      </section>
    )

  const totals = bagTotals(bag.lines)
  const blocking = bag.lines.filter((line) => {
    const check = checks[line.offeringId]
    return (
      quantityProblem(line.quantity, line.scale) ||
      (check &&
        (!check.available ||
          check.priceMinor === null ||
          check.stock === "out_of_stock" ||
          !check.enough))
    )
  })
  const changedPrices = bag.lines.filter((line) => {
    const check = checks[line.offeringId]
    return (
      check?.available &&
      check.priceMinor !== null &&
      check.priceMinor !== line.priceMinor
    )
  })
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const validate = () => {
    const next: Partial<Record<keyof Fields, string>> = {}
    if (fields.customerName.trim().length < 2)
      next.customerName = "Enter your name."
    if (fields.customerPhone.replace(/\D/g, "").length < 7)
      next.customerPhone = "Enter your WhatsApp number."
    if (
      fields.customerEmail.trim() &&
      !/^\S+@\S+\.\S+$/.test(fields.customerEmail.trim())
    )
      next.customerEmail = "Enter a valid email, or leave it empty."
    if (
      fields.fulfilment === "delivery" &&
      fields.deliveryAddress.trim().length < 8
    )
      next.deliveryAddress = "Enter the delivery address."
    return next
  }

  const submit = async () => {
    if (busy.current) return
    setFormError(null)
    const found = validate()
    setErrors(found)
    const firstKey = Object.keys(found)[0] as keyof Fields | undefined
    if (firstKey) {
      const target = document.getElementById(
        ids[
          firstKey === "customerName"
            ? "name"
            : firstKey === "customerPhone"
              ? "phone"
              : firstKey === "customerEmail"
                ? "email"
                : firstKey === "deliveryAddress"
                  ? "address"
                  : "notes"
        ],
      )
      target?.focus()
      return
    }
    if (blocking.length || changedPrices.length) {
      setFormError(
        changedPrices.length
          ? "Some prices changed. Review your bag and accept the new prices before sending."
          : "Some items need your attention before you send.",
      )
      summaryRef.current?.focus()
      return
    }
    const payload = {
      lines: bag.lines.map((line) => ({
        itemId: line.itemId,
        offeringId: line.offeringId,
        quantity: line.quantity,
        observedUnitPriceMinor: line.priceMinor ?? 0,
      })),
      customerName: fields.customerName.trim(),
      customerPhone: fields.customerPhone.trim(),
      customerEmail: fields.customerEmail.trim(),
      fulfilment: fields.fulfilment,
      ...(fields.fulfilment === "delivery"
        ? { deliveryAddress: fields.deliveryAddress.trim() }
        : {}),
      ...(fields.notes.trim() ? { notes: fields.notes.trim() } : {}),
    }
    const clientRequestId =
      stableRequestId(JSON.stringify(payload)) ?? newClientId()
    busy.current = true
    setPending(true)
    try {
      const result = await adapter.submitOrder({ clientRequestId, ...payload })
      if (result.ok) {
        forgetRequestId()
        clearBag()
        window.location.assign(result.receiptPath)
        return
      }
      if (result.fields)
        setErrors(result.fields as Partial<Record<keyof Fields, string>>)
      if (result.field)
        setErrors((current) => ({
          ...current,
          [result.field as keyof Fields]: result.message,
        }))
      if (result.issues?.length) {
        const next: Record<string, string> = {}
        for (const issue of result.issues)
          next[issue.offeringId] = issueMessage(issue, currency)
        setNotes(next)
        // Refresh the price/stock facts behind the messages.
        const refreshed = await adapter.checkBag(bag.lines)
        if (refreshed.ok)
          setChecks(
            Object.fromEntries(
              refreshed.lines.map((line) => [line.offeringId, line]),
            ),
          )
      }
      setFormError(result.message)
      requestAnimationFrame(() => errorRef.current?.focus())
    } catch {
      // Network timeout: the same request ID is kept, so trying again can't duplicate it.
      setFormError(
        "We couldn't reach the shop. Check your connection and send again. Your request won't be duplicated.",
      )
      requestAnimationFrame(() => errorRef.current?.focus())
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <section className="cs-section cs-checkout">
      <div className="cs-wrap">
        <a className="cs-back" href={href("/shop")}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          Keep shopping
        </a>
        <h1 className="cs-title cs-title--page">Send your order request</h1>
        <p className="cs-lead cs-lead--narrow">
          No payment now. {snapshot.resources.business.name} checks stock
          {header.offerDelivery ? " and any delivery fee" : ""}, confirms the
          total with you on WhatsApp, then shares how to pay.
        </p>
        <div className="cs-checkout__grid">
          <form
            className="cs-checkout__form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            {formError ? (
              <Alert
                variant="destructive"
                className="cs-alert"
                ref={errorRef}
                tabIndex={-1}
              >
                <AlertTitle>Not sent yet</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            {accounts && !customer?.signedIn ? (
              <Alert className="cs-note">
                <HugeiconsIcon icon={UserIcon} strokeWidth={1.8} />
                <AlertDescription>
                  Ordering as a guest.{" "}
                  <a className="cs-link" href="/account?next=/checkout">
                    Log in
                  </a>{" "}
                  to keep it in your history.
                </AlertDescription>
              </Alert>
            ) : null}
            <FieldSet>
              <FieldLegend>Your details</FieldLegend>
              <FieldGroup>
                <Field data-invalid={errors.customerName ? true : undefined}>
                  <FieldLabel htmlFor={ids.name}>Your name</FieldLabel>
                  <Input
                    id={ids.name}
                    autoComplete="name"
                    value={fields.customerName}
                    maxLength={80}
                    aria-invalid={errors.customerName ? true : undefined}
                    aria-describedby={
                      errors.customerName ? `${ids.name}-error` : undefined
                    }
                    onChange={(event) =>
                      set("customerName", event.target.value)
                    }
                  />
                  {errors.customerName ? (
                    <FieldError id={`${ids.name}-error`}>
                      {errors.customerName}
                    </FieldError>
                  ) : null}
                </Field>
                <Field data-invalid={errors.customerPhone ? true : undefined}>
                  <FieldLabel htmlFor={ids.phone}>WhatsApp number</FieldLabel>
                  <FieldDescription id={`${ids.phone}-help`}>
                    The business replies here.
                  </FieldDescription>
                  <Input
                    id={ids.phone}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={fields.customerPhone}
                    maxLength={24}
                    aria-invalid={errors.customerPhone ? true : undefined}
                    aria-describedby={`${ids.phone}-help${errors.customerPhone ? ` ${ids.phone}-error` : ""}`}
                    onChange={(event) =>
                      set("customerPhone", event.target.value)
                    }
                  />
                  {errors.customerPhone ? (
                    <FieldError id={`${ids.phone}-error`}>
                      {errors.customerPhone}
                    </FieldError>
                  ) : null}
                </Field>
                <Field data-invalid={errors.customerEmail ? true : undefined}>
                  <FieldLabel htmlFor={ids.email}>Email (optional)</FieldLabel>
                  <Input
                    id={ids.email}
                    type="email"
                    autoComplete="email"
                    value={fields.customerEmail}
                    aria-invalid={errors.customerEmail ? true : undefined}
                    aria-describedby={
                      errors.customerEmail ? `${ids.email}-error` : undefined
                    }
                    onChange={(event) =>
                      set("customerEmail", event.target.value)
                    }
                  />
                  {errors.customerEmail ? (
                    <FieldError id={`${ids.email}-error`}>
                      {errors.customerEmail}
                    </FieldError>
                  ) : null}
                </Field>
              </FieldGroup>
            </FieldSet>
            {offered.length > 1 ? (
              <FieldSet>
                <FieldLegend>How you'll get it</FieldLegend>
                <RadioGroup
                  value={fields.fulfilment}
                  onValueChange={(value) =>
                    set("fulfilment", value as Fields["fulfilment"])
                  }
                  className="cs-radio-cards"
                >
                  {offered.map((method) => (
                    <Field
                      key={method}
                      orientation="horizontal"
                      className="cs-radio-card"
                    >
                      <RadioGroupItem
                        value={method}
                        id={`${ids.address}-${method}`}
                      />
                      <FieldLabel htmlFor={`${ids.address}-${method}`}>
                        <span>
                          <strong>
                            {method === "pickup" ? "Pick up" : "Delivery"}
                          </strong>
                          <span className="cs-muted">
                            {method === "pickup"
                              ? header.location || "Collect from the business"
                              : header.deliveryNote ||
                                "The business confirms the delivery fee"}
                          </span>
                        </span>
                      </FieldLabel>
                    </Field>
                  ))}
                </RadioGroup>
              </FieldSet>
            ) : (
              <p className="cs-muted cs-fulfilment-note">
                {offered[0] === "delivery"
                  ? `Delivery. ${header.deliveryNote || "The business confirms the delivery fee."}`
                  : `Pick up${header.location ? ` from ${header.location}` : " from the business"}.`}
              </p>
            )}
            {fields.fulfilment === "delivery" ? (
              <Field data-invalid={errors.deliveryAddress ? true : undefined}>
                <FieldLabel htmlFor={ids.address}>Delivery address</FieldLabel>
                <Textarea
                  id={ids.address}
                  rows={3}
                  maxLength={300}
                  autoComplete="street-address"
                  value={fields.deliveryAddress}
                  aria-invalid={errors.deliveryAddress ? true : undefined}
                  aria-describedby={
                    errors.deliveryAddress ? `${ids.address}-error` : undefined
                  }
                  onChange={(event) =>
                    set("deliveryAddress", event.target.value)
                  }
                />
                {errors.deliveryAddress ? (
                  <FieldError id={`${ids.address}-error`}>
                    {errors.deliveryAddress}
                  </FieldError>
                ) : null}
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor={ids.notes}>
                Note for the business (optional)
              </FieldLabel>
              <Textarea
                id={ids.notes}
                rows={3}
                maxLength={500}
                value={fields.notes}
                onChange={(event) => set("notes", event.target.value)}
              />
            </Field>
            <Button
              type="submit"
              size="lg"
              className="cs-primary cs-full"
              disabled={pending || preview}
            >
              {pending ? <Spinner /> : null}
              {pending
                ? "Sending…"
                : preview
                  ? "Send request (preview)"
                  : "Send order request"}
            </Button>
            <p className="cs-fine">
              Your request reference appears straight away. Nothing is charged
              until the business confirms.
            </p>
          </form>
          <aside
            className="cs-summary"
            aria-labelledby="cs-summary-title"
            ref={summaryRef}
            tabIndex={-1}
            data-open={
              summaryOpen || Object.keys(notes).length > 0 ? "true" : "false"
            }
          >
            <h2 id="cs-summary-title" className="cs-summary__title">
              <button
                type="button"
                className="cs-summary__toggle"
                aria-expanded={summaryOpen}
                aria-controls="cs-summary-body"
                onClick={() => setSummaryOpen((open) => !open)}
              >
                <span>
                  Order summary{" "}
                  {checking ? (
                    <Spinner
                      className="cs-inline-spinner"
                      aria-label="Checking prices"
                    />
                  ) : null}
                </span>
                <span className="cs-summary__total">
                  {totals.complete
                    ? formatMoney(totals.subtotal, currency)
                    : "To confirm"}
                </span>
              </button>
            </h2>
            <div id="cs-summary-body" className="cs-summary__body">
              <BagLines lines={bag.lines} editable notes={notes} />
              {changedPrices.length ? (
                <Alert className="cs-note">
                  <AlertTitle>Prices changed</AlertTitle>
                  <AlertDescription>
                    <p>Some prices changed since you added them.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        for (const line of changedPrices)
                          updateLine(line.offeringId, {
                            priceMinor:
                              checks[line.offeringId]?.priceMinor ??
                              line.priceMinor,
                          })
                      }}
                    >
                      Use the new prices
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              {bag.lines.some(
                (line) =>
                  checks[line.offeringId] &&
                  !checks[line.offeringId]?.available,
              ) ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    for (const line of bag.lines as BagLine[])
                      if (
                        checks[line.offeringId] &&
                        !checks[line.offeringId]?.available
                      )
                        removeLine(line.offeringId)
                  }}
                >
                  Remove unavailable items
                </Button>
              ) : null}
              <div className="cs-total-row">
                <span>Subtotal</span>
                <strong>
                  {totals.complete
                    ? formatMoney(totals.subtotal, currency)
                    : "To confirm"}
                </strong>
              </div>
              {header.offerDelivery ? (
                <p className="cs-fine">
                  Delivery fee, if any, is confirmed by the business.
                </p>
              ) : null}
              {bag.lines.some(
                (line) => checks[line.offeringId]?.stock === "unknown",
              ) ? (
                <p className="cs-fine">
                  <span
                    className="cs-stock"
                    data-tone={stockWording("unknown").tone}
                  >
                    {stockWording("unknown").label}
                  </span>{" "}
                  for some items.
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
