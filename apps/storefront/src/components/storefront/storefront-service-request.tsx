"use client"

import {
  type StorefrontRequestState,
  sendStorefrontServiceRequest,
} from "@/app/service-request/actions"
import type { getStorefrontServiceIntake } from "@ewatrade/db/queries"
import { useStorefrontEvents } from "@ewatrade/events/storefront-client"
import { productWhatsAppUrl } from "@ewatrade/storefront-runtime/links"
import {
  formatStorefrontPrice,
  storefrontInitials,
} from "@ewatrade/storefront-runtime/presentation"
import { StorefrontAttribution } from "@ewatrade/storefront-runtime/primitives"
import { ServiceOptionPicker } from "@ewatrade/storefront-templates/service-options"
import {
  Button,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from "@ewatrade/ui"
import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import { useActionState, useEffect, useId, useRef, useState } from "react"
import "@ewatrade/storefront-templates/styles.css"
import "./storefront-service-request.css"

type Form = NonNullable<
  Awaited<ReturnType<typeof getStorefrontServiceIntake>>
>["form"]
function lineTotal(offering: Form["offerings"][number], quantity: string) {
  if (
    offering.pricingPolicy !== "fixed" ||
    offering.fixedPriceMinor === null ||
    !/^(?:0|[1-9]\d?)(?:\.\d{1,6})?$/.test(quantity) ||
    Number(quantity) <= 0 ||
    Number(quantity) > 50
  )
    return null
  const amount = multiplyExactDecimals(
    String(offering.fixedPriceMinor),
    quantity,
  )
  return /^\d+$/.test(amount) && Number.isSafeInteger(Number(amount))
    ? Number(amount)
    : null
}

export function StorefrontServiceRequest({
  businessName,
  storefrontOrigin,
  form,
  initialOfferingId,
  initialOfferingIds,
  clientRequestId,
  whatsAppPhone,
  available,
}: {
  businessName: string
  storefrontOrigin: string
  form: Form
  initialOfferingId: string
  initialOfferingIds?: string[]
  clientRequestId: string
  whatsAppPhone: string | null
  available: boolean
}) {
  const ids = useId()
  const events = useStorefrontEvents()
  const [state, action, pending] = useActionState<
    StorefrontRequestState,
    FormData
  >(sendStorefrontServiceRequest, { kind: "idle" })
  const initial =
    form.offerings.find((option) => option.id === initialOfferingId) ??
    form.offerings[0]
  if (!initial) throw new Error("This service form has no available offerings.")
  const [serviceId, setServiceId] = useState(initial.catalogItemId)
  const [selectedIds, setSelectedIds] = useState(
    initialOfferingIds ?? [initial.id],
  )
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [customerName, setName] = useState("")
  const [customerPhone, setPhone] = useState("")
  const [details, setDetails] = useState("")
  const confirmation = useRef<HTMLHeadingElement>(null)
  const receiptTracked = useRef(false)
  const options = form.offerings.filter(
    (option) => option.catalogItemId === serviceId,
  )
  const selected = selectedIds.flatMap((id) => {
    const option = options.find((entry) => entry.id === id)
    return option ? [option] : []
  })
  const lines = selected.map((offering) => ({
    offeringId: offering.id,
    quantity: quantities[offering.id] ?? "1",
  }))
  const services = [
    ...new Map(
      form.offerings.map((option) => [
        option.catalogItemId,
        option.catalogItemName,
      ]),
    ).entries(),
  ]
  const fields = state.kind === "error" ? state.fields : undefined
  const receipt = state.kind === "received" ? state.receipt : null
  const enquiry = productWhatsAppUrl(
    whatsAppPhone,
    "your services",
    `${storefrontOrigin}/`,
  )
  const followUp = receipt
    ? productWhatsAppUrl(
        receipt.whatsAppPhone,
        `request ${receipt.requestId}`,
        `${storefrontOrigin}/`,
      )
    : null
  const invalid = (name: string) => ({
    "aria-invalid": Boolean(fields?.[name]),
    "aria-describedby": fields?.[name] ? `${ids}-${name}-error` : undefined,
  })
  const error = (name: string) =>
    fields?.[name] ? (
      <small className="sr-field-error" id={`${ids}-${name}-error`}>
        {fields[name]}
      </small>
    ) : null
  const facts = (
    service: string,
    option: string,
    quantity: string,
    total: number | null,
    currency = form.store.currencyCode,
  ) => (
    <dl className="sr-facts">
      <div>
        <dt>Service</dt>
        <dd>{service}</dd>
      </div>
      <div>
        <dt>Option</dt>
        <dd>{option}</dd>
      </div>
      <div>
        <dt>Quantity</dt>
        <dd>{quantity}</dd>
      </div>
      <div className="sr-total">
        <dt>{total === null ? "Price" : "Estimated total"}</dt>
        <dd>
          {total === null
            ? "Price on request"
            : formatStorefrontPrice(total, currency)}
        </dd>
      </div>
    </dl>
  )
  useEffect(() => {
    if (state.kind === "received") confirmation.current?.focus()
    else if (state.kind === "error")
      document
        .querySelector<HTMLElement>(".sr-field [aria-invalid=true], .sr-error")
        ?.focus()
  }, [state])
  useEffect(() => {
    if (state.kind !== "received") return
    return events.whenReady(() => {
      if (!receiptTracked.current) {
        receiptTracked.current = true
        events.track("storefront_request_submitted", { success: true })
      }
    })
  }, [state.kind, events])
  return (
    <div className="sr-page">
      <header className="sr-top">
        <div className="sr-wrap sr-top-in">
          <a className="sr-brand" href="/">
            <span className="sr-mark" aria-hidden="true">
              {storefrontInitials(businessName)}
            </span>
            <span>{businessName}</span>
          </a>
          <span className="sr-small">Request a quote</span>
        </div>
      </header>
      {!available ? (
        <main className="sr-wrap sr-main">
          <h1>Service requests are unavailable</h1>
          <p className="sr-lede">Contact {businessName} to discuss the work.</p>
          {enquiry ? (
            <Button
              render={
                <a href={enquiry} target="_blank" rel="noopener noreferrer">
                  Enquire on WhatsApp
                </a>
              }
            >
              Enquire on WhatsApp
            </Button>
          ) : null}
          <Button variant="outline" render={<a href="/">Back to storefront</a>}>
            Back to storefront
          </Button>
        </main>
      ) : receipt ? (
        <main className="sr-wrap sr-main sr-confirmation">
          <p className="sr-small">Request {receipt.requestId}</p>
          <h1 ref={confirmation} tabIndex={-1}>
            Request received
          </h1>
          <p className="sr-lede">
            Thanks, {receipt.customerName.split(/\s+/)[0]}.{" "}
            {receipt.businessName} will contact you on{" "}
            <strong>{receipt.customerPhone}</strong> to confirm the details.
          </p>
          <section className="sr-section">
            <h2>Your request</h2>
            {receipt.lines.map((line) => (
              <div className="sr-request-line" key={line.offeringId}>
                {facts(
                  line.serviceName,
                  line.optionName,
                  line.quantity,
                  line.estimatedTotalMinor,
                  line.currencyCode,
                )}
              </div>
            ))}
            {receipt.details ? (
              <div className="sr-note">
                <span>Your note</span>
                <p>{receipt.details}</p>
              </div>
            ) : null}
          </section>
          <p className="sr-help">
            Your service is confirmed once the business agrees the price and
            timing with you.
          </p>
          <div className="sr-actions">
            {followUp ? (
              <Button
                render={
                  <a href={followUp} target="_blank" rel="noopener noreferrer">
                    Continue on WhatsApp
                  </a>
                }
              >
                Continue on WhatsApp
              </Button>
            ) : null}
            <Button
              variant="outline"
              render={<a href="/">Back to storefront</a>}
            >
              Back to storefront
            </Button>
          </div>
        </main>
      ) : (
        <main className="sr-wrap sr-main">
          <a className="sr-back" href="/">
            ← Back to storefront
          </a>
          <h1>Request a quote</h1>
          <p className="sr-lede">
            Review your selected options and tell {businessName} what you need.
            No booking or payment is made here.
          </p>
          <form action={action} aria-busy={pending}>
            <input
              type="hidden"
              name="clientRequestId"
              value={clientRequestId}
            />
            <input type="hidden" name="formId" value={form.formId} />
            <input type="hidden" name="itemId" value={serviceId} />
            <input
              type="hidden"
              name="offeringId"
              value={lines[0]?.offeringId ?? ""}
            />
            <input
              type="hidden"
              name="quantity"
              value={lines[0]?.quantity ?? "1"}
            />
            <input type="hidden" name="lines" value={JSON.stringify(lines)} />
            {state.kind === "error" ? (
              <p className="sr-error" role="alert" tabIndex={-1}>
                {state.message}
              </p>
            ) : null}
            <fieldset disabled={pending} className="sr-section">
              <legend className="sr-sr-only">Services and options</legend>
              <h2>Your service</h2>
              <FieldGroup>
                <Field>
                  <FieldLabel>Service</FieldLabel>
                  <RadioGroup
                    aria-label="Service"
                    value={serviceId}
                    onValueChange={(value) => {
                      setServiceId(String(value))
                      setSelectedIds([])
                    }}
                  >
                    {services.map(([id, name]) => (
                      <Field orientation="horizontal" key={id}>
                        <RadioGroupItem
                          value={id}
                          id={`${ids}-service-${id}`}
                        />
                        <FieldLabel htmlFor={`${ids}-service-${id}`}>
                          {name}
                        </FieldLabel>
                      </Field>
                    ))}
                  </RadioGroup>
                </Field>
                <ServiceOptionPicker
                  key={serviceId}
                  label="Service options"
                  disabled={pending}
                  options={options.map((option) => ({
                    id: option.id,
                    name:
                      option.variantName &&
                      option.variantName.toLowerCase() !== "default"
                        ? option.variantName
                        : option.name,
                    priceMinor:
                      option.pricingPolicy === "fixed"
                        ? option.fixedPriceMinor
                        : null,
                    currencyCode: form.store.currencyCode,
                    availability: null,
                  }))}
                  value={selectedIds}
                  onChange={setSelectedIds}
                />
                {error("lines")}
                {error("offeringId")}
                {!selected.length ? (
                  <FieldDescription>
                    Select at least one option to request a quote.
                  </FieldDescription>
                ) : null}
                {selected.map((offering) => (
                  <Field className="sr-field" key={offering.id}>
                    <FieldLabel htmlFor={`${ids}-quantity-${offering.id}`}>
                      Quantity ·{" "}
                      {offering.variantName &&
                      offering.variantName.toLowerCase() !== "default"
                        ? offering.variantName
                        : offering.name}
                    </FieldLabel>
                    <Input
                      id={`${ids}-quantity-${offering.id}`}
                      type="number"
                      inputMode="decimal"
                      min={
                        offering.quantityScale === 0
                          ? "1"
                          : String(10 ** -offering.quantityScale)
                      }
                      max="50"
                      step={String(10 ** -offering.quantityScale)}
                      value={quantities[offering.id] ?? "1"}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [offering.id]: event.target.value,
                        }))
                      }
                      required
                      {...invalid("quantity")}
                    />
                    {offering.guidance ? (
                      <FieldDescription>{offering.guidance}</FieldDescription>
                    ) : null}
                  </Field>
                ))}
                {error("quantity")}
              </FieldGroup>
            </fieldset>
            <fieldset disabled={pending} className="sr-section">
              <legend className="sr-sr-only">Contact details</legend>
              <h2>Your details</h2>
              <FieldGroup>
                <Field className="sr-field">
                  <FieldLabel htmlFor={`${ids}-name`}>Your name</FieldLabel>
                  <Input
                    id={`${ids}-name`}
                    name="customerName"
                    autoComplete="name"
                    maxLength={80}
                    value={customerName}
                    onChange={(event) => setName(event.target.value)}
                    required
                    {...invalid("customerName")}
                  />
                  {error("customerName")}
                </Field>
                <Field className="sr-field">
                  <FieldLabel htmlFor={`${ids}-phone`}>Phone number</FieldLabel>
                  <Input
                    id={`${ids}-phone`}
                    name="customerPhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={32}
                    value={customerPhone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                    {...invalid("customerPhone")}
                  />
                  <FieldDescription>
                    The business will use this number to follow up.
                  </FieldDescription>
                  {error("customerPhone")}
                </Field>
                <Field className="sr-field">
                  <FieldLabel htmlFor={`${ids}-details`}>
                    Anything else? (Optional)
                  </FieldLabel>
                  <Textarea
                    id={`${ids}-details`}
                    name="details"
                    rows={3}
                    maxLength={500}
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    {...invalid("details")}
                  />
                  {error("details")}
                </Field>
              </FieldGroup>
            </fieldset>
            <section className="sr-section">
              <h2>Request summary</h2>
              <div aria-live="polite">
                {selected.map((offering) => (
                  <div className="sr-request-line" key={offering.id}>
                    {facts(
                      offering.catalogItemName,
                      offering.variantName,
                      quantities[offering.id] ?? "1",
                      lineTotal(offering, quantities[offering.id] ?? "1"),
                    )}
                  </div>
                ))}
              </div>
              <p className="sr-help">
                The business will review all selected options and confirm the
                price and timing. No payment is taken now.
              </p>
              <Button type="submit" disabled={pending || !selected.length}>
                {pending ? "Sending request…" : "Send quote request"}
              </Button>
            </section>
          </form>
        </main>
      )}
      <footer className="sr-wrap sr-footer">
        <span>{businessName}</span>
        <StorefrontAttribution />
      </footer>
    </div>
  )
}
