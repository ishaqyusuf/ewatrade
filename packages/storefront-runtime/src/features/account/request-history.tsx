"use client"

import { CommerceLink } from "../../commerce/navigation"

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
  Spinner,
  buttonVariants,
} from "@ewatrade/ui"
import { Logout01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useRef, useState } from "react"

import { useStorefrontCommerce } from "../../commerce/provider"

import type { AccountView } from "@ewatrade/storefront-contracts/customer"
import { FindRequest } from "./request-recovery-form"
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

export function StorefrontRequestHistory({
  account,
}: { account: Extract<AccountView, { signedIn: true }> }) {
  const { adapter, href, navigate } = useStorefrontCommerce()
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
      if (result.ok) navigate(then, { replace: true, refresh: true })
      else setError(result.message ?? "That didn't work.")
    } catch {
      setError("We couldn't reach the shop. Try again.")
    } finally {
      setPending(null)
    }
  }
  return (
    <div className="sf-feature-account">
      <div className="sf-feature-section__head">
        <div>
          <h1
            className="sf-feature-title sf-feature-title--page"
            tabIndex={-1}
            ref={headingRef}
          >
            Your account
          </h1>
          <p className="sf-feature-muted">Logged in with {account.label}</p>
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
      <FindRequest account={account} />
      {account.linkable.length ? (
        <Alert className="sf-feature-note">
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
              className="sf-feature-mt"
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
        <ul className="sf-feature-history">
          {account.history.map((entry) => (
            <li key={entry.key}>
              <CommerceLink
                className="sf-feature-history__row"
                href={entry.href}
              >
                <span>
                  <strong>{entry.reference}</strong>
                  <span className="sf-feature-muted">
                    {" "}
                    ·{" "}
                    {entry.kind === "order"
                      ? "Order request"
                      : "Service request"}
                  </span>
                  <span className="sf-feature-history__summary">
                    {entry.summary}
                  </span>
                </span>
                <span className="sf-feature-history__meta">
                  <Badge variant="secondary">
                    {stageLabel[entry.stage] ?? entry.stage}
                  </Badge>
                  <span className="sf-feature-muted">
                    {new Date(entry.createdAt).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      timeZone: "Africa/Lagos",
                    })}
                  </span>
                </span>
              </CommerceLink>
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="sf-feature-empty">
          <EmptyHeader>
            <EmptyTitle>No requests yet</EmptyTitle>
            <EmptyDescription>
              Requests you send while logged in appear here.
            </EmptyDescription>
          </EmptyHeader>
          <CommerceLink
            className={buttonVariants({ className: "sf-feature-primary" })}
            href={href("/")}
          >
            Start shopping
          </CommerceLink>
        </Empty>
      )}
    </div>
  )
}
