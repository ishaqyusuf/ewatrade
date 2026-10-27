"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
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
  buttonVariants,
} from "@ewatrade/ui"
import {
  Logout01Icon,
  Mail01Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useId, useRef, useState } from "react"
import { useCommerceStudio } from "./context"

export type AccountView =
  | {
      signedIn: false
      channels: readonly ("email" | "whatsapp")[]
      next: string | null
      testAdapter: boolean
    }
  | {
      signedIn: true
      label: string
      channel: "email" | "whatsapp"
      history: {
        key: string
        reference: string
        kind: "order" | "service"
        stage: string
        createdAt: string
        summary: string
        href: string
      }[]
      linkable: {
        reference: string
        kind: "order" | "service"
        createdAt: string
      }[]
    }

const stageLabel: Record<string, string> = {
  received: "Received",
  needs_information: "Question for you",
  quoted: "Quote ready",
  confirmed: "Confirmed",
  ready: "Ready",
  completed: "Completed",
  declined: "Not accepted",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
  SUBMITTED: "Received",
  NEEDS_INFORMATION: "Question for you",
  QUOTED: "Quote ready",
  CONVERTED: "Confirmed",
  DECLINED: "Not accepted",
  WITHDRAWN: "Withdrawn",
}

export function CommerceAccount({ account }: { account: AccountView }) {
  return (
    <section className="cs-section">
      <div className="cs-wrap cs-narrow">
        {account.signedIn ? (
          <SignedIn account={account} />
        ) : (
          <SignIn account={account} />
        )}
      </div>
    </section>
  )
}

function SignIn({
  account,
}: { account: Extract<AccountView, { signedIn: false }> }) {
  const { adapter, snapshot } = useCommerceStudio()
  const [channel, setChannel] = useState<"email" | "whatsapp">(
    account.channels[0] ?? "email",
  )
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
  const ids = { identifier: useId(), code: useId(), error: useId() }
  const codeRef = useRef<HTMLInputElement>(null)
  const identifierRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])
  if (!account.channels.length)
    return (
      <Empty className="cs-empty">
        <EmptyHeader>
          <EmptyTitle>
            <h1 className="cs-empty__heading">
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
      const next =
        account.next?.startsWith("/") && !account.next.startsWith("//")
          ? account.next
          : "/account"
      window.location.assign(next)
    } catch {
      setError("We couldn't check the code. Try again.")
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="cs-auth">
      <h1 className="cs-title cs-title--page">
        Log in to {snapshot.resources.business.name}
      </h1>
      <p className="cs-lead">
        See your requests and orders in one place. You don't need an account to
        order.
      </p>
      {!challenge ? (
        <form
          className="cs-auth__form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          {account.channels.length > 1 ? (
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
            className="cs-primary cs-full"
            disabled={pending || wait > 0}
          >
            {pending ? <Spinner /> : null}
            {wait > 0 ? `Send code in ${wait}s` : "Send code"}
          </Button>
        </form>
      ) : (
        <form
          className="cs-auth__form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void verify(code)
          }}
        >
          <p>
            Enter the code sent to <strong>{challenge.destination}</strong>.
          </p>
          {challenge.testCode ? (
            <Alert className="cs-note">
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
            className="cs-primary cs-full"
            disabled={pending || code.length !== 6}
          >
            {pending ? <Spinner /> : null}
            Log in
          </Button>
          <div className="cs-row-actions">
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
              Use a different {channel === "email" ? "email" : "number"}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

function SignedIn({
  account,
}: { account: Extract<AccountView, { signedIn: true }> }) {
  const { adapter, href } = useCommerceStudio()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Arriving from login, nothing is focused: start at the heading once so screen
  // readers announce "Your account". Never steals focus the visitor already moved.
  useEffect(() => {
    if (document.activeElement === document.body) headingRef.current?.focus()
  }, [])
  const act = async (
    key: string,
    run: () => Promise<{ ok: boolean; message?: string }>,
    then: string,
  ) => {
    setPending(key)
    setError(null)
    try {
      const result = await run()
      if (result.ok) window.location.assign(then)
      else setError(result.message ?? "That didn't work.")
    } catch {
      setError("We couldn't reach the shop. Try again.")
    } finally {
      setPending(null)
    }
  }
  return (
    <div className="cs-account">
      <div className="cs-section__head">
        <div>
          <h1
            className="cs-title cs-title--page"
            tabIndex={-1}
            ref={headingRef}
          >
            Your account
          </h1>
          <p className="cs-muted">Logged in with {account.label}</p>
        </div>
        <Button
          variant="outline"
          disabled={pending !== null}
          onClick={() => void act("logout", () => adapter.logout(), "/")}
        >
          <HugeiconsIcon icon={Logout01Icon} strokeWidth={1.8} />
          Log out
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {account.linkable.length ? (
        <Alert className="cs-note">
          <AlertTitle>
            {account.linkable.length} earlier{" "}
            {account.linkable.length === 1 ? "request" : "requests"} from your
            WhatsApp number
          </AlertTitle>
          <AlertDescription>
            <p>
              You sent these as a guest from the number you just verified. Add
              them to your account to see them here.
            </p>
            <Button
              className="cs-mt"
              variant="outline"
              disabled={pending !== null}
              onClick={() =>
                void act("link", () => adapter.linkVerified(), "/account")
              }
            >
              {pending === "link" ? <Spinner /> : null}
              Add them to my account
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {account.history.length ? (
        <ul className="cs-history">
          {account.history.map((entry) => (
            <li key={entry.key}>
              <a className="cs-history__row" href={entry.href}>
                <span>
                  <strong>{entry.reference}</strong>
                  <span className="cs-muted">
                    {" "}
                    ·{" "}
                    {entry.kind === "order"
                      ? "Order request"
                      : "Service request"}
                  </span>
                  <span className="cs-history__summary">{entry.summary}</span>
                </span>
                <span className="cs-history__meta">
                  <Badge variant="secondary">
                    {stageLabel[entry.stage] ?? entry.stage}
                  </Badge>
                  <span className="cs-muted">
                    {new Date(entry.createdAt).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      timeZone: "Africa/Lagos",
                    })}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="cs-empty">
          <EmptyHeader>
            <EmptyTitle>No requests yet</EmptyTitle>
            <EmptyDescription>
              Requests you send while logged in appear here.
            </EmptyDescription>
          </EmptyHeader>
          <a
            className={buttonVariants({ className: "cs-primary" })}
            href={href("/")}
          >
            Start shopping
          </a>
        </Empty>
      )}
    </div>
  )
}
