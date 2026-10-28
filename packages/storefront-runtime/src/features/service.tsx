"use client"

import { StorefrontFeatureFrame } from "./frame"

import { CommerceLink } from "../commerce/navigation"

import type { PublicCatalogItem } from "@ewatrade/storefront-contracts/resources"
import { Alert, AlertDescription, AlertTitle } from "@ewatrade/ui/alert"
import { Button, buttonVariants } from "@ewatrade/ui/button"
import { Checkbox } from "@ewatrade/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@ewatrade/ui/field"
import { Input } from "@ewatrade/ui/input"
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "@ewatrade/ui/select-menu"
import { Spinner } from "@ewatrade/ui/spinner"
import { Textarea } from "@ewatrade/ui/textarea"
import {
  ArrowLeft01Icon,
  Clock01Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useId, useRef, useState } from "react"
import {
  addDays,
  dateInZone,
  defaultBusinessTimeZone,
  formatMoney,
  formatTimeLabel,
  lineTotalMinor,
  newClientId,
  quantityProblem,
  quarterHourTimes,
  timeInZone,
  zoneLabel,
} from "../commerce/model"
import { useStorefrontCommerce } from "../commerce/provider"
import { CommerceGallery, galleryPhotos } from "./gallery"
import { QuantityStepper } from "./quantity-stepper"

export function ServiceDetail({ item }: { item: PublicCatalogItem }) {
  return (
    <StorefrontFeatureFrame>
      <ServiceDetailBody item={item} />
    </StorefrontFeatureFrame>
  )
}

