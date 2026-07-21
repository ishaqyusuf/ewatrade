"use client"

import {
  flattenServiceOfferings,
  formatMoney,
} from "@/components/service-work/service-utils"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

type StoreSummary = { currencyCode: string; id: string; name: string }
type IntakeLine = { offeringId: string; quantity: string }

const fieldClass =
  "h-10 w-full scroll-mt-24 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
const areaClass = `${fieldClass} min-h-24 py-2`

export function ServiceIntakeForm({
  canManage,
  store,
}: {
  canManage: boolean
  store: StoreSummary
}) {
  const router = useRouter()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setParams } = useServiceWorkParams()
  const { data: items } = useSuspenseQuery(
    trpc.catalog.listItems.queryOptions({ kind: "service" }, { retry: false }),
  )
  const offerings = useMemo(
    () =>
      flattenServiceOfferings(items, store.id).filter(
        (offering) => offering.pricingPolicy === "fixed",
      ),
    [items, store.id],
  )
  const settingsQuery = useSuspenseQuery(
    trpc.services.getSettings.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )
  const assigneesQuery = useQuery(
    trpc.services.assignees.queryOptions(undefined, {
      enabled: canManage,
      retry: false,
    }),
  )
  const [lines, setLines] = useState<IntakeLine[]>([])
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [requestedAt, setRequestedAt] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [instructions, setInstructions] = useState("")
  const [conditionNote, setConditionNote] = useState("")
  const [urgent, setUrgent] = useState(false)
  const [express, setExpress] = useState(false)
  const [amountPaid, setAmountPaid] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<
    "bank_transfer" | "card" | "cash" | "other" | "pos"
  >("cash")
  const [paymentReference, setPaymentReference] = useState("")
  const [notificationChannel, setNotificationChannel] = useState<
    "" | "sms" | "whatsapp"
  >(settingsQuery.data.defaultNotificationChannel ?? "")
  const [assigneeId, setAssigneeId] = useState("")
  const [showDetails, setShowDetails] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intakeMutation = useMutation(
    trpc.services.createAndConfirmIntake.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.services.queue.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.orders.list.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.tenant.featureAvailability.queryKey(),
          }),
        ])
        setParams(null)
        router.refresh()
      },
    }),
  )
  const subtotalMinor = lines.reduce((total, line) => {
    const offering = offerings.find((entry) => entry.id === line.offeringId)
    const quantity = Number(line.quantity)
    return offering &&
      offering.fixedPriceMinor !== null &&
      Number.isFinite(quantity)
      ? total + offering.fixedPriceMinor * quantity
      : total
  }, 0)
  const serviceChargeMinor =
    express && settingsQuery.data.expressEnabled
      ? settingsQuery.data.expressSurchargeType === "fixed"
        ? settingsQuery.data.expressSurchargeValue
        : Math.round(
            (subtotalMinor * settingsQuery.data.expressSurchargeValue) / 10_000,
          )
      : 0
  const totalMinor = subtotalMinor + serviceChargeMinor

  function submit() {
    setError(null)
    if (
      lines.length === 0 ||
      lines.some((line) => !line.offeringId || !line.quantity.trim())
    ) {
      setError("Select at least one Service and enter its quantity.")
      return
    }
    intakeMutation.mutate({
      clientIntakeId: crypto.randomUUID(),
      conditionNote: conditionNote.trim() || undefined,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      dueCommitmentAt: dueAt ? new Date(dueAt) : undefined,
      instructions: instructions.trim() || undefined,
      initialPaymentMethod:
        amountPaid.trim() && Number(amountPaid) > 0 ? paymentMethod : undefined,
      initialPaymentMinor: amountPaid.trim()
        ? Math.round(Number(amountPaid) * 100)
        : 0,
      initialPaymentReference: paymentReference.trim() || undefined,
      lines,
      notificationChannel: notificationChannel || undefined,
      priority: urgent ? "urgent" : "normal",
      requestedAssigneeId: assigneeId || undefined,
      requestedAt: requestedAt ? new Date(requestedAt) : undefined,
      schemaVersion: 1,
      serviceLevel: express ? "express" : "standard",
      storeId: store.id,
    })
  }

  return (
    <div className="grid gap-5">
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Items</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={offerings.length === 0}
            onClick={() =>
              setLines((current) => [
                ...current,
                { offeringId: offerings[0]?.id ?? "", quantity: "1" },
              ])
            }
          >
            Add item
          </Button>
        </div>
        {lines.map((line, index) => (
          <div
            key={`${index}-${line.offeringId}`}
            className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_88px_auto]"
          >
            <select
              aria-label={`Service item ${index + 1}`}
              className={fieldClass}
              value={line.offeringId}
              onChange={(event) =>
                setLines((current) =>
                  current.map((entry, entryIndex) =>
                    entryIndex === index
                      ? { ...entry, offeringId: event.target.value }
                      : entry,
                  ),
                )
              }
            >
              <option value="">Choose Service</option>
              {offerings.map((offering) => (
                <option key={offering.id} value={offering.id}>
                  {offering.displayName} ·{" "}
                  {formatMoney(offering.fixedPriceMinor, offering.currencyCode)}
                </option>
              ))}
            </select>
            <input
              aria-label={`Quantity ${index + 1}`}
              inputMode="decimal"
              className={fieldClass}
              value={line.quantity}
              onChange={(event) =>
                setLines((current) =>
                  current.map((entry, entryIndex) =>
                    entryIndex === index
                      ? { ...entry, quantity: event.target.value }
                      : entry,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setLines((current) =>
                  current.filter((_, entryIndex) => entryIndex !== index),
                )
              }
            >
              Remove
            </Button>
          </div>
        ))}
        {lines.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-4 text-sm text-muted-foreground">
            Add fixed-price Services. Quote-required work starts from a Request.
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">
            Customer name{" "}
            <span className="font-normal text-muted-foreground">Optional</span>
          </span>
          <input
            className={fieldClass}
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">
            Phone{" "}
            <span className="font-normal text-muted-foreground">Optional</span>
          </span>
          <input
            className={fieldClass}
            inputMode="tel"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
          />
        </label>
      </div>
      {settingsQuery.data.expressEnabled ? (
        <label className="flex items-center justify-between gap-3 border-y border-border py-4 text-sm">
          <span>
            <span className="block font-medium">
              {settingsQuery.data.expressLabel}
            </span>
            <span className="text-muted-foreground">
              {settingsQuery.data.expressSurchargeType === "fixed"
                ? formatMoney(
                    settingsQuery.data.expressSurchargeValue,
                    store.currencyCode,
                  )
                : `${settingsQuery.data.expressSurchargeValue / 100}% surcharge`}
            </span>
          </span>
          <input
            type="checkbox"
            checked={express}
            onChange={(event) => setExpress(event.target.checked)}
          />
        </label>
      ) : null}
      <section className="grid gap-3 border-b border-border pb-5">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatMoney(subtotalMinor, store.currencyCode)}</span>
        </div>
        {serviceChargeMinor > 0 ? (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Express</span>
            <span>{formatMoney(serviceChargeMinor, store.currencyCode)}</span>
          </div>
        ) : null}
        <div className="flex justify-between font-medium">
          <span>Total</span>
          <span>{formatMoney(totalMinor, store.currencyCode)}</span>
        </div>
      </section>
      <button
        type="button"
        className="w-fit text-left text-sm font-medium text-primary"
        onClick={() => setShowDetails((value) => !value)}
      >
        {showDetails ? "Hide details" : "Add timing, instructions, or priority"}
      </button>
      {showDetails ? (
        <div className="grid gap-4 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Customer requested</span>
              <input
                type="datetime-local"
                className={fieldClass}
                value={requestedAt}
                onChange={(event) => setRequestedAt(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Promised delivery</span>
              <input
                type="datetime-local"
                className={fieldClass}
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Instructions</span>
            <textarea
              className={areaClass}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Condition at intake</span>
            <textarea
              className={areaClass}
              value={conditionNote}
              onChange={(event) => setConditionNote(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={urgent}
              onChange={(event) => setUrgent(event.target.checked)}
            />
            Mark urgent
          </label>
          {canManage ? (
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Assign to</span>
              <select
                className={fieldClass}
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                <option value="">Leave unassigned</option>
                {assigneesQuery.data?.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      <section className="grid gap-4 border-t border-border pt-5">
        <div>
          <h3 className="font-medium">Payment</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Leave the amount empty to collect the full balance on delivery.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">
              Amount paid now ({store.currencyCode})
            </span>
            <input
              className={fieldClass}
              inputMode="decimal"
              value={amountPaid}
              onChange={(event) => setAmountPaid(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Method</span>
            <select
              className={fieldClass}
              value={paymentMethod}
              onChange={(event) =>
                setPaymentMethod(event.target.value as typeof paymentMethod)
              }
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="pos">POS</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <input
          className={fieldClass}
          placeholder="Payment reference (optional)"
          value={paymentReference}
          onChange={(event) => setPaymentReference(event.target.value)}
        />
      </section>
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Customer updates</span>
        <select
          className={fieldClass}
          value={notificationChannel}
          onChange={(event) =>
            setNotificationChannel(
              event.target.value as typeof notificationChannel,
            )
          }
        >
          <option value="">No automatic updates</option>
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </label>
      <Button
        disabled={intakeMutation.isPending || lines.length === 0}
        onClick={submit}
      >
        {intakeMutation.isPending ? "Creating…" : "Create service order"}
      </Button>
    </div>
  )
}
