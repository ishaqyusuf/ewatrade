"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useOrderParams } from "@/hooks/use-order-params"
import { useReceiptParams } from "@/hooks/use-receipt-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useRef } from "react"
import { orderMoney } from "./order-draft"

export function OrderDetails({
  orderId,
  storeId,
}: { orderId: string; storeId: string }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const router = useRouter()
  const { setParams } = useOrderParams()
  const { setParams: setReceipt } = useReceiptParams()
  const command = useRef(crypto.randomUUID())
  const { data: order } = useSuspenseQuery(
    trpc.orders.get.queryOptions({ orderId }, { retry: false }),
  )
  const fulfillment = useMutation(
    trpc.orders.fulfillProducts.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          client.invalidateQueries({
            refetchType: "none",
            queryKey: trpc.orders.pathKey(),
          }),
          client.invalidateQueries({
            refetchType: "none",
            queryKey: trpc.catalog.pathKey(),
          }),
          client.invalidateQueries({
            refetchType: "none",
            queryKey: trpc.inventory.pathKey(),
          }),
          client.invalidateQueries({
            refetchType: "none",
            queryKey: trpc.customerLedger.pathKey(),
          }),
          client.invalidateQueries({
            refetchType: "none",
            queryKey: trpc.finance.pathKey(),
          }),
        ])
        router.refresh()
      },
    }),
  )
  if (order.storeId !== storeId)
    return (
      <FormFeedback appearance="dashboard">
        Select this order’s Store to view its details.
      </FormFeedback>
    )
  const canFulfill =
    !["CANCELLED", "REFUNDED", "COMPLETED"].includes(
      fulfillment.data?.status ?? order.status,
    ) &&
    order.lines.some(
      (line) =>
        line.kind === "product" && line.reservation?.status === "ACTIVE",
    )
  return (
    <div className="grid gap-5">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{order.orderNumber}</h3>
        <p className="text-sm">
          {order.customerName || "Walk-in customer"}
          {order.customerPhone ? ` · ${order.customerPhone}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {(fulfillment.data?.status ?? order.status)
            .toLowerCase()
            .replaceAll("_", " ")}
        </p>
      </div>
      {order.lines.map((line) => (
        <div key={line.id} className="grid gap-2 border border-border p-4">
          <h4 className="font-medium">
            {line.snapshot?.catalogItemName ?? "Item"}
          </h4>
          <p className="text-sm">
            {line.snapshot?.variantName} · {line.quantity}{" "}
            {line.snapshot?.inventoryUnitName ?? ""}
          </p>
          {line.unitPriceMinor === null ? (
            <p className="text-sm text-muted-foreground">
              Price entered during order
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {orderMoney(line.unitPriceMinor, order.currencyCode)} per{" "}
              {line.snapshot?.inventoryUnitName ?? "unit"}
            </p>
          )}
          <p className="font-semibold">
            Item total: {orderMoney(line.totalMinor, order.currencyCode)}
          </p>
          {line.note ? (
            <p className="whitespace-pre-wrap break-words text-sm">
              {line.note}
            </p>
          ) : null}
        </div>
      ))}
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt>Total</dt>
        <dd className="text-right font-semibold">
          {orderMoney(order.totalMinor, order.currencyCode)}
        </dd>
        <dt>Paid</dt>
        <dd className="text-right">
          {orderMoney(order.amountPaidMinor, order.currencyCode)}
        </dd>
        <dt>Remaining</dt>
        <dd className="text-right">
          {orderMoney(order.balanceDueMinor, order.currencyCode)}
        </dd>
      </dl>
      {fulfillment.isError ? (
        <FormFeedback appearance="dashboard">
          {fulfillment.error.message}
        </FormFeedback>
      ) : null}
      {fulfillment.isSuccess ? (
        <output className="text-sm">Product fulfillment recorded.</output>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canFulfill ? (
          <Button
            disabled={fulfillment.isPending}
            onClick={() =>
              fulfillment.mutate({
                clientOperationId: command.current,
                orderId,
                schemaVersion: 1,
              })
            }
          >
            {fulfillment.isPending
              ? "Recording fulfillment…"
              : "Fulfill products"}
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={fulfillment.isPending}
          onClick={async () => {
            await setParams({ orderSheet: null, orderId: null })
            await setReceipt({ receiptIds: [orderId] })
          }}
        >
          Receipt
        </Button>
      </div>
    </div>
  )
}
