"use client"

import { useOrderParams } from "@/hooks/use-order-params"
import { setServiceIntakeDraft } from "@/hooks/use-service-intake-draft"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import type { ServiceJobDraft } from "@ewatrade/assistant/general/contracts"
import { Button } from "@ewatrade/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { OpenMissingCatalogItem } from "./open-missing-catalog-item"

export function GeneralServiceJobCard({
  draft,
  answerId,
  messageId,
}: { draft: ServiceJobDraft; answerId?: string; messageId?: string }) {
  const client = useTRPCClient()
  const trpc = useTRPC()
  const cache = useQueryClient()
  const { setParams: setOrderParams } = useOrderParams()
  const sourceAnswerId = answerId ?? draft.sourceAnswerId
  const sourceMessageId = messageId ?? draft.sourceMessageId
  const receipt = useQuery(
    trpc.services.assistantJobCard.queryOptions(
      {
        sourceAnswerId: sourceAnswerId ?? "",
        sourceMessageId: sourceMessageId ?? "",
        storeId: draft.origin.storeId,
      },
      { enabled: Boolean(sourceAnswerId), retry: 1, refetchOnMount: "always" },
    ),
  )
  const created = receipt.data ?? draft.created
  const checking = Boolean(sourceAnswerId) && receipt.isPending
  const displayLines = created?.lines ?? draft.lines
  const { setParams } = useServiceWorkParams()
  const [added, setAdded] = useState<
    Record<number, { offeringId: string; itemName: string }>
  >({})
  const resolvedDraft = {
    ...draft,
    lines: draft.lines.map((line, index) =>
      added[index] ? { ...line, offeringId: added[index]?.offeringId } : line,
    ),
  }
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const money = (minor: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: created?.currencyCode ?? draft.currencyCode,
      maximumFractionDigits: 2,
    }).format(minor / 100)
  async function open() {
    setPending(true)
    setError(null)
    const generation = getDataCacheGeneration()
    try {
      const context = await client.tenant.current.query()
      if (
        generation !== getDataCacheGeneration() ||
        context.tenant.id !== draft.origin.tenantId ||
        context.activeStore?.id !== draft.origin.storeId
      )
        throw Error(
          "Select the original business and Store to review this job.",
        )
      const saved = sourceAnswerId
        ? await client.services.assistantJobCard.query({
            sourceAnswerId,
            sourceMessageId: sourceMessageId ?? "",
            storeId: draft.origin.storeId,
          })
        : created
      if (generation !== getDataCacheGeneration()) return
      if (saved) {
        if (sourceAnswerId)
          cache.setQueryData(
            trpc.services.assistantJobCard.queryKey({
              sourceAnswerId,
              sourceMessageId: sourceMessageId ?? "",
              storeId: draft.origin.storeId,
            }),
            saved,
          )
        if (saved.jobId)
          await setParams({
            serviceSheet: "job",
            jobId: saved.jobId,
            jobStep: null,
          })
        else
          await setOrderParams({
            orderSheet: "details",
            orderId: saved.orderId,
          })
      } else {
        setServiceIntakeDraft({
          ...resolvedDraft,
          sourceAnswerId,
          sourceMessageId,
        })
        await setParams({ serviceSheet: "intake" })
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The job form could not be opened.",
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="grid gap-3 rounded-lg border p-4 [overflow-wrap:anywhere]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Laundry job</p>
          <p className="text-xs text-muted-foreground">
            {created
              ? (created.customerName ?? "Walk-in customer")
              : (draft.customer?.name ?? "Walk-in customer")}
            {!created && draft.customer && !draft.customer.id
              ? " · New customer"
              : ""}
          </p>
        </div>
        <p className="font-semibold tabular-nums">
          {money(created?.totalMinor ?? draft.totalMinor)}
        </p>
      </div>
      {created ? (
        <output className="text-xs font-medium">
          Created · {created.orderNumber}
        </output>
      ) : null}
      <ul className="grid gap-2">
        {displayLines.map((line, index) => (
          <li
            key={`${line.name}:${index}`}
            className="grid gap-1 border-t pt-2 text-sm"
          >
            <div className="flex justify-between gap-4">
              <span>
                {line.quantity} × {line.name}
              </span>
              <span className="shrink-0 tabular-nums">
                {money(line.totalMinor)}
              </span>
            </div>
            {!created && added[index] ? (
              <p className="text-xs text-muted-foreground">
                Added to {added[index]?.itemName}
              </p>
            ) : null}
            {!created && !line.offeringId && !added[index] ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Not listed · Unit price {money(line.unitPriceMinor)}
                </p>
                <OpenMissingCatalogItem
                  handoff={{
                    kind: "service",
                    name: line.name,
                    origin: draft.origin,
                  }}
                  priceMinor={line.unitPriceMinor}
                  onAdded={(choice) =>
                    setAdded((previous) => ({ ...previous, [index]: choice }))
                  }
                />
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {!created &&
        draft.assumptions.map((note) => (
          <p key={note} className="text-xs text-muted-foreground">
            {note}
          </p>
        ))}
      {!created ? (
        <p className="text-xs text-muted-foreground">
          No payment recorded. All details can be changed in the form.
        </p>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        className="justify-self-start"
        disabled={
          pending ||
          checking ||
          (!created && Boolean(sourceAnswerId) && receipt.isError)
        }
        onClick={open}
      >
        {pending
          ? "Opening…"
          : checking
            ? "Checking job…"
            : created
              ? created.jobId
                ? "Open job"
                : "Open order"
              : "Review job"}
      </Button>
      {receipt.isError && sourceAnswerId ? (
        <div className="text-xs text-destructive">
          <p>The job status could not be checked.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void receipt.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {error ? (
        <output className="text-xs text-destructive">{error}</output>
      ) : null}
    </div>
  )
}
