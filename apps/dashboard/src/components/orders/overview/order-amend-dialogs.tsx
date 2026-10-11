"use client"

import { useTRPC } from "@/trpc/client"
import { Button, Input, MoneyInput, Textarea } from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRef, useState } from "react"
import {
  OrderCustomerPicker,
  type OrderCustomerSelection,
} from "../order-customer-picker"
import { orderMoney } from "../order-draft"
import {
  DialogField,
  MutationError,
  OrderDialog,
  ReasonField,
  ReviewEffects,
} from "./order-dialog-frame"
import {
  type OverviewOrder,
  formatOrderDateTime,
  formatQuantity,
  lineDetail,
  lineTitle,
} from "./order-overview-model"

type DialogProps = {
  order: OverviewOrder
  onClose: () => void
  onDone: () => Promise<void>
}

const NO_MONEY = "No money or stock moves."

function useOperationId(prefix: string) {
  return useRef(`${prefix}-${crypto.randomUUID()}`).current
}

type MetadataReview = {
  before: {
    customerName: string | null
    deliveryDueAt: string | null
    notes: string | null
  }
  after: {
    customerName: string | null
    deliveryDueAt: string | null
    notes: string | null
  }
  changedFields: string[]
}

function metadataEffects(review: MetadataReview) {
  const { before, after, changedFields } = review
  const effects: string[] = []
  if (changedFields.some((field) => field.startsWith("customer")))
    effects.push(
      `Customer: ${before.customerName ?? "Walk-in"} → ${after.customerName ?? "Walk-in"}`,
    )
  if (changedFields.includes("deliveryDueAt"))
    effects.push(
      `Delivery: ${before.deliveryDueAt ? formatOrderDateTime(before.deliveryDueAt) : "None"} → ${after.deliveryDueAt ? formatOrderDateTime(after.deliveryDueAt) : "None"}`,
    )
  if (changedFields.includes("notes"))
    effects.push(
      `Note: ${before.notes ? `“${before.notes}”` : "None"} → ${after.notes ? `“${after.notes}”` : "None"}`,
    )
  return [...effects, NO_MONEY]
}

/** Review → effects → reason → confirm for customer, delivery and note. */
function MetadataConfirm({
  order,
  patch,
  reasonChips,
  confirmLabel,
  onBack,
  onClose,
  onDone,
}: DialogProps & {
  patch: {
    customerId?: string | null
    deliveryDueAt?: string | null
    notes?: string | null
  }
  reasonChips: string[]
  confirmLabel: string
  onBack: () => void
}) {
  const trpc = useTRPC()
  const [reason, setReason] = useState("")
  const clientOperationId = useOperationId("order-details")
  const review = useQuery(
    trpc.orders.metadataReview.queryOptions(
      { orderId: order.id, patch },
      { retry: false, staleTime: 0 },
    ),
  )
  const amend = useMutation(
    trpc.orders.amendMetadata.mutationOptions({
      onSuccess: async () => {
        await onDone()
        onClose()
      },
      onError: () => void review.refetch(),
    }),
  )
  const data = review.data
  return (
    <>
      <ReviewEffects
        loading={review.isPending}
        error={review.isError ? review.error.message : null}
        effects={data ? metadataEffects(data) : []}
        blockers={
          data && !data.eligible ? data.blockers.map((row) => row.reason) : []
        }
        onRetry={() => void review.refetch()}
      />
      <ReasonField
        value={reason}
        onChange={setReason}
        chips={reasonChips}
        disabled={amend.isPending}
      />
      <MutationError message={amend.isError ? amend.error.message : null} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={amend.isPending}
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          type="button"
          disabled={
            !data?.eligible ||
            !reason.trim() ||
            amend.isPending ||
            review.isFetching
          }
          onClick={() =>
            data &&
            amend.mutate({
              orderId: order.id,
              patch,
              reason: reason.trim(),
              clientOperationId,
              expectedReviewDigest: data.reviewDigest,
            })
          }
        >
          {amend.isPending ? "Saving…" : confirmLabel}
        </Button>
      </div>
    </>
  )
}

