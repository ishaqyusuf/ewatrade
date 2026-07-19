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
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useMemo, useState } from "react"

type StoreSummary = { currencyCode: string; id: string; name: string }
type IntakeLine = { offeringId: string; quantity: string }

const fieldClass =
  "h-10 w-full scroll-mt-24 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
const areaClass = `${fieldClass} min-h-24 py-2`

export function ServiceIntakeForm({ store }: { store: StoreSummary }) {
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
  const [lines, setLines] = useState<IntakeLine[]>([])
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [requestedAt, setRequestedAt] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [instructions, setInstructions] = useState("")
  const [conditionNote, setConditionNote] = useState("")
  const [urgent, setUrgent] = useState(false)
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
        ])
        setParams(null)
      },
    }),
  )

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
      lines,
      priority: urgent ? "urgent" : "normal",
      requestedAt: requestedAt ? new Date(requestedAt) : undefined,
      schemaVersion: 1,
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
        </div>
      ) : null}
      <Button
        disabled={intakeMutation.isPending || lines.length === 0}
        onClick={submit}
      >
        {intakeMutation.isPending ? "Creating…" : "Create service order"}
      </Button>
    </div>
  )
}
