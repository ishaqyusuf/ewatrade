import type {
  StoreConversationSelectRequestInput,
  StoreConversationTimelineProjection,
} from "@ewatrade/service-commerce"

type RequestSummary = StoreConversationTimelineProjection["requests"][number]

const requestOccurrenceFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "UTC",
  timeStyle: "short",
})

export function StoreConversationRequestRail({
  requests,
}: {
  requests: RequestSummary[]
}) {
  if (requests.length === 0) return null
  return (
    <section
      aria-label="Requests in this conversation"
      className="grid gap-2 rounded-2xl border border-border bg-card p-3 sm:grid-cols-2"
    >
      {requests.map((request) => (
        <article
          className="grid gap-1 rounded-xl border border-border/70 px-3 py-2"
          key={`${request.kind}:${request.id}`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{request.label}</p>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {request.lifecycle === "terminal" ? "Complete" : "Current"}
            </span>
          </div>
          <p className="text-xs capitalize text-muted-foreground">
            {request.status.replaceAll("_", " ")} ·{" "}
            {requestOccurrenceFormatter.format(new Date(request.createdAt))}
          </p>
        </article>
      ))}
    </section>
  )
}

export function StoreConversationRequestChoice({
  conversationId,
  disabled,
  messageId,
  onSelect,
  publicToken,
  requestKinds,
  requests,
}: {
  conversationId: string
  disabled: boolean
  messageId: string
  onSelect: (target: StoreConversationSelectRequestInput["target"]) => void
  publicToken: string
  requestKinds: StoreConversationTimelineProjection["availableRequestKinds"]
  requests: RequestSummary[]
}) {
  const continuation = new URLSearchParams({ conversationId, messageId })
  return (
    <aside className="ml-auto grid w-full max-w-md gap-2 rounded-2xl border border-border bg-card p-3">
      <p className="text-sm font-semibold">What is this message about?</p>
      <p className="text-xs leading-5 text-muted-foreground">
        Choose where it belongs. EwaTrade will not infer this from your message.
      </p>
      <div className="flex flex-wrap gap-2">
        {requests.map((request) => (
          <button
            className="min-h-11 rounded-full border border-border px-4 text-sm font-medium"
            disabled={disabled}
            key={`${request.kind}:${request.id}`}
            onClick={() =>
              onSelect({
                kind: "existing_request",
                requestId: request.id,
                requestKind: request.kind,
              })
            }
            type="button"
          >
            Continue {request.label}
          </button>
        ))}
        {requestKinds.includes("product_inquiry") ? (
          <button
            className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
            disabled={disabled}
            onClick={() => onSelect({ kind: "new_commerce_inquiry" })}
            type="button"
          >
            New product request
          </button>
        ) : null}
        {requestKinds.includes("service") ? (
          <a
            className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium"
            href={`/r/${encodeURIComponent(publicToken)}/service?${continuation}`}
          >
            New service request
          </a>
        ) : null}
        {requestKinds.includes("prescription") ? (
          <a
            className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium"
            href={`/r/${encodeURIComponent(publicToken)}/prescription?${continuation}`}
          >
            New prescription request
          </a>
        ) : null}
      </div>
    </aside>
  )
}
