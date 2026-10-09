import { selectColumn } from "@/components/tables/core"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge } from "@ewatrade/ui"
import type { ColumnDef } from "@tanstack/react-table"
import { StoreConversationActionMenu } from "./action-menu"

export type StoreConversationQueueItem =
  RouterOutputs["serviceCommerce"]["storeConversationQueue"]["items"][number]

export function formatStoreConversationRequestKind(kind: string) {
  if (kind === "commerce_inquiry") return "Product"
  if (kind === "service_request") return "Service"
  return "Prescription"
}

export function formatStoreConversationDate(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(value)
}

export function formatStoreConversationStatus(value: string) {
  return value.replaceAll("_", " ")
}

export function StoreConversationResponse({
  item,
}: {
  item: StoreConversationQueueItem
}) {
  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={item.sla.state === "overdue" ? "destructive" : "secondary"}
      >
        {formatStoreConversationStatus(item.sla.state)}
      </Badge>
      {item.unreadCustomerMessages ? (
        <span
          role="img"
          aria-label="Unread customer activity"
          className="size-2 rounded-full bg-primary"
        />
      ) : null}
    </div>
  )
}

export const storeConversationColumns = [
  "Conversation",
  "Requests and state",
  "Assignment",
  "Response",
  "Action",
] as const

export function createStoreConversationColumns(
  timeZone: string,
  onOpen: (conversationId: string) => void,
): ColumnDef<StoreConversationQueueItem>[] {
  return [
    selectColumn((item) => `conversation ${item.conversationId}`),
    {
      id: "conversation",
      accessorKey: "conversationId",
      header: "Conversation",
      size: 240,
      minSize: 200,
      maxSize: 360,
      enableHiding: false,
      meta: {
        headerLabel: "Conversation",
        sortField: "last_customer_activity",
        sticky: true,
        reorderable: false,
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-focus-visible:bg-muted/40 group-aria-selected:bg-muted/60 md:sticky",
        skeleton: { type: "text" as const, width: "w-36" },
      },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.conversationId}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {formatStoreConversationDate(
              row.original.lastCustomerActivityAt,
              timeZone,
            )}
          </p>
        </div>
      ),
    },
    {
      id: "requests",
      header: "Requests and state",
      size: 300,
      minSize: 240,
      maxSize: 480,
      meta: {
        headerLabel: "Requests and state",
        skeleton: { type: "text" as const, width: "w-48" },
      },
      cell: ({ row }) => (
        <span
          className="block truncate text-muted-foreground"
          title={row.original.requests
            .map(
              (request) =>
                `${formatStoreConversationRequestKind(request.kind)} · ${formatStoreConversationStatus(request.status)}${request.lifecycle === "terminal" ? " (closed)" : ""}`,
            )
            .join("; ")}
        >
          {row.original.requests.map((request, index) => (
            <span className="block" key={`${request.id}:${index}`}>
              {formatStoreConversationRequestKind(request.kind)} ·{" "}
              {formatStoreConversationStatus(request.status)}
              {request.lifecycle === "terminal" ? " (closed)" : ""}
            </span>
          ))}
        </span>
      ),
    },
    {
      accessorFn: (item) => item.assignment.label ?? "Unassigned",
      id: "assignment",
      header: "Assignment",
      size: 190,
      minSize: 150,
      maxSize: 280,
      meta: {
        headerLabel: "Assignment",
        skeleton: { type: "text" as const, width: "w-28" },
      },
      cell: ({ row }) => row.original.assignment.label ?? "Unassigned",
    },
    {
      id: "response",
      header: "Response",
      size: 180,
      minSize: 150,
      maxSize: 260,
      meta: {
        headerLabel: "Response",
        sortField: "response_due_at",
        skeleton: { type: "badge" as const, width: "w-24" },
      },
      cell: ({ row }) => <StoreConversationResponse item={row.original} />,
    },
    {
      id: "actions",
      header: "Action",
      size: 90,
      minSize: 90,
      maxSize: 90,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerLabel: "Action",
        sticky: true,
        reorderable: false,
        className: "z-20 border-l bg-background md:sticky",
        skeleton: { type: "icon" as const },
      },
      cell: ({ row }) => (
        <StoreConversationActionMenu
          onOpen={() => onOpen(row.original.conversationId)}
        />
      ),
    },
  ]
}