function ServiceDetailBody({ item }: { item: PublicCatalogItem }) {
  const { snapshot, adapter, header, href, preview, navigate, themeStyle } =
    useStorefrontCommerce()
  const entry = snapshot.resources.contact.serviceRequestEntry
  const requestable = new Set(entry?.offeringIds ?? [])
  const options = item.options.filter((option) => requestable.has(option.id))
  // A preferred date/time is offered only with book ahead; it stays a request.
  const bookAhead = item.storefrontPolicy?.allowBookAhead === true
  const unavailable = item.storefrontPolicy?.unavailable === true
  // Manually unavailable: only a dated request ahead, and only with book ahead.
  const dateRequired = unavailable && bookAhead
  const timeZone =
    snapshot.resources.business.timezone ?? defaultBusinessTimeZone
  const today = dateInZone(timeZone)
  const earliest = dateRequired ? addDays(today, 1) : today
  const hasMedia = galleryPhotos(item).length > 0
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    options.length === 1 && options[0] ? { [options[0].id]: "1" } : {},
  )
  const [fields, setFields] = useState({
    name: "",
    phone: "",
    notes: "",
    date: "",
    time: "",
    address: "",
  })
  // Name the zone only when it differs from the visitor's (client-only, after hydration).
  const [foreignZone, setForeignZone] = useState(false)
  useEffect(() => {
    try {
      setForeignZone(
        Intl.DateTimeFormat().resolvedOptions().timeZone !== timeZone,
      )
    } catch {}
  }, [timeZone])
  const times =
    fields.date && fields.date === today
      ? quarterHourTimes.filter((time) => time > timeInZone(timeZone))
      : quarterHourTimes
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [receiptPath, setReceiptPath] = useState<string | null>(null)
  const busy = useRef(false)
  const requestId = useRef<string | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const ids = {
    name: useId(),
    phone: useId(),
    notes: useId(),
    date: useId(),
    time: useId(),
    address: useId(),
    options: useId(),
  }
  const whatsapp = snapshot.resources.contact.whatsAppPhone
  const enquiry = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${snapshot.resources.business.name}, I'd like to ask about ${item.name}.`)}`
    : null
  const chosen = options.filter((option) => selected[option.id] !== undefined)
  const priced = chosen.map((option) =>
    lineTotalMinor(option.priceMinor, selected[option.id] ?? "1"),
  )
  const estimate =
    priced.every((value) => value !== null) && chosen.length
      ? priced.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null
  const quoteNeeded = chosen.some((option) => option.priceMinor === null)
  const pricedSoFar = priced.reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0,
  )
  const duration = item.options.find(
    (option) => option.durationMinutes,
  )?.durationMinutes

  const set = (key: keyof typeof fields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: "" }))
  }

  const submit = async () => {
    if (busy.current || receiptPath || !entry) return
    setFormError(null)
    const next: Record<string, string> = {}
    if (!chosen.length) next.options = "Choose at least one option."
    for (const option of chosen) {
      const problem = quantityProblem(
        selected[option.id] ?? "",
        option.unit?.scale ?? 0,
      )
      if (problem || Number(selected[option.id]) > 50)
        next.options = problem ?? "Use 50 or fewer for each option."
    }
    if (fields.name.trim().length < 2) next.name = "Enter your name."
    if (fields.phone.replace(/\D/g, "").length < 7)
      next.phone = "Enter your WhatsApp number."
    if (dateRequired && !fields.date) next.date = "Choose a date."
    else if (fields.date && fields.date < earliest)
      next.date = dateRequired
        ? "Choose a date after today."
        : "Choose today or a later date."
    else if (
      fields.date &&
      fields.time &&
      fields.date === today &&
      fields.time <= timeInZone(timeZone)
    )
      next.time = "Choose a time later than now."
    setErrors(next)
    const first = Object.keys(next)[0]
    if (first) {
      document
        .getElementById(ids[first as keyof typeof ids] ?? ids.options)
        ?.focus()
      return
    }
    const lines = chosen.map((option) => ({
      offeringId: option.id,
      quantity: selected[option.id] ?? "1",
    }))
    const firstLine = lines[0] as { offeringId: string; quantity: string }
    requestId.current ??= newClientId()
    busy.current = true
    setPending(true)
    let completed = false
    try {
      const result = await adapter.submitService({
        request: {
          clientRequestId: requestId.current,
          formId: entry.formId,
          itemId: item.id,
          offeringId: firstLine.offeringId,
          quantity: firstLine.quantity,
          ...(lines.length > 1 ? { lines } : {}),
          customerName: fields.name.trim(),
          customerPhone: fields.phone.trim(),
          details: fields.notes.trim(),
        },
        extras: {
          ...(bookAhead && fields.date ? { preferredDate: fields.date } : {}),
          ...(bookAhead && fields.date && fields.time
            ? { preferredTime: fields.time }
            : {}),
          ...(fields.address.trim()
            ? { collectionAddress: fields.address.trim() }
            : {}),
        },
      })
      if (result.ok) {
        completed = true
        setReceiptPath(result.receiptPath)
        navigate(result.receiptPath)
        return
      }
      if (result.field)
        setErrors((current) => ({
          ...current,
          [result.field === "preferredDate"
            ? "date"
            : result.field === "preferredTime"
              ? "time"
              : (result.field as string)]: result.message,
        }))
      setFormError(result.message)
      requestAnimationFrame(() => errorRef.current?.focus())
    } catch {
      setFormError(
        "We couldn't reach the business. Check your connection and send again. Your request won't be duplicated.",
      )
      requestAnimationFrame(() => errorRef.current?.focus())
    } finally {
      if (!completed) {
        busy.current = false
        setPending(false)
      }
    }
  }

  if (receiptPath)
    return (
      <section className="sf-feature-section sf-feature-wrap">
        <h1 className="sf-feature-title sf-feature-title--page">
          Request received
        </h1>
        <output>Opening your request status…</output>
        <CommerceLink className="sf-feature-link" href={receiptPath}>
          View your request
        </CommerceLink>
      </section>
    )
  return (
    <article className="sf-feature-wrap sf-feature-service-detail">
      <CommerceLink className="sf-feature-back" href={href("/services")}>
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        All services
      </CommerceLink>
      <div
        className="sf-feature-service-detail__grid"
        data-media={hasMedia || undefined}
      >
        {hasMedia ? (
          <div className="sf-feature-service-detail__media">
            <CommerceGallery item={item} kind="service" />
          </div>
        ) : null}
        <div>
          <h1 className="sf-feature-display sf-feature-display--product">
            {item.name}
          </h1>
          {item.description ? (
            <div className="sf-feature-included">
              <h2 className="sf-feature-subtitle">What's included</h2>
              <p className="sf-feature-lead">{item.description}</p>
            </div>
          ) : null}
          {duration ? (
            <p className="sf-feature-muted sf-feature-inline-icon">
              <HugeiconsIcon icon={Clock01Icon} strokeWidth={1.6} />
              Usually about{" "}
              {duration >= 60
                ? `${Math.round((duration / 60) * 10) / 10} hours`
                : `${duration} minutes`}
            </p>
          ) : null}
          {!entry || !options.length || (unavailable && !bookAhead) ? (
            <Alert className="sf-feature-note">
              <AlertTitle>
                {unavailable
                  ? "Not taking requests right now"
                  : "Requests by message"}
              </AlertTitle>
              <AlertDescription>
                {enquiry
                  ? unavailable
                    ? "Message the business on WhatsApp to ask when it's available again."
                    : "This business takes requests for this service on WhatsApp."
                  : "This service isn't taking requests on this site right now."}
                {enquiry ? (
                  <CommerceLink
                    className={buttonVariants({
                      className: "sf-feature-primary sf-feature-mt",
                    })}
                    href={enquiry}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <HugeiconsIcon icon={WhatsappIcon} strokeWidth={1.8} />
                    Ask on WhatsApp
                  </CommerceLink>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : (
            <form
              className="sf-feature-service-form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              {formError ? (
                <Alert variant="destructive" ref={errorRef} tabIndex={-1}>
                  <AlertTitle>Not sent yet</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}
              <FieldSet data-invalid={errors.options ? true : undefined}>
                <FieldLegend>
                  {options.length > 1 ? "Choose what you need" : "Your request"}
                </FieldLegend>
                <div
                  className="sf-feature-service-options"
                  id={ids.options}
                  tabIndex={-1}
                >
                  {options.map((option) => {
                    const on = selected[option.id] !== undefined
                    const checkboxId = `${ids.options}-${option.id}`
                    return (
                      <div
                        key={option.id}
                        className="sf-feature-service-option"
                        data-selected={on || undefined}
                      >
                        <Field orientation="horizontal">
                          {options.length > 1 ? (
                            <Checkbox
                              id={checkboxId}
                              checked={on}
                              onCheckedChange={(checked) => {
                                setSelected((current) => {
                                  const copy = { ...current }
                                  if (checked) copy[option.id] = "1"
                                  else delete copy[option.id]
                                  return copy
                                })
                                setErrors((current) => ({
                                  ...current,
                                  options: "",
                                }))
                              }}
                            />
                          ) : null}
                          <FieldLabel
                            htmlFor={checkboxId}
                            className="sf-feature-service-option__label"
                          >
                            <span>{option.name}</span>
                            <span className="sf-feature-muted">
                              {option.priceMinor === null
                                ? "Priced after the business checks"
                                : formatMoney(
                                    option.priceMinor,
                                    option.currencyCode,
                                  )}
                            </span>
                          </FieldLabel>
                        </Field>
                        {on ? (
                          <QuantityStepper
                            id={`${checkboxId}-qty`}
                            value={selected[option.id] ?? "1"}
                            scale={option.unit?.scale ?? 0}
                            max={50}
                            label={`How many: ${option.name}`}
                            onChange={(value) =>
                              setSelected((current) => ({
                                ...current,
                                [option.id]: value,
                              }))
                            }
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                {errors.options ? (
                  <FieldError>{errors.options}</FieldError>
                ) : null}
              </FieldSet>
              {dateRequired ? (
                <Alert className="sf-feature-note">
                  <AlertTitle>Not available right now</AlertTitle>
                  <AlertDescription>
                    You can still ask for a later date. It stays a request until
                    the business confirms the booking.
                  </AlertDescription>
                </Alert>
              ) : null}
              <FieldGroup>
                {bookAhead ? (
                  <Field data-invalid={errors.date ? true : undefined}>
                    <FieldLabel htmlFor={ids.date}>
                      {dateRequired
                        ? "Preferred date"
                        : "Preferred date (optional)"}
                    </FieldLabel>
                    <FieldDescription id={`${ids.date}-help`}>
                      A preference, not a booking. The business confirms the
                      time with you.
                    </FieldDescription>
                    <Input
                      id={ids.date}
                      type="date"
                      min={earliest}
                      value={fields.date}
                      aria-invalid={errors.date ? true : undefined}
                      aria-describedby={`${ids.date}-help${errors.date ? ` ${ids.date}-error` : ""}`}
                      onChange={(event) => {
                        set("date", event.target.value)
                        if (!event.target.value) set("time", "")
                      }}
                    />
                    {errors.date ? (
                      <FieldError id={`${ids.date}-error`}>
                        {errors.date}
                      </FieldError>
                    ) : null}
                  </Field>
                ) : null}
                {bookAhead ? (
                  <Field data-invalid={errors.time ? true : undefined}>
                    <FieldLabel htmlFor={ids.time}>
                      Preferred time (optional)
                      {foreignZone ? ` (${zoneLabel(timeZone)} time)` : ""}
                    </FieldLabel>
                    <FieldDescription id={`${ids.time}-help`}>
                      We'll pass this to the business. It isn't booked until
                      they confirm.
                    </FieldDescription>
                    <SelectRoot
                      value={fields.time || null}
                      items={[
                        { value: "", label: "No preference" },
                        ...times.map((time) => ({
                          value: time,
                          label: formatTimeLabel(time),
                        })),
                      ]}
                      disabled={!fields.date}
                      onValueChange={(next) => set("time", next ?? "")}
                    >
                      <SelectTrigger
                        id={ids.time}
                        appearance="form"
                        aria-invalid={errors.time ? true : undefined}
                        aria-describedby={`${ids.time}-help${errors.time ? ` ${ids.time}-error` : ""}`}
                      >
                        <SelectValue
                          placeholder={
                            fields.date
                              ? "No preference"
                              : "Choose a date first"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent
                        className="sf-feature-portal sf-feature-time-menu"
                        style={themeStyle}
                        alignItemWithTrigger={false}
                        align="start"
                      >
                        <SelectGroup>
                          <SelectItem value="">No preference</SelectItem>
                          {times.map((time) => (
                            <SelectItem key={time} value={time}>
                              {formatTimeLabel(time)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </SelectRoot>
                    {errors.time ? (
                      <FieldError id={`${ids.time}-error`}>
                        {errors.time}
                      </FieldError>
                    ) : null}
                  </Field>
                ) : null}
                {header.offerDelivery ? (
                  <Field>
                    <FieldLabel htmlFor={ids.address}>
                      Collection address (optional)
                    </FieldLabel>
                    <FieldDescription>
                      Only if you'd like the business to collect from you.
                    </FieldDescription>
                    <Textarea
                      id={ids.address}
                      rows={2}
                      maxLength={300}
                      value={fields.address}
                      onChange={(event) => set("address", event.target.value)}
                    />
                  </Field>
                ) : null}
                <Field>
                  <FieldLabel htmlFor={ids.notes}>
                    Details (optional)
                  </FieldLabel>
                  <Textarea
                    id={ids.notes}
                    rows={3}
                    maxLength={500}
                    placeholder="Anything the business should know"
                    value={fields.notes}
                    onChange={(event) => set("notes", event.target.value)}
                  />
                </Field>
                <Field data-invalid={errors.name ? true : undefined}>
                  <FieldLabel htmlFor={ids.name}>Your name</FieldLabel>
                  <Input
                    id={ids.name}
                    autoComplete="name"
                    maxLength={80}
                    value={fields.name}
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={
                      errors.name ? `${ids.name}-error` : undefined
                    }
                    onChange={(event) => set("name", event.target.value)}
                  />
                  {errors.name ? (
                    <FieldError id={`${ids.name}-error`}>
                      {errors.name}
                    </FieldError>
                  ) : null}
                </Field>
                <Field data-invalid={errors.phone ? true : undefined}>
                  <FieldLabel htmlFor={ids.phone}>WhatsApp number</FieldLabel>
                  <Input
                    id={ids.phone}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={24}
                    value={fields.phone}
                    aria-invalid={errors.phone ? true : undefined}
                    aria-describedby={
                      errors.phone ? `${ids.phone}-error` : undefined
                    }
                    onChange={(event) => set("phone", event.target.value)}
                  />
                  {errors.phone ? (
                    <FieldError id={`${ids.phone}-error`}>
                      {errors.phone}
                    </FieldError>
                  ) : null}
                </Field>
              </FieldGroup>
              <div className="sf-feature-estimate" aria-live="polite">
                <span>
                  {chosen.length
                    ? quoteNeeded
                      ? "Estimate"
                      : "Estimated total"
                    : "Choose an option"}
                </span>
                <strong>
                  {!chosen.length
                    ? "—"
                    : estimate !== null
                      ? formatMoney(estimate, item.currencyCode)
                      : pricedSoFar > 0
                        ? `${formatMoney(pricedSoFar, item.currencyCode)} + quoted items`
                        : "The business sends a quote"}
                </strong>
              </div>
              <Button
                type="submit"
                size="lg"
                className="sf-feature-primary sf-feature-full"
                disabled={pending || preview}
              >
                {pending ? <Spinner /> : null}
                {pending
                  ? "Sending…"
                  : preview
                    ? "Send request (preview)"
                    : "Send request"}
              </Button>
              <p className="sf-feature-fine">
                No payment now. The business confirms the price and time before
                any work starts.
              </p>
            </form>
          )}
        </div>
      </div>
    </article>
  )
}
