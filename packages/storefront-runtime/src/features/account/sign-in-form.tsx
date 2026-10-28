"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@ewatrade/ui"
import { Mail01Icon, WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useId, useRef, useState } from "react"
import { useStorefrontCommerce } from "../../commerce/provider"

import type { AccountView } from "@ewatrade/storefront-contracts/customer"
import { parseReference } from "./reference"
export function StorefrontSignIn({
  account,
  embedded = false,
  onSignedIn,
}: {
  account: Extract<AccountView, { signedIn: false }>
  embedded?: boolean
  onSignedIn?: () => void
}) {
  const { adapter, snapshot, navigate } = useStorefrontCommerce()
  // Guest recovery proves the WhatsApp number a request was sent from; no other way in.
  const canFind = !embedded && account.channels.includes("whatsapp")
  const [mode, setMode] = useState<"login" | "find">(
    canFind && account.find ? "find" : "login",
  )
  const [loginChannel, setChannel] = useState<"email" | "whatsapp">(
    account.channels[0] ?? "email",
  )
  const channel = mode === "find" ? "whatsapp" : loginChannel
  const [reference, setReference] = useState(account.find ?? "")
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const [found, setFound] = useState<string | null>(null)
  const [identifier, setIdentifier] = useState("")
  const [challenge, setChallenge] = useState<{
    id: string
    destination: string
    testCode?: string
  } | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [wait, setWait] = useState(0)
  const ids = {
    identifier: useId(),
    code: useId(),
    error: useId(),
    reference: useId(),
    referenceError: useId(),
  }
  const referenceRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const identifierRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])
  if (!account.channels.length)
    return (
      <Empty className="sf-feature-empty">
        <EmptyHeader>
          <EmptyTitle>
            <h1 className="sf-feature-empty__heading">
              Login isn't available right now
            </h1>
          </EmptyTitle>
          <EmptyDescription>
            You can still order as a guest. Your receipt link keeps track of
            your request.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  const send = async () => {
    setError(null)
    setReferenceError(null)
    if (mode === "find") {
      const parsed = parseReference(reference)
      if (!parsed.reference) {
        setReferenceError(parsed.problem)
        requestAnimationFrame(() => referenceRef.current?.focus())
        return
      }
      setFound(parsed.reference)
    }
    if (!identifier.trim()) {
      setError(
        channel === "email"
          ? "Enter your email."
          : "Enter your WhatsApp number.",
      )
      return
    }
    setPending(true)
    try {
      const result = await adapter.requestCode({
        channel,
        identifier: identifier.trim(),
      })
      if (!result.ok) {
        setError(result.message)
        if (result.retryAfterSeconds) setWait(result.retryAfterSeconds)
        return
      }
      setChallenge({
        id: result.challengeId,
        destination: result.destination,
        testCode: result.testCode,
      })
      setWait(result.resendAfterSeconds)
      setCode("")
      requestAnimationFrame(() => codeRef.current?.focus())
    } catch {
      setError("We couldn't send a code. Check your connection and try again.")
    } finally {
      setPending(false)
    }
  }
  const verify = async (value: string) => {
    if (!challenge || value.length !== 6 || pending) return
    setPending(true)
    setError(null)
    try {
      const result = await adapter.verifyCode({
        challengeId: challenge.id,
        code: value,
      })
      if (!result.ok) {
        setError(result.message)
        // Keep digits the customer typed while this code was being checked.
        setCode((current) => (current === value ? "" : current))
        requestAnimationFrame(() => codeRef.current?.focus())
        return
      }
      if (mode === "find" && found) {
        // Now verified: open the request only if it was sent from this number.
        // A miss keeps the reference so the account page can say so.
        const lookup = await adapter
          .findRequest({ reference: found })
          .catch(() => null)
        navigate(
          lookup?.ok
            ? lookup.receiptPath
            : `/account?find=${encodeURIComponent(found)}`,
          { replace: true, refresh: true },
        )
        return
      }
      if (onSignedIn) {
        onSignedIn()
        return
      }
      const next =
        account.next?.startsWith("/") && !account.next.startsWith("//")
          ? account.next
          : "/account"
      navigate(next, { replace: true, refresh: true })
    } catch {
      setError("We couldn't check the code. Try again.")
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="sf-feature-auth" data-embedded={embedded || undefined}>
      {embedded ? (
        <h2 className="sf-feature-subtitle">Log in with a code</h2>
      ) : (
        <>
          <h1 className="sf-feature-title sf-feature-title--page">
            {mode === "find"
              ? "Find your request"
              : `Log in to ${snapshot.resources.business.name}`}
          </h1>
          <p className="sf-feature-lead">
            {mode === "find"
              ? "Enter the reference from your receipt and the WhatsApp number you sent it from. We'll send a code to that number to check it's you."
              : "See your requests and orders in one place. You don't need an account to order."}
          </p>
        </>
      )}
      {!challenge ? (
        <form
          className="sf-feature-auth__form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          {mode === "find" ? (
            <Field data-invalid={referenceError ? true : undefined}>
              <FieldLabel htmlFor={ids.reference}>Request reference</FieldLabel>
              <Input
                id={ids.reference}
                ref={referenceRef}
                value={reference}
                maxLength={24}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="R-7KQ2MX"
                aria-invalid={referenceError ? true : undefined}
                aria-describedby={
                  referenceError ? ids.referenceError : undefined
                }
                onChange={(event) => setReference(event.target.value)}
              />
              {referenceError ? (
                <FieldError id={ids.referenceError}>
                  {referenceError}
                </FieldError>
              ) : null}
            </Field>
          ) : account.channels.length > 1 ? (
            <Tabs
              value={channel}
              onValueChange={(value) => {
                setChannel(value as "email" | "whatsapp")
                setIdentifier("")
                setError(null)
              }}
            >
              <TabsList aria-label="How to get your code">
                <TabsTrigger value="email">
                  <HugeiconsIcon icon={Mail01Icon} strokeWidth={1.8} /> Email
                </TabsTrigger>
                <TabsTrigger value="whatsapp">
                  <HugeiconsIcon icon={WhatsappIcon} strokeWidth={1.8} />{" "}
                  WhatsApp
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={ids.identifier}>
              {channel === "email" ? "Email" : "WhatsApp number"}
            </FieldLabel>
            <Input
              id={ids.identifier}
              ref={identifierRef}
              type={channel === "email" ? "email" : "tel"}
              inputMode={channel === "email" ? "email" : "tel"}
              autoComplete={channel === "email" ? "email" : "tel"}
              value={identifier}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ids.error : undefined}
              onChange={(event) => setIdentifier(event.target.value)}
            />
            <FieldDescription>
              We'll send a 6-digit code. It expires in 10 minutes.
            </FieldDescription>
            {error ? <FieldError id={ids.error}>{error}</FieldError> : null}
          </Field>
          <Button
            type="submit"
            size="lg"
            className="sf-feature-primary sf-feature-full"
            disabled={pending || wait > 0}
          >
            {pending ? <Spinner /> : null}
            {wait > 0 ? `Send code in ${wait}s` : "Send code"}
          </Button>
          {canFind ? (
            <Button
              type="button"
              variant="ghost"
              className="sf-feature-full"
              onClick={() => {
                setMode(mode === "find" ? "login" : "find")
                setIdentifier("")
                setError(null)
                setReferenceError(null)
                requestAnimationFrame(() =>
                  (mode === "find"
                    ? identifierRef.current
                    : referenceRef.current
                  )?.focus(),
                )
              }}
            >
              {mode === "find"
                ? "Log in instead"
                : "Ordered as a guest? Find a request"}
            </Button>
          ) : null}
        </form>
      ) : (
        <form
          className="sf-feature-auth__form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void verify(code)
          }}
        >
          <p>
            Enter the code sent to <strong>{challenge.destination}</strong>.
            {mode === "find" && found
              ? ` Then we'll open request ${found} if it was sent from this number. This also logs you in on this device.`
              : null}
          </p>
          {challenge.testCode ? (
            <Alert className="sf-feature-note">
              <AlertTitle>Test delivery</AlertTitle>
              <AlertDescription>
                This environment uses a test code adapter. Nothing was sent.
                Code: {challenge.testCode}
              </AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={ids.code}>6-digit code</FieldLabel>
            <InputOTP
              id={ids.code}
              ref={codeRef}
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ids.error : undefined}
              onChange={(value) => {
                setCode(value.replace(/\D/g, ""))
                setError(null)
              }}
              onComplete={(value: string) => void verify(value)}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <InputOTPSlot key={index} index={index} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {error ? (
              <FieldError id={ids.error} role="alert">
                {error}
              </FieldError>
            ) : null}
          </Field>
          <Button
            type="submit"
            size="lg"
            className="sf-feature-primary sf-feature-full"
            disabled={pending || code.length !== 6}
          >
            {pending ? <Spinner /> : null}
            {mode === "find" ? "Find request" : "Log in"}
          </Button>
          <div className="sf-feature-row-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={pending || wait > 0}
              onClick={() => void send()}
            >
              {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setChallenge(null)
                setCode("")
                setError(null)
                requestAnimationFrame(() => identifierRef.current?.focus())
              }}
            >
              {mode === "find"
                ? "Change reference or number"
                : `Use a different ${channel === "email" ? "email" : "number"}`}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

/** Signed in with WhatsApp: open one of this number's requests by its reference. */
