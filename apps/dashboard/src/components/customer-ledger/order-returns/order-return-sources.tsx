"use client"
import { errorCode } from "@/components/business-banking/business-banking-model"
import { OrderDialog } from "@/components/orders/overview/order-dialog-frame"
import type { OverviewOrder } from "@/components/orders/overview/order-overview-model"
import { useTRPC } from "@/trpc/client"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { OrderReturnForm } from "./order-return-form"
import {
  type AvailableOrderReturn,
  type OrderReturnRoute,
  orderReturnIdentity,
  orderReturnRoute,
} from "./order-return-model"

/**
 * The Order's refund entry (Banking02 v18 "Review original payment
 * sources"). An Order paid partly with held customer credit restores that
 * credit to its exact original source and returns only collected money.
 * Everything else, and every staff request, keeps the existing refund.
 */
export function OrderReturnSources({
  order,
  ordinary,
  canReturn,
  onOpenReturn,
  onClose,
  onDone,
}: {
  order: OverviewOrder
  /** The existing refund dialog, unchanged. */
  ordinary: ReactNode
  canReturn: boolean
  onOpenReturn: () => void
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const trpc = useTRPC()
  const context = useQuery(
    trpc.tenant.current.queryOptions(undefined, { retry: false }),
  )
  const role = normalizeRole(context.data?.membership.role)
  // Unknown access is not permission; a failed read keeps the existing refund.
  const allowed = context.isSuccess
    ? Boolean(role && canManageTenant(role))
    : context.isError
      ? false
      : null
  if (allowed === false) return ordinary
  if (allowed !== true || !context.data)
    return (
      <OrderDialog
        open
        onOpenChange={(open) => !open && onClose()}
        title="Refund"
      >
        <output aria-busy="true">Checking Finance access…</output>
      </OrderDialog>
    )
  return (
    <ScopedSources
      key={`${context.data.actorUserId}:${context.data.tenant.id}:${order.id}`}
      actorUserId={context.data.actorUserId}
      tenantId={context.data.tenant.id}
      {...{ order, ordinary, canReturn, onOpenReturn, onClose, onDone }}
    />
  )
}

function ScopedSources({
  actorUserId,
  tenantId,
  order,
  ordinary,
  canReturn,
  onOpenReturn,
  onClose,
  onDone,
}: Parameters<typeof OrderReturnSources>[0] & {
  actorUserId: string
  tenantId: string
}) {
  const trpc = useTRPC()
  const [ordinaryChosen, setOrdinaryChosen] = useState(false)
  const [pinned, setPinned] = useState<AvailableOrderReturn | null>(null)
  const review = useQuery(
    trpc.customerLedger.orderReturnReview.queryOptions(
      { orderId: order.id },
      {
        enabled: !pinned,
        retry: false,
        staleTime: 0,
        refetchOnMount: "always",
      },
    ),
  )
  const route: OrderReturnRoute = pinned
    ? { kind: "sources", review: pinned }
    : orderReturnRoute({
        ask: false,
        allowed: true,
        status: review.status,
        forbidden: errorCode(review.error) === "FORBIDDEN",
        fetchedAfterMount: review.isFetchedAfterMount,
        data: review.data,
      })
  if (route.kind === "ordinary" || ordinaryChosen) return ordinary
  if (route.kind === "sources")
    return (
      <OrderReturnForm
        // A new revision, source or cap starts a fresh review and confirmation.
        key={orderReturnIdentity(route.review)}
        review={route.review}
        order={order}
        actorUserId={actorUserId}
        tenantId={tenantId}
        canReturn={canReturn}
        onOpenReturn={onOpenReturn}
        onOrdinary={() => setOrdinaryChosen(true)}
        onPin={() => setPinned(route.review)}
        onRefresh={() => {
          setPinned(null)
          void review.refetch()
        }}
        onClose={onClose}
        onDone={onDone}
      />
    )
  return (
    <OrderDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Refund"
      description="Review original payment sources"
    >
      {route.kind === "error" ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>
            The Order’s payment sources couldn’t load.{" "}
            {review.error?.message ?? ""}
          </AlertDescription>
          <Button
            variant="outline"
            disabled={review.isFetching}
            onClick={() => void review.refetch()}
          >
            Try again
          </Button>
        </Alert>
      ) : route.kind === "unavailable" ? (
        <Alert appearance="dashboard">
          <AlertDescription>{route.message}</AlertDescription>
        </Alert>
      ) : (
        <output className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
          Checking how this Order was paid…
        </output>
      )}
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Back
        </Button>
      </div>
    </OrderDialog>
  )
}
