"use client"

import { StorefrontFeatureFrame } from "./frame"

import { CommerceLink } from "../commerce/navigation"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
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
import {
  ArrowLeft01Icon,
  Cancel01Icon,
  Location01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useId, useRef, useState } from "react"
import {
  type BagLine,
  bagTotals,
  clearCheckoutDraft,
  formatMoney,
  formatPreferredDate,
  isPreorderLine,
  issueMessage,
  newClientId,
  preorderDates,
  quantityProblem,
  readCheckoutDraft,
  stockWording,
  writeCheckoutDraft,
} from "../commerce/model"
import { useStorefrontCommerce } from "../commerce/provider"
import { StorefrontQuickLogin } from "./account/account"
import { BagIntentNote, BagLines } from "./bag"

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
function sessionStore() {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function StorefrontCheckout() {
  return (
    <StorefrontFeatureFrame>
      <CheckoutBody />
    </StorefrontFeatureFrame>
  )
}

function CheckoutBody() {
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
    navigate,
  } = useStorefrontCommerce()
  const methods = [
    ...(header.offerPickup ? (["pickup"] as const) : []),
    ...(header.offerDelivery ? (["delivery"] as const) : []),
  ]
  // No method switched on means no checkout; never assume pickup.
  const offered: readonly Fields["fulfilment"][] = methods
  const noMethods = !offered.length
  const scope = snapshot.resources.business.slug || "storefront"
  const commerce = snapshot.resources.commerce
  const channels = commerce?.customerAccounts.channels ?? []
  const loginOffered =
    !customer?.signedIn &&
    (accounts ||
      (preview && !!commerce?.customerAccounts.available && header.showLogin))
  const [loginOpen, setLoginOpen] = useState(false)
  const [restored, setRestored] = useState(false)
  const [geoSupported, setGeoSupported] = useState(false)
  const [geo, setGeo] = useState<"idle" | "finding" | "shared" | "denied">(
    "idle",
  )
  const sharedLine = useRef<string | null>(null)
  const signedInHere = useRef(false)
  const loginToggleRef = useRef<HTMLButtonElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
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
  const [receiptPath, setReceiptPath] = useState<string | null>(null)
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

  // Restore this visit's typed details (after a quick login or a trip to /account).
  // biome-ignore lint/correctness/useExhaustiveDependencies: restore once per Store.
  useEffect(() => {
    setGeoSupported(
      typeof navigator !== "undefined" && "geolocation" in navigator,
    )
    if (!preview) {
      const draft = readCheckoutDraft(sessionStore(), scope)
      if (draft)
        setFields((current) => ({
          ...current,
          ...draft,
          fulfilment: offered.includes(draft.fulfilment)
            ? draft.fulfilment
            : current.fulfilment,
        }))
    }
    setRestored(true)
  }, [scope, preview])
  useEffect(() => {
    if (!restored || preview) return
    writeCheckoutDraft(sessionStore(), scope, fields)
  }, [restored, preview, scope, fields])
  // Verified facts fill only fields that are still empty; typed values always win.
  const verified = customer?.signedIn
    ? {
        name: customer.name ?? "",
        email: customer.email ?? "",
        phone: customer.phone ?? "",
      }
    : null
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the verified values.
  useEffect(() => {
    if (!restored || !verified) return
    setFields((current) => ({
      ...current,
      customerName: current.customerName || verified.name.slice(0, 80),
      customerPhone: current.customerPhone || verified.phone.slice(0, 24),
      customerEmail: current.customerEmail || verified.email.slice(0, 254),
    }))
  }, [restored, verified?.name, verified?.email, verified?.phone])
  // After a quick login here, continue at the first empty required field, or Send.
  useEffect(() => {
    if (!customer?.signedIn || !signedInHere.current) return
    signedInHere.current = false
    requestAnimationFrame(() => {
      const empty = [ids.name, ids.phone]
        .map((id) => document.getElementById(id) as HTMLInputElement | null)
        .find((input) => input && !input.value.trim())
      const target = empty ?? submitRef.current
      target?.focus()
    })
  }, [customer?.signedIn, ids.name, ids.phone])

  const locate = () => {
    if (preview || !geoSupported) return
    setGeo("finding")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const line = `Shared location: ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`
        sharedLine.current = line
        setFields((current) => {
          const base = current.deliveryAddress
            .split("\n")
            .filter((entry) => !entry.startsWith("Shared location: "))
            .join("\n")
            .trim()
            .slice(0, 300 - line.length - 1)
          return {
            ...current,
            deliveryAddress: base ? `${base}\n${line}` : line,
          }
        })
        setGeo("shared")
      },
      () => setGeo("denied"),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    )
  }
  const forgetLocation = () => {
    const line = sharedLine.current
    sharedLine.current = null
    setGeo("idle")
    if (!line) return
    setFields((current) => ({
      ...current,
      deliveryAddress: current.deliveryAddress
        .split("\n")
        .filter((entry) => entry !== line)
        .join("\n")
        .trim(),
    }))
  }

  // Re-check current prices/availability whenever the bag changes.
  const signature = bag.lines
    .map(
      (line) =>
        `${line.offeringId}:${line.quantity}:${line.priceMinor}:${line.intent ?? "purchase"}:${line.preferredDate ?? ""}`,
    )
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
          // Requested ahead: today's stock doesn't decide; the business confirms later.
          const ahead = isPreorderLine(saved)
          if (!line.available)
            next[line.offeringId] = "This item is no longer available."
          else if (line.priceMinor === null)
            next[line.offeringId] = "This item is now priced on request."
          else if (line.priceMinor !== saved.priceMinor)
            next[line.offeringId] =
              `The price is now ${formatMoney(line.priceMinor, saved.currencyCode)}.`
          else if (!ahead && line.stock === "out_of_stock")
            next[line.offeringId] = "This just sold out."
          else if (!ahead && !line.enough)
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
      <section className="sf-feature-section">
        <div className="sf-feature-wrap sf-feature-narrow">
          <Empty className="sf-feature-empty">
            <EmptyHeader>
              <EmptyTitle>
                <h1 className="sf-feature-empty__heading">
                  Ordering isn't available here
                </h1>
              </EmptyTitle>
              <EmptyDescription>
                This shop isn't taking order requests on this site right now.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <CommerceLink
                className={buttonVariants({ variant: "outline" })}
                href={href("/")}
              >
                Back to the shop
              </CommerceLink>
            </EmptyContent>
          </Empty>
        </div>
      </section>
    )
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
  if (bagReady && !bag.lines.length)
    return (
      <section className="sf-feature-section">
        <div className="sf-feature-wrap sf-feature-narrow">
          <Empty className="sf-feature-empty">
            <EmptyHeader>
              <EmptyTitle>
                <h1 className="sf-feature-empty__heading">Your bag is empty</h1>
              </EmptyTitle>
              <EmptyDescription>
                Add items from the shop to send an order request.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <CommerceLink
                className={buttonVariants({ className: "sf-feature-primary" })}
                href={href("/shop")}
              >
                Browse the shop
              </CommerceLink>
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
          (!isPreorderLine(line) &&
            (check.stock === "out_of_stock" || !check.enough))))
    )
  })
  const aheadDates = preorderDates(bag.lines)
  const aheadUndated = bag.lines.some(
    (line) => isPreorderLine(line) && !line.preferredDate,
  )
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
    return next
  }

  const submit = async () => {
    if (busy.current || receiptPath || noMethods) return
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
    // One request carries one preferred date for everything requested ahead.
    if (aheadDates.length > 1 || aheadUndated) {
      setFormError(
        aheadUndated
          ? "Some items requested ahead have no date. Remove them and add them again with a date."
          : `Items requested ahead must share one date. Remove the items that aren't for ${formatPreferredDate(aheadDates[0] as string)} and send them separately.`,
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
        ...(isPreorderLine(line) ? { preorder: true } : {}),
      })),
      ...(aheadDates[0] ? { preferredDate: aheadDates[0] } : {}),
      customerName: fields.customerName.trim(),
      customerPhone: fields.customerPhone.trim(),
      customerEmail: fields.customerEmail.trim(),
      fulfilment: fields.fulfilment,
      ...(fields.fulfilment === "delivery" && fields.deliveryAddress.trim()
        ? { deliveryAddress: fields.deliveryAddress.trim() }
        : {}),
      ...(fields.notes.trim() ? { notes: fields.notes.trim() } : {}),
    }
    const clientRequestId =
      stableRequestId(JSON.stringify(payload)) ?? newClientId()
    busy.current = true
    setPending(true)
    let completed = false
    try {
      const result = await adapter.submitOrder({ clientRequestId, ...payload })
      if (result.ok) {
        forgetRequestId()
        clearCheckoutDraft(sessionStore(), scope)
        clearBag()
        completed = true
        setReceiptPath(result.receiptPath)
        navigate(result.receiptPath)
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
      if (!completed) {
        busy.current = false
        setPending(false)
      }
    }
  }

  return (
    <section className="sf-feature-section sf-feature-checkout">
      <div className="sf-feature-wrap">
        <CommerceLink className="sf-feature-back" href={href("/shop")}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          Keep shopping
        </CommerceLink>
        <h1 className="sf-feature-title sf-feature-title--page">
          Send your order request
        </h1>
        <p className="sf-feature-lead sf-feature-lead--narrow">
          No payment now. {snapshot.resources.business.name} checks stock
          {header.offerDelivery ? " and any delivery fee" : ""}, confirms the
          total with you on WhatsApp, then shares how to pay.
        </p>
        <div className="sf-feature-checkout__grid">
          <div className="sf-feature-checkout__main">
            {accounts && customer?.signedIn ? (
              <Alert className="sf-feature-note">
                <HugeiconsIcon icon={UserIcon} strokeWidth={1.8} />
                <AlertDescription>
                  Signed in as{" "}
                  <strong>{customer.name || customer.label}</strong>.
                </AlertDescription>
              </Alert>
            ) : null}
            {loginOffered ? (
              <Alert className="sf-feature-note">
                <HugeiconsIcon icon={UserIcon} strokeWidth={1.8} />
                <AlertDescription>
                  Ordering as a guest.{" "}
                  {channels.length || preview ? (
                    <button
                      ref={loginToggleRef}
                      type="button"
                      className="sf-feature-link sf-feature-link-button"
                      aria-expanded={loginOpen}
                      aria-controls="sf-feature-quick-login"
                      onClick={() => setLoginOpen((open) => !open)}
                    >
                      Log in
                    </button>
                  ) : (
                    <CommerceLink
                      className="sf-feature-link"
                      href="/account?next=/checkout"
                    >
                      Log in
                    </CommerceLink>
                  )}{" "}
                  to keep it in your history.
                </AlertDescription>
              </Alert>
            ) : null}
            {loginOffered && (channels.length || preview) ? (
              // Outside the checkout form: the code steps are forms of their own.
              <section
                id="sf-feature-quick-login"
                className="sf-feature-card-panel sf-feature-quick-login"
                aria-label="Log in with a code"
                hidden={!loginOpen}
              >
                {preview ? (
                  <>
                    <h2 className="sf-feature-subtitle">Log in with a code</h2>
                    <p className="sf-feature-muted">
                      Log in isn't available in preview.
                    </p>
                  </>
                ) : (
                  <StorefrontQuickLogin
                    channels={channels}
                    onSignedIn={() => {
                      signedInHere.current = true
                      setLoginOpen(false)
                      // Same route, fresh session facts; the bag and the draft stay.
                      navigate("/checkout", { replace: true, refresh: true })
                    }}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="sf-feature-full"
                  onClick={() => {
                    setLoginOpen(false)
                    requestAnimationFrame(() => loginToggleRef.current?.focus())
                  }}
                >
                  Continue as guest
                </Button>
              </section>
            ) : null}
            <form
              className="sf-feature-checkout__form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              {formError ? (
                <Alert
                  variant="destructive"
                  className="sf-feature-alert"
                  ref={errorRef}
                  tabIndex={-1}
                >
                  <AlertTitle>Not sent yet</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
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
                    <FieldLabel htmlFor={ids.email}>
                      Email (optional)
                    </FieldLabel>
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
              {noMethods ? (
                <Alert className="sf-feature-note">
                  <AlertTitle>Order requests are paused</AlertTitle>
                  <AlertDescription>
                    {snapshot.resources.business.name} hasn't set up pickup or
                    delivery on this site yet, so a request can't be sent.
                    Message the business to order.
                  </AlertDescription>
                </Alert>
              ) : offered.length > 1 ? (
                <FieldSet>
                  <FieldLegend>How you'll get it</FieldLegend>
                  <RadioGroup
                    value={fields.fulfilment}
                    onValueChange={(value) =>
                      set("fulfilment", value as Fields["fulfilment"])
                    }
                    className="sf-feature-radio-cards"
                  >
                    {offered.map((method) => (
                      <Field
                        key={method}
                        orientation="horizontal"
                        className="sf-feature-radio-card"
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
                            <span className="sf-feature-muted">
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
                <p className="sf-feature-muted sf-feature-fulfilment-note">
                  {offered[0] === "delivery"
                    ? `Delivery. ${header.deliveryNote || "The business confirms the delivery fee."}`
                    : `Pick up${header.location ? ` from ${header.location}` : " from the business"}.`}
                </p>
              )}
              {fields.fulfilment === "delivery" && !noMethods ? (
                <Field data-invalid={errors.deliveryAddress ? true : undefined}>
                  <FieldLabel htmlFor={ids.address}>
                    Delivery address (optional)
                  </FieldLabel>
                  <FieldDescription id={`${ids.address}-help`}>
                    Add it now, or the business will ask before confirming the
                    delivery cost.
                  </FieldDescription>
                  <Textarea
                    id={ids.address}
                    rows={3}
                    maxLength={300}
                    autoComplete="street-address"
                    value={fields.deliveryAddress}
                    aria-invalid={errors.deliveryAddress ? true : undefined}
                    aria-describedby={`${ids.address}-help${errors.deliveryAddress ? ` ${ids.address}-error` : ""}`}
                    onChange={(event) =>
                      set("deliveryAddress", event.target.value)
                    }
                  />
                  {geoSupported ? (
                    <div className="sf-feature-locate">
                      {geo === "shared" ? (
                        <Badge
                          variant="secondary"
                          className="sf-feature-locate__badge"
                        >
                          <HugeiconsIcon
                            icon={Location01Icon}
                            strokeWidth={1.8}
                          />
                          Location shared
                          <button
                            type="button"
                            className="sf-feature-locate__remove"
                            aria-label="Remove shared location"
                            onClick={forgetLocation}
                          >
                            <HugeiconsIcon
                              icon={Cancel01Icon}
                              strokeWidth={2}
                            />
                          </button>
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={preview || geo === "finding"}
                          onClick={locate}
                        >
                          {geo === "finding" ? (
                            <Spinner />
                          ) : (
                            <HugeiconsIcon
                              icon={Location01Icon}
                              strokeWidth={1.8}
                            />
                          )}
                          {geo === "finding"
                            ? "Finding you…"
                            : "Use my current location"}
                        </Button>
                      )}
                      <output className="sf-feature-fine">
                        {geo === "denied"
                          ? "Location not shared. You can type an address instead."
                          : preview
                            ? "Location isn't shared in preview."
                            : ""}
                      </output>
                    </div>
                  ) : null}
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
                ref={submitRef}
                type="submit"
                size="lg"
                className="sf-feature-primary sf-feature-full"
                disabled={pending || preview || noMethods}
              >
                {pending ? <Spinner /> : null}
                {pending
                  ? "Sending…"
                  : preview
                    ? "Send request (preview)"
                    : "Send order request"}
              </Button>
              <p className="sf-feature-fine">
                {noMethods
                  ? "Sending is off until the business sets up pickup or delivery."
                  : "Your request reference appears straight away. Nothing is charged until the business confirms."}
              </p>
            </form>
          </div>
          <aside
            className="sf-feature-summary"
            aria-labelledby="sf-feature-summary-title"
            ref={summaryRef}
            tabIndex={-1}
            data-open={
              summaryOpen || Object.keys(notes).length > 0 ? "true" : "false"
            }
          >
            <h2
              id="sf-feature-summary-title"
              className="sf-feature-summary__title"
            >
              <button
                type="button"
                className="sf-feature-summary__toggle"
                aria-expanded={summaryOpen}
                aria-controls="sf-feature-summary-body"
                onClick={() => setSummaryOpen((open) => !open)}
              >
                <span>
                  Order summary{" "}
                  {checking ? (
                    <Spinner
                      className="sf-feature-inline-spinner"
                      aria-label="Checking prices"
                    />
                  ) : null}
                </span>
                <span className="sf-feature-summary__total">
                  {totals.complete
                    ? formatMoney(totals.subtotal, currency)
                    : "To confirm"}
                </span>
              </button>
            </h2>
            <div
              id="sf-feature-summary-body"
              className="sf-feature-summary__body"
            >
              <BagIntentNote lines={bag.lines} />
              <BagLines lines={bag.lines} editable notes={notes} />
              {changedPrices.length ? (
                <Alert className="sf-feature-note">
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
              <div className="sf-feature-total-row">
                <span>Subtotal</span>
                <strong>
                  {totals.complete
                    ? formatMoney(totals.subtotal, currency)
                    : "To confirm"}
                </strong>
              </div>
              {fields.fulfilment === "delivery" && !noMethods ? (
                <>
                  {/* Never "Free" here: the business sets the fee when it confirms. */}
                  <div className="sf-feature-total-row sf-feature-total-row--quiet">
                    <span>Delivery</span>
                    <strong>To be confirmed</strong>
                  </div>
                  {fields.deliveryAddress.trim() ? null : (
                    <p className="sf-feature-fine">
                      The business will confirm delivery details and cost.
                    </p>
                  )}
                </>
              ) : null}
              {bag.lines.some(
                (line) =>
                  !isPreorderLine(line) &&
                  checks[line.offeringId]?.stock === "unknown",
              ) ? (
                <p className="sf-feature-fine">
                  <span
                    className="sf-feature-stock"
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
