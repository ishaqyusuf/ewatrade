"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
  Spinner,
  Textarea,
  buttonVariants,
} from "@ewatrade/ui"
import {
  ArrowLeft01Icon,
  Clock01Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useId, useRef, useState } from "react"
import type { PublicCatalogItem } from "../../../storefront-contracts/src/resources"
import {
  formatMoney,
  lineTotalMinor,
  newClientId,
  quantityProblem,
} from "./commerce"
import { useCommerceStudio } from "./context"
import { QuantityStepper } from "./product"

function todayInLagos() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
    new Date(),
  )
}

export function ServiceDetail({ item }: { item: PublicCatalogItem }) {
  const { snapshot, adapter, header, href, preview } = useCommerceStudio()
  const entry = snapshot.resources.contact.serviceRequestEntry
  const requestable = new Set(entry?.offeringIds ?? [])
  const options = item.options.filter((option) => requestable.has(option.id))
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    options.length === 1 && options[0] ? { [options[0].id]: "1" } : {},
  )
  const [fields, setFields] = useState({
    name: "",
    phone: "",
    notes: "",
    date: "",
    address: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const requestId = useRef<string | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const ids = {
    name: useId(),
    phone: useId(),
    notes: useId(),
    date: useId(),
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
    if (busy.current || !entry) return
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
    if (fields.date && fields.date < todayInLagos())
      next.date = "Choose today or a later date."
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
          ...(fields.date ? { preferredDate: fields.date } : {}),
          ...(fields.address.trim()
            ? { collectionAddress: fields.address.trim() }
            : {}),
        },
      })
      if (result.ok) {
        window.location.assign(result.receiptPath)
        return
      }
      if (result.field)
        setErrors((current) => ({
          ...current,
          [result.field === "preferredDate"
            ? "date"
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
      busy.current = false
      setPending(false)
    }
  }

  return (
    <article className="cs-wrap cs-service-detail">
      <a className="cs-back" href={href("/services")}>
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        All services
      </a>
      <div className="cs-service-detail__grid">
        <div>
          <h1 className="cs-display cs-display--product">{item.name}</h1>
          {item.description ? (
            <div className="cs-included">
              <h2 className="cs-subtitle">What's included</h2>
              <p className="cs-lead">{item.description}</p>
            </div>
          ) : null}
          {duration ? (
            <p className="cs-muted cs-inline-icon">
              <HugeiconsIcon icon={Clock01Icon} strokeWidth={1.6} />
              Usually about{" "}
              {duration >= 60
                ? `${Math.round((duration / 60) * 10) / 10} hours`
                : `${duration} minutes`}
            </p>
          ) : null}
          {!entry || !options.length ? (
            <Alert className="cs-note">
              <AlertTitle>Requests by message</AlertTitle>
              <AlertDescription>
                {enquiry
                  ? "This business takes requests for this service on WhatsApp."
                  : "This service isn't taking requests on this site right now."}
                {enquiry ? (
                  <a
                    className={buttonVariants({
                      className: "cs-primary cs-mt",
                    })}
                    href={enquiry}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <HugeiconsIcon icon={WhatsappIcon} strokeWidth={1.8} />
                    Ask on WhatsApp
                  </a>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : (
            <form
              className="cs-service-form"
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
                  className="cs-service-options"
                  id={ids.options}
                  tabIndex={-1}
                >
                  {options.map((option) => {
                    const on = selected[option.id] !== undefined
                    const checkboxId = `${ids.options}-${option.id}`
                    return (
                      <div
                        key={option.id}
                        className="cs-service-option"
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
                            className="cs-service-option__label"
                          >
                            <span>{option.name}</span>
                            <span className="cs-muted">
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
              <FieldGroup>
                <Field data-invalid={errors.date ? true : undefined}>
                  <FieldLabel htmlFor={ids.date}>
                    Preferred date (optional)
                  </FieldLabel>
                  <FieldDescription id={`${ids.date}-help`}>
                    A preference, not a booking. The business confirms the time
                    with you.
                  </FieldDescription>
                  <Input
                    id={ids.date}
                    type="date"
                    min={todayInLagos()}
                    value={fields.date}
                    aria-invalid={errors.date ? true : undefined}
                    aria-describedby={`${ids.date}-help${errors.date ? ` ${ids.date}-error` : ""}`}
                    onChange={(event) => set("date", event.target.value)}
                  />
                  {errors.date ? (
                    <FieldError id={`${ids.date}-error`}>
                      {errors.date}
                    </FieldError>
                  ) : null}
                </Field>
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
              <div className="cs-estimate" aria-live="polite">
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
                className="cs-primary cs-full"
                disabled={pending || preview}
              >
                {pending ? <Spinner /> : null}
                {pending
                  ? "Sending…"
                  : preview
                    ? "Send request (preview)"
                    : "Send request"}
              </Button>
              <p className="cs-fine">
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