export function CustomerChangeDialog({
  order,
  storeId,
  onClose,
  onDone,
}: DialogProps & { storeId: string }) {
  const [selected, setSelected] = useState<OrderCustomerSelection | null>(null)
  const [walkIn, setWalkIn] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const customerId = walkIn ? null : (selected?.id ?? undefined)
  return (
    <OrderDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Change customer"
      description={`Who ${order.orderNumber} is for. Currently ${order.customerName || "a walk-in customer"}.`}
    >
      {reviewing && customerId !== undefined ? (
        <MetadataConfirm
          order={order}
          patch={{ customerId }}
          reasonChips={[
            "Wrong customer picked",
            "Customer asked",
            "Was a walk-in",
          ]}
          confirmLabel="Change customer"
          onBack={() => setReviewing(false)}
          onClose={onClose}
          onDone={onDone}
        />
      ) : (
        <>
          {walkIn ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
              <span>Walk-in customer (no saved customer)</span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setWalkIn(false)}
              >
                Pick a customer
              </Button>
            </div>
          ) : (
            <OrderCustomerPicker
              selected={selected}
              customerDirectory
              storeId={storeId}
              onSelect={(customer) => {
                setHint(
                  customer && !customer.id
                    ? "Pick a saved customer from the list."
                    : null,
                )
                setSelected(customer?.id ? customer : null)
              }}
              onCreate={() =>
                setHint(
                  "Add new customers under Customers first, then pick them here.",
                )
              }
            />
          )}
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
          {order.customerId && !walkIn ? (
            <Button
              type="button"
              variant="link"
              className="h-auto w-fit p-0 text-sm"
              onClick={() => {
                setSelected(null)
                setWalkIn(true)
              }}
            >
              Make it a walk-in sale instead
            </Button>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={customerId === undefined}
              onClick={() => setReviewing(true)}
            >
              Review change
            </Button>
          </div>
        </>
      )}
    </OrderDialog>
  )
}

/** ISO instant → value for a local datetime-local input. */
function localInput(value: Date | string | null) {
  if (!value) return ""
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

export function DetailsChangeDialog({ order, onClose, onDone }: DialogProps) {
  const initialDue = localInput(order.deliveryDueAt)
  const [due, setDue] = useState(initialDue)
  const [notes, setNotes] = useState(order.notes ?? "")
  const [reviewing, setReviewing] = useState(false)
  const patch: { deliveryDueAt?: string | null; notes?: string | null } = {}
  if (due !== initialDue)
    patch.deliveryDueAt = due ? new Date(due).toISOString() : null
  if (notes.trim() !== (order.notes ?? "").trim())
    patch.notes = notes.trim() || null
  const changed = Object.keys(patch).length > 0
  return (
    <OrderDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Delivery and note"
      description="When the order is due and the note your team sees on it."
    >
      {reviewing && changed ? (
        <MetadataConfirm
          order={order}
          patch={patch}
          reasonChips={[
            "Customer asked",
            "Delivery rescheduled",
            "Added instructions",
          ]}
          confirmLabel="Save changes"
          onBack={() => setReviewing(false)}
          onClose={onClose}
          onDone={onDone}
        />
      ) : (
        <>
          <DialogField
            label="Delivery due"
            htmlFor="order-delivery-due"
            hint="Leave empty if it has no delivery time."
          >
            <Input
              id="order-delivery-due"
              type="datetime-local"
              value={due}
              onChange={(event) => setDue(event.target.value)}
            />
          </DialogField>
          <DialogField label="Note" htmlFor="order-sale-note">
            <Textarea
              id="order-sale-note"
              maxLength={2000}
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </DialogField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!changed}
              onClick={() => setReviewing(true)}
            >
              Review change
            </Button>
          </div>
        </>
      )}
    </OrderDialog>
  )
}

type LineDraft = { quantity: string; price: string }

