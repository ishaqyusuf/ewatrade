"use client"

import {
  formatDue,
  formatPrice,
  isOpenRequest,
  requestStatus,
  toneClass,
} from "@/components/service-work/service-utils"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@ewatrade/ui"
import { MoreVerticalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useSuspenseQuery } from "@tanstack/react-query"

/** What customers asked for through your request links. */
export function CustomerRequests({
  storeId,
  timeZone,
}: {
  storeId: string
  timeZone: string
}) {
  const trpc = useTRPC()
  const { setParams } = useServiceWorkParams()
  const { data: requests } = useSuspenseQuery(
    trpc.serviceAccess.requests.queryOptions(
      { limit: 100, storeId },
      { retry: false },
    ),
  )
  const openRequest = (requestId: string) =>
    void setParams({ requestId, serviceSheet: "customer_request" })
  const sendQuote = (requestId: string) =>
    void setParams({ requestId, serviceSheet: "quote" })

  if (requests.length === 0) {
    return (
      <div className="grid justify-items-center gap-2 border border-dashed border-border p-10 text-center">
        <p className="font-medium">No customer requests yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Share a request link. When a customer asks for a service, it shows
          here and you reply with a price.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => void setParams({ serviceSheet: "request" })}
        >
          Make a request link
        </Button>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Wants</TableHead>
            <TableHead>Received</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-0">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => {
            const status = requestStatus(request.status)
            const contact = [request.customerPhone, request.customerEmail]
              .filter(Boolean)
              .join(" · ")
            return (
              <TableRow key={request.id}>
                <TableCell className="max-w-56">
                  <button
                    type="button"
                    className="block max-w-full truncate text-left font-medium hover:underline focus-visible:underline"
                    onClick={() => openRequest(request.id)}
                  >
                    {request.customerName}
                  </button>
                  {contact ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {contact}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-80">
                  <p className="truncate">
                    {request.lines
                      .map((line) => `${line.offeringName} · ${line.quantity}`)
                      .join(", ")}
                  </p>
                  {request.details ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {request.details}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDue(request.createdAt, timeZone)}
                </TableCell>
                <TableCell>
                  <Badge className={cn("rounded-full", toneClass(status.tone))}>
                    {status.label}
                  </Badge>
                  {request.currentQuote ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatPrice(
                        request.currentQuote.totalMinor,
                        request.currentQuote.currencyCode,
                      )}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {request.status === "SUBMITTED" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => sendQuote(request.id)}
                      >
                        Send quote
                      </Button>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`More for ${request.customerName}`}
                          />
                        }
                      >
                        <HugeiconsIcon
                          icon={MoreVerticalIcon}
                          aria-hidden="true"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent appearance="dashboard" align="end">
                        <DropdownMenuItem
                          onClick={() => openRequest(request.id)}
                        >
                          View request
                        </DropdownMenuItem>
                        {isOpenRequest(request.status) ||
                        request.status === "QUOTED" ? (
                          <DropdownMenuItem
                            onClick={() => sendQuote(request.id)}
                          >
                            {request.status === "QUOTED"
                              ? "Change the quote"
                              : "Send quote"}
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
