"use client"

import { useDomainParams } from "@/hooks/use-domain-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

export function DomainProgress() {
  const trpc = useTRPC()
  const { domainOrderId, setParams } = useDomainParams()
  const order = useQuery({
    ...trpc.domains.order.queryOptions({
      orderId: domainOrderId ?? "",
    }),
    enabled: Boolean(domainOrderId),
    refetchInterval: (query) => {
      const current = query.state.data
      if (
        current?.registrationStatus === "REGISTERED" ||
        current?.paymentStatus === "REFUNDED"
      ) {
        return false
      }
      return current?.registrationStatus === "UNCERTAIN" ? 30_000 : 5_000
    },
  })

  if (!domainOrderId) {
    return <p className="text-sm text-muted-foreground">Order not selected.</p>
  }

  const data = order.data
  const complete = data?.registrationStatus === "REGISTERED"
  const failed = data?.registrationStatus === "FAILED"
  const uncertain = data?.registrationStatus === "UNCERTAIN"

  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-border p-5">
        <p className="text-sm text-muted-foreground">Domain</p>
        <p className="mt-1 text-lg font-semibold">
          {data?.normalizedDomain ?? "Loading…"}
        </p>
        <div className="mt-5 grid gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <span>Payment</span>
            <span className="font-medium">
              {data?.paymentStatus ?? "Checking"}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Registration</span>
            <span className="font-medium">
              {data?.registrationStatus ?? "Waiting"}
            </span>
          </div>
        </div>
      </div>
      {uncertain ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          We could not confirm the registrar result. Your order is held for
          review and will not be charged again automatically.
        </p>
      ) : failed ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Registration failed
          {data?.paymentStatus === "REFUNDED"
            ? " and your payment was refunded."
            : data?.paymentStatus === "REFUND_PENDING"
              ? ". Your refund is being processed."
              : ". Our team will review the order."}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {complete
            ? "Registration is complete. DNS and SSL verification may continue for a few minutes."
            : "You can close this panel. Setup continues safely in the background."}
        </p>
      )}
      <Button variant="outline" onClick={() => setParams(null)}>
        {complete ? "View domains" : "Close"}
      </Button>
    </div>
  )
}