export function ItemsChangeDialog({
  order,
  onClose,
  onDone,
  onOpenOrder,
}: DialogProps & { onOpenOrder: (orderId: string) => void }) {
  const trpc = useTRPC()
  const money = (value: number | null) =>
    value === null ? "typed price" : orderMoney(value, order.currencyCode)
  const initial = Object.fromEntries(
    order.lines.map((line) => [
      line.id,
      {
        quantity: formatQuantity(line.quantity),
        price: minorToMajorInput(line.unitPriceMinor ?? line.totalMinor),
      },
    ]),
  ) as Record<string, LineDraft>
  const [drafts, setDrafts] = useState(initial)
  const [reviewing, setReviewing] = useState(false)
  const [reason, setReason] = useState("")
  const clientOperationId = useOperationId("order-replace")
  const changes = order.lines.flatMap((line) => {
    const draft = drafts[line.id]
    if (!draft) return []
    const change: {
      orderLineId: string
      quantity?: string
      unitPriceMinor?: number
      enteredTotalMinor?: number
    } = { orderLineId: line.id }
    if (Number(draft.quantity) !== Number(line.quantity))
      change.quantity = draft.quantity.trim()
    const price = majorToMinor(draft.price)
    if (line.unitPriceMinor !== null) {
      if (price !== null && price !== line.unitPriceMinor)
        change.unitPriceMinor = price
    } else if (price !== null && price !== line.totalMinor)
      change.enteredTotalMinor = price
    return Object.keys(change).length > 1 ? [change] : []
  })
  const invalid = order.lines.some((line) => {
    const draft = drafts[line.id]
    return (
      !draft ||
      !/^\d{1,12}(\.\d{1,6})?$/.test(draft.quantity.trim()) ||
      Number(draft.quantity) <= 0 ||
      majorToMinor(draft.price) === null
    )
  })
  const review = useQuery(
    trpc.orders.replacementReview.queryOptions(
      { orderId: order.id, changes },
      { enabled: reviewing && changes.length > 0, retry: false, staleTime: 0 },
    ),
  )
  const replace = useMutation(
    trpc.orders.replace.mutationOptions({
      onSuccess: async (result) => {
        await onDone()
        onClose()
        if (result.replacementOrderId) onOpenOrder(result.replacementOrderId)
      },
      onError: () => void review.refetch(),
    }),
  )
  const data = review.data
  const effects = data
    ? [
        ...data.terms.lines.flatMap((row) => {
          const line = order.lines.find((item) => item.id === row.orderLineId)
          if (
            row.quantity === row.originalQuantity &&
            row.totalMinor === row.originalTotalMinor
          )
            return []
          return [
            `${line ? lineTitle(line) : "Item"}: ${formatQuantity(row.originalQuantity)} × ${money(row.originalUnitPriceMinor)} → ${formatQuantity(row.quantity)} × ${money(row.unitPriceMinor)}`,
          ]
        }),
        `Total: ${orderMoney(data.terms.originalTotalMinor, order.currencyCode)} → ${orderMoney(data.terms.totalMinor, order.currencyCode)}`,
        `A new order number is created and ${order.orderNumber} closes as replaced.`,
      ]
    : []
  const blockers = data
    ? [
        ...data.blockers
          .filter((row) => row.code !== "INSUFFICIENT_STOCK")
          .map((row) => row.reason),
        ...data.reservationChanges
          .filter((row) => !row.sufficient)
          .map(
            (row) =>
              `Not enough stock: needs ${formatQuantity(row.replacementQuantity)} ${row.unitName}, ${formatQuantity(row.availableAfterRelease)} available.`,
          ),
      ]
    : []
  return (
    <OrderDialog
      open
      onOpenChange={(open) => !open && onClose()}
      busy={replace.isPending}
      title="Items and prices"
      description={
        <>
          Change quantities or prices. Saving creates a{" "}
          <strong className="font-medium text-foreground">
            new order number
          </strong>{" "}
          with these items and closes {order.orderNumber} as replaced. Adding or
          removing items isn’t available yet.
        </>
      }
    >
      {reviewing ? (
        <>
          <ReviewEffects
            loading={review.isPending}
            error={review.isError ? review.error.message : null}
            effects={effects}
            blockers={data && !data.eligible ? blockers : []}
            onRetry={() => void review.refetch()}
          />
          <ReasonField
            value={reason}
            onChange={setReason}
            chips={[
              "Customer changed quantity",
              "Agreed a new price",
              "Entered by mistake",
            ]}
            disabled={replace.isPending}
          />
          <MutationError
            message={replace.isError ? replace.error.message : null}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={replace.isPending}
              onClick={() => setReviewing(false)}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={
                !data?.eligible ||
                !reason.trim() ||
                replace.isPending ||
                review.isFetching
              }
              onClick={() =>
                data &&
                replace.mutate({
                  orderId: order.id,
                  changes,
                  reason: reason.trim(),
                  clientOperationId,
                  expectedReviewDigest: data.reviewDigest,
                })
              }
            >
              {replace.isPending ? "Creating…" : "Create replacement order"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <ul className="grid gap-3">
            {order.lines.map((line) => {
              const draft = drafts[line.id] ?? { quantity: "", price: "" }
              const update = (value: Partial<LineDraft>) =>
                setDrafts((current) => ({
                  ...current,
                  [line.id]: { ...draft, ...value },
                }))
              return (
                <li
                  key={line.id}
                  className="grid gap-2 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{lineTitle(line)}</p>
                    <p className="text-xs text-muted-foreground">
                      {lineDetail(line)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <DialogField
                      label="Quantity"
                      htmlFor={`replace-qty-${line.id}`}
                    >
                      <Input
                        id={`replace-qty-${line.id}`}
                        inputMode="decimal"
                        value={draft.quantity}
                        onChange={(event) =>
                          update({ quantity: event.target.value })
                        }
                      />
                    </DialogField>
                    <DialogField
                      label={
                        line.unitPriceMinor === null
                          ? "Line total"
                          : "Price each"
                      }
                      htmlFor={`replace-price-${line.id}`}
                    >
                      <MoneyInput
                        id={`replace-price-${line.id}`}
                        currencyCode={order.currencyCode}
                        value={draft.price}
                        onChange={(event) =>
                          update({ price: event.target.value })
                        }
                      />
                    </DialogField>
                  </div>
                </li>
              )
            })}
          </ul>
          {invalid ? (
            <p className="text-xs text-muted-foreground">
              Each item needs a quantity above 0 and a price.
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={invalid || changes.length === 0}
              onClick={() => setReviewing(true)}
            >
              Review change
            </Button>
          </div>
        </>
      )}
    </OrderDialog>
  )
}

export function CancelOrderDialog({ order, onClose, onDone }: DialogProps) {
  const trpc = useTRPC()
  const [reason, setReason] = useState("")
  const clientOperationId = useOperationId("order-cancel")
  const review = useQuery(
    trpc.orders.cancellationReview.queryOptions(
      { orderId: order.id },
      { retry: false, staleTime: 0 },
    ),
  )
  const cancel = useMutation(
    trpc.orders.cancel.mutationOptions({
      onSuccess: async () => {
        await onDone()
        onClose()
      },
      onError: () => void review.refetch(),
    }),
  )
  const data = review.data
  const effects = data
    ? [
        `${order.orderNumber} closes as cancelled.`,
        ...(data.releases.length
          ? data.releases.map((release) => {
              const line = order.lines.find(
                (item) => item.id === release.orderLineId,
              )
              return `Stock released: ${formatQuantity(release.quantity)} ${release.unitName}${line ? ` · ${lineTitle(line)}` : ""}`
            })
          : ["No reserved stock to release."]),
        "No money moves.",
      ]
    : []
  return (
    <OrderDialog
      open
      onOpenChange={(open) => !open && onClose()}
      busy={cancel.isPending}
      title={`Cancel ${order.orderNumber}?`}
      description="Reserved stock goes back to the shelf. This can’t be undone."
    >
      <ReviewEffects
        loading={review.isPending}
        error={review.isError ? review.error.message : null}
        effects={effects}
        blockers={
          data && !data.eligible ? data.blockers.map((row) => row.reason) : []
        }
        onRetry={() => void review.refetch()}
      />
      <ReasonField
        value={reason}
        onChange={setReason}
        chips={[
          "Customer cancelled",
          "Out of stock",
          "Duplicate order",
          "Entered by mistake",
        ]}
        disabled={cancel.isPending}
      />
      <MutationError message={cancel.isError ? cancel.error.message : null} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={cancel.isPending}
          onClick={onClose}
        >
          Keep order
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={
            !data?.eligible ||
            !reason.trim() ||
            cancel.isPending ||
            review.isFetching
          }
          onClick={() =>
            data &&
            cancel.mutate({
              orderId: order.id,
              reason: reason.trim(),
              clientOperationId,
              expectedReviewDigest: data.reviewDigest,
            })
          }
        >
          {cancel.isPending ? "Cancelling…" : "Cancel order"}
        </Button>
      </div>
    </OrderDialog>
  )
}
