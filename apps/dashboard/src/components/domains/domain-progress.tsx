"use client"

import { useDomainParams } from "@/hooks/use-domain-params"
import { useTRPC } from "@/trpc/client"
import { readPollInterval } from "@/trpc/query-read-errors"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

/** Checks stop after this long; "Check again" starts a new window. */
const CHECK_WINDOW_MS = 10 * 60_000

const PAYMENT: Record<string, string> = {
  CREATED: "Waiting for payment",
  PENDING: "Checking payment",
  PAID: "Paid",
  FAILED: "Payment failed",
  REFUND_PENDING: "Refund on the way",
  REFUNDED: "Refunded",
}
const REGISTRATION: Record<string, string> = {
  PENDING: "Waiting",
  REGISTERING: "In progress",
  REGISTERED: "Done",
  UNCERTAIN: "Being reviewed",
  FAILED: "Failed",
}

/**
 * After paying: payment and registration status. While this sheet is open
 * and the tab is visible it checks every 5 s (30 s when the result is
 * uncertain) until registered or refunded, for at most 10 minutes; then
 * it waits for "Check again".
 */
export function DomainProgress() {
  const trpc = useTRPC()
  const { domainOrderId, setParams } = useDomainParams()
  const [since, setSince] = useState(() => Date.now())
  // Re-render once the window ends so "Check again" appears.
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setTimeout(
      () => setTick((value) => value + 1),
      CHECK_WINDOW_MS - (Date.now() - since) + 50,
    )
    return () => clearTimeout(timer)
  }, [since])
  const order = useQuery({
    ...trpc.domains.order.queryOptions({
      orderId: domainOrderId ?? "",
    }),
    enabled: Boolean(domainOrderId),
    refetchIntervalInBackground: false,
    refetchInterval: (query) => {
      const current = query.state.data
      if (
        current?.registrationStatus === "REGISTERED" ||
        current?.paymentStatus === "REFUNDED" ||
        Date.now() - since > CHECK_WINDOW_MS
      ) {
        return false
      }
      return readPollInterval(
        query.state.error,
        current?.registrationStatus === "UNCERTAIN" ? 30_000 : 5_000,
      )
    },
  })

  if (!domainOrderId) {
    return <p className="text-muted-foreground">Order not selected.</p>
  }

  const data = order.data
  const complete = data?.registrationStatus === "REGISTERED"
  const failed = data?.registrationStatus === "FAILED"
  const uncertain = data?.registrationStatus === "UNCERTAIN"
  // A failed registration keeps checking while its refund is on the way.
  const stopped =
    !complete &&
    data?.paymentStatus !== "REFUNDED" &&
    Date.now() - since > CHECK_WINDOW_MS

  return (
    <div className="grid gap-5">
      <div className="rounded-[var(--ui-radius-surface)] border border-border bg-card p-4">
        <p className="text-lg font-semibold break-all">
          {data?.normalizedDomain ?? "Loading…"}
        </p>
        <dl className="mt-4 grid gap-3">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Payment</dt>
            <dd className="font-medium">
              {data ? (PAYMENT[data.paymentStatus] ?? "Checking") : "Checking"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Registration</dt>
            <dd className="font-medium">
              {data
                ? (REGISTRATION[data.registrationStatus] ?? "Waiting")
                : "Waiting"}
            </dd>
          </div>
        </dl>
      </div>
      {uncertain ? (
        <p className="rounded-[var(--ui-radius-control)] bg-warning p-4 text-warning-foreground">
          We couldn’t confirm the result. Your order is held for review and you
          won’t be charged again.
        </p>
      ) : failed ? (
        <p className="rounded-[var(--ui-radius-control)] bg-danger p-4 text-danger-foreground">
          This web address couldn’t be bought
          {data?.paymentStatus === "REFUNDED"
            ? " and your payment was refunded."
            : data?.paymentStatus === "REFUND_PENDING"
              ? ". Your refund is on the way."
              : ". Our team will look at it."}
        </p>
      ) : (
        <p className="text-muted-foreground">
          {complete
            ? "Done. It can take a few minutes before it opens your store."
            : "You can close this. It carries on without you."}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {stopped ? (
          <Button
            variant="outline"
            onClick={() => {
              setSince(Date.now())
              void order.refetch()
            }}
          >
            Check again
          </Button>
        ) : null}
        <Button
          variant={complete ? "default" : "outline"}
          onClick={() => setParams(null)}
        >
          {complete ? "See your web addresses" : "Close"}
        </Button>
      </div>
    </div>
  )
}
