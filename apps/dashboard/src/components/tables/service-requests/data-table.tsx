"use client"

import { ConfirmAlert } from "@/components/forms/confirm-alert"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useServiceRequestFilters } from "@/components/service-work/service-request-search-filter"
import {
  type ServiceRequest,
  formatPreferred,
  formatPrice,
  formatWhen,
  isOpenRequest,
  requestStatus,
  toneClass,
} from "@/components/service-work/service-utils"
import {
  SelectionBar,
  SimpleDirectoryTable,
  selectColumn,
  useLoadedRowSelection,
} from "@/components/tables/core"
import { useMobileOverlay } from "@/hooks/use-mobile-overlay"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Textarea,
  cn,
  toast,
} from "@ewatrade/ui"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useEffect, useMemo, useRef, useState } from "react"

const getId = (request: ServiceRequest) => request.id
export function ServiceRequestsDataTable({
  storeId,
  timeZone,
}: { storeId: string; timeZone: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setParams } = useServiceWorkParams()
  const [filter] = useServiceRequestFilters()
  const { data: requests } = useSuspenseQuery(
    trpc.serviceAccess.requests.queryOptions(
      { limit: 100, storeId },
      { retry: false },
    ),
  )
  const data = useMemo(
    () =>
      requests.filter((request) => {
        const text = [
          request.customerName,
          request.customerPhone,
          ...request.lines.map(
            (line) => `${line.offeringName} ${line.variantName}`,
          ),
        ]
          .join(" ")
          .toLocaleLowerCase()
        return (
          (!filter.requestQuery?.trim() ||
            text.includes(filter.requestQuery.trim().toLocaleLowerCase())) &&
          (!filter.requestStatus || request.status === filter.requestStatus)
        )
      }),
    [requests, filter],
  )
  const [selection, setSelection] = useLoadedRowSelection({
    rows: data,
    getRowId: getId,
    scope: JSON.stringify([storeId, filter]),
  })
  const [batchAction, setBatchAction] = useState<
    "needs_information" | "declined" | null
  >(null)
  const [message, setMessage] = useState("")
  const [confirmDecline, setConfirmDecline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const phone = useMobileOverlay()
  const running = useRef(false)
  const [working, setWorking] = useState(false)
  const reviewScope = JSON.stringify([storeId, filter, selection])
  useEffect(() => {
    void reviewScope
    if (!running.current) {
      setBatchAction(null)
      setMessage("")
    }
  }, [reviewScope])
  const update = useMutation(trpc.serviceAccess.updateRequest.mutationOptions())
  const open = (id: string, step?: string) =>
    void setParams({
      requestId: id,
      jobStep: step ?? null,
      serviceSheet: "customer_request",
    })
  const columns: ColumnDef<ServiceRequest>[] = [
    selectColumn((request) => `request for ${request.customerName}`),
    {
      id: "customer",
      header: "Customer",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.customerName}</p>
          <p className="text-xs text-muted-foreground">
            {row.original.customerPhone}
          </p>
        </div>
      ),
    },
    {
      id: "service",
      header: "Service",
      cell: ({ row }) => (
        <div className="max-w-80">
          <p>
            {row.original.lines
              .map((line) => `${line.offeringName} · ${line.quantity}`)
              .join(", ")}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row.original.details}
          </p>
        </div>
      ),
    },
    {
      id: "received",
      header: "Received",
      cell: ({ row }) => (
        <div>
          <p>{formatWhen(row.original.createdAt, timeZone)}</p>
          {row.original.requestedAt ? (
            <p className="text-xs text-muted-foreground">
              Prefers{" "}
              {formatPreferred(
                row.original.requestedAt,
                row.original.requestedAtDateOnly,
                timeZone,
              )}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "quote",
      header: "Quote",
      cell: ({ row }) =>
        row.original.currentQuote
          ? formatPrice(
              row.original.currentQuote.totalMinor,
              row.original.currentQuote.currencyCode,
            )
          : "Price to quote",
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                aria-label={`Update request for ${row.original.customerName}`}
                data-row-interactive="true"
                disabled={update.isPending}
              >
                {requestStatus(row.original.status).label}
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  className="size-3"
                  aria-hidden="true"
                />
              </Button>
            }
          />
          <DropdownMenuContent appearance="dashboard" align="end">
            {isOpenRequest(row.original.status) ? (
              <>
                <DropdownMenuItem
                  onClick={() => open(row.original.id, "quote")}
                >
                  Prepare quote
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => open(row.original.id, "ask")}>
                  Ask for details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => open(row.original.id, "decline")}
                >
                  Decline request
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onClick={() => open(row.original.id)}>
                View request
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getId,
    state: { rowSelection: selection },
    onRowSelectionChange: setSelection,
    enableRowSelection: !working,
  })
  const selected = table.getSelectedRowModel().rows.map((row) => row.original)
  const eligible = selected.filter((request) => isOpenRequest(request.status))
  function reviewBatch() {
    if (!message.trim()) {
      setError("Enter a message for the selected customers.")
      return
    }
    if (batchAction === "declined") setConfirmDecline(true)
    else void applyBatch()
  }
  async function applyBatch() {
    if (running.current || !batchAction) return
    running.current = true
    setWorking(true)
    setError(null)
    let completed = 0
    try {
      for (const request of eligible) {
        await update.mutateAsync({
          requestId: request.id,
          expectedRevision: request.revision,
          storeId,
          status: batchAction,
          response: message.trim(),
        })
        completed++
        setSelection((previous) => {
          const next = { ...previous }
          delete next[request.id]
          return next
        })
      }
      toast(
        `${completed} requests updated. ${selected.length - eligible.length} ineligible requests left unchanged.`,
      )
      setBatchAction(null)
      setMessage("")
    } catch (failure) {
      setError(
        `${completed} saved. ${failure instanceof Error ? failure.message : "Could not update the remaining requests."}`,
      )
    } finally {
      running.current = false
      setWorking(false)
      setConfirmDecline(false)
      await queryClient.invalidateQueries({
        queryKey: trpc.serviceAccess.requests.pathKey(),
      })
    }
  }
  return (
    <div className="grid gap-4">
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      {batchAction ? (
        <section
          className="grid gap-3 rounded-[var(--ui-radius-surface)] border border-border bg-card p-4"
          aria-label="Review request batch"
        >
          <p className="text-sm">
            {eligible.length} eligible requests.{" "}
            {selected.length - eligible.length} other requests stay unchanged.
          </p>
          <label htmlFor="request-batch-message" className="grid gap-2 text-sm">
            Message to each customer
            <Textarea
              id="request-batch-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={2000}
            />
          </label>
          <div className="flex gap-2">
            <Button
              disabled={working || !eligible.length}
              onClick={reviewBatch}
            >
              {batchAction === "declined" ? "Decline requests" : "Save replies"}
            </Button>
            <Button
              variant="outline"
              disabled={working}
              onClick={() => setBatchAction(null)}
            >
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Replies are saved on each request. Nothing is sent automatically.
          </p>
        </section>
      ) : null}
      {data.length && phone ? (
        <ul
          aria-label="Customer requests"
          className="divide-y divide-border overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
        >
          {data.map((request) => {
            const status = requestStatus(request.status)
            return (
              <li key={request.id}>
                <button
                  type="button"
                  onClick={() => open(request.id)}
                  className="grid w-full gap-1 px-4 py-3 text-left hover:bg-[var(--hover)]"
                >
                  <span className="flex min-w-0 items-center justify-between gap-3">
                    <span className="truncate text-base font-medium">
                      {request.customerName}
                    </span>
                    <Badge
                      className={cn(
                        "shrink-0 rounded-full",
                        toneClass(status.tone),
                      )}
                    >
                      {status.label}
                    </Badge>
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {request.lines
                      .map((line) => `${line.offeringName} · ${line.quantity}`)
                      .join(", ")}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatWhen(request.createdAt, timeZone)}
                    {" · "}
                    <span
                      className={cn(
                        "tabular-nums",
                        request.currentQuote && "font-medium text-foreground",
                      )}
                    >
                      {request.currentQuote
                        ? formatPrice(
                            request.currentQuote.totalMinor,
                            request.currentQuote.currencyCode,
                          )
                        : "Price to quote"}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : data.length ? (
        <SimpleDirectoryTable
          table={table}
          label="Customer requests"
          onRowOpen={(row) => open(row.original.id)}
        />
      ) : (
        <div className="rounded-[var(--ui-radius-surface)] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {requests.length
            ? "No matching requests. Try another search or status."
            : "No customer requests yet. Share a request link or prepare a quote from New job."}
        </div>
      )}
      <ConfirmAlert
        open={confirmDecline}
        title={
          eligible.length === 1
            ? `Decline ${eligible[0]?.customerName}’s request?`
            : `Decline ${eligible.length} requests?`
        }
        description={`${eligible
          .slice(0, 3)
          .map((request) => request.customerName)
          .join(
            ", ",
          )}${eligible.length > 3 ? ` and ${eligible.length - 3} more` : ""}. This can’t be undone.`}
        action={
          eligible.length === 1
            ? "Decline request"
            : `Decline ${eligible.length} requests`
        }
        cancelLabel="Keep requests"
        danger
        pending={working}
        onCancel={() => setConfirmDecline(false)}
        onConfirm={() => void applyBatch()}
      />
      <SelectionBar table={table}>
        <Button
          size="sm"
          variant="outline"
          disabled={!eligible.length || working}
          onClick={() => {
            setError(null)
            setBatchAction("needs_information")
          }}
        >
          Ask for details ({eligible.length})
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!eligible.length || working}
          onClick={() => {
            setError(null)
            setBatchAction("declined")
          }}
        >
          Decline ({eligible.length})
        </Button>
      </SelectionBar>
    </div>
  )
}
