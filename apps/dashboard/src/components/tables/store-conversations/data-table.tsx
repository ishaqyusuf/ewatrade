"use client"

import { Badge } from "@ewatrade/ui"

import { StoreConversationActionMenu } from "./action-menu"
import {
  type StoreConversationQueueItem,
  formatStoreConversationDate,
  formatStoreConversationRequestKind,
  formatStoreConversationStatus,
  storeConversationColumns,
} from "./columns"

function requestSummary(item: StoreConversationQueueItem) {
  return item.requests.map((request, index) => (
    <span className="block" key={`${request.id}:${index}`}>
      {formatStoreConversationRequestKind(request.kind)} ·{" "}
      {formatStoreConversationStatus(request.status)}
      {request.lifecycle === "terminal" ? " (closed)" : ""}
    </span>
  ))
}

export function StoreConversationDataTable({
  items,
  onOpen,
  timeZone,
}: {
  items: StoreConversationQueueItem[]
  onOpen: (conversationId: string) => void
  timeZone: string
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-background">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {storeConversationColumns.map((column) => (
                <th
                  className={`px-4 py-3 ${column === "Action" ? "text-right" : ""}`}
                  key={column}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <tr
                className="cursor-pointer hover:bg-muted/30"
                key={item.conversationId}
                onClick={() => onOpen(item.conversationId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onOpen(item.conversationId)
                  }
                }}
                tabIndex={0}
              >
                <td className="px-4 py-4">
                  <p className="font-medium">{item.conversationId}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatStoreConversationDate(
                      item.lastCustomerActivityAt,
                      timeZone,
                    )}
                  </p>
                </td>
                <td className="px-4 py-4 text-muted-foreground">
                  {requestSummary(item)}
                </td>
                <td className="px-4 py-4">
                  {item.assignment.label ?? "Unassigned"}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        item.sla.state === "overdue"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {formatStoreConversationStatus(item.sla.state)}
                    </Badge>
                    {item.unreadCustomerMessages ? (
                      <span
                        aria-label="Unread customer activity"
                        className="size-2 rounded-full bg-primary"
                      />
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <StoreConversationActionMenu
                    onOpen={() => onOpen(item.conversationId)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-border md:hidden">
        {items.map((item) => (
          <button
            className="grid w-full gap-3 p-4 text-left"
            key={item.conversationId}
            onClick={() => onOpen(item.conversationId)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{item.conversationId}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatStoreConversationDate(
                    item.lastCustomerActivityAt,
                    timeZone,
                  )}
                </p>
              </div>
              <Badge
                variant={
                  item.sla.state === "overdue" ? "destructive" : "secondary"
                }
              >
                {formatStoreConversationStatus(item.sla.state)}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {requestSummary(item)}
              <span className="mt-1 block">
                {item.assignment.label ?? "Unassigned"}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
