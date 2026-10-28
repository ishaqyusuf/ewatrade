"use client"

import { CommerceLink } from "../../commerce/navigation"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Spinner,
  buttonVariants,
} from "@ewatrade/ui"

import { useId, useRef, useState } from "react"

import { useStorefrontCommerce } from "../../commerce/provider"

import type { AccountView } from "@ewatrade/storefront-contracts/customer"
import { parseReference } from "./reference"
export function FindRequest({
  account,
}: { account: Extract<AccountView, { signedIn: true }> }) {
  const { adapter, navigate } = useStorefrontCommerce()
  const lookup = account.lookup ?? null
  const [reference, setReference] = useState(lookup?.reference ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const ids = { reference: useId(), error: useId() }
  const inputRef = useRef<HTMLInputElement>(null)
  if (account.channel !== "whatsapp")
    return lookup ? (
      <Alert className="sf-feature-note">
        <AlertTitle>Find {lookup.reference} with WhatsApp</AlertTitle>
        <AlertDescription>
          Guest requests are found by the WhatsApp number they were sent from.
          Log out, then choose Find a request and verify that number.
        </AlertDescription>
      </Alert>
    ) : null
  const submit = async () => {
    const parsed = parseReference(reference)
    if (!parsed.reference) {
      setError(parsed.problem)
      requestAnimationFrame(() => inputRef.current?.focus())
      return
    }
    setPending(true)
    setError(null)
    try {
      const result = await adapter.findRequest({ reference: parsed.reference })
      if (result.ok) navigate(result.receiptPath)
      else {
        setError(result.message)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    } catch {
      setError("We couldn't reach the shop. Try again.")
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="sf-feature-find">
      {lookup?.href ? (
        <Alert className="sf-feature-note">
          <AlertTitle>Request {lookup.reference}</AlertTitle>
          <AlertDescription>
            <p>Sent from your verified WhatsApp number.</p>
            <CommerceLink
              className={buttonVariants({
                variant: "outline",
                className: "sf-feature-mt",
              })}
              href={lookup.href}
            >
              Open request
            </CommerceLink>
          </AlertDescription>
        </Alert>
      ) : null}
      <form
        className="sf-feature-find__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field
          data-invalid={error || (lookup && !lookup.href) ? true : undefined}
        >
          <FieldLabel htmlFor={ids.reference}>
            Find a request by its reference
          </FieldLabel>
          <Input
            id={ids.reference}
            ref={inputRef}
            value={reference}
            maxLength={24}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="R-7KQ2MX"
            aria-invalid={error || (lookup && !lookup.href) ? true : undefined}
            aria-describedby={
              error || (lookup && !lookup.href) ? ids.error : undefined
            }
            onChange={(event) => {
              setReference(event.target.value)
              setError(null)
            }}
          />
          {error ? (
            <FieldError id={ids.error} role="alert">
              {error}
            </FieldError>
          ) : lookup && !lookup.href ? (
            <FieldError id={ids.error}>
              We couldn't find {lookup.reference} from your verified WhatsApp
              number. Check the reference on your receipt.
            </FieldError>
          ) : (
            <FieldDescription>
              Only requests sent from {account.label} can be opened here.
            </FieldDescription>
          )}
        </Field>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? <Spinner /> : null}
          Find request
        </Button>
      </form>
    </div>
  )
}
