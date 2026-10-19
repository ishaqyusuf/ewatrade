"use client"

import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge } from "@ewatrade/ui"
import { type ReactNode, useId } from "react"

type ManualMessage =
  RouterOutputs["serviceCommunications"]["manualMessageOriginal"]
const methods: { [channel: string]: string } = {
  MANUAL: "In person / other",
  SMS: "SMS from the staff member’s own phone",
  WHATSAPP: "WhatsApp from the staff member’s own phone",
}
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/

function UtcTime({ value }: { value: string | null }) {
  return value && iso.test(value) ? (
    <time dateTime={value}>{value}</time>
  ) : (
    <>Not recorded</>
  )
}

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{title}</dt>
      <dd className="break-words font-medium">{children}</dd>
    </div>
  )
}

/**
 * One exact staff-reported manual share. Saved facts stay saved, the current
 * Order label is shown as current, and nothing here sends, shares or implies
 * consent or delivery. The sheet owner checks freshness and scope first.
 */
export function AssistantManualMessageContent({
  record: r,
  checkedAt,
}: {
  record: ManualMessage
  checkedAt: number
}) {
  const messageId = useId()
  const recordedId = useId()
  const recipientId = useId()
  const orderId = useId()
  const method = methods[r.share.channel]
  if (
    !method ||
    !r.intent.message.trim() ||
    r.intent.message.length > 1000 ||
    (r.share.note?.length ?? 0) > 500
  )
    return (
      <p role="alert">
        This saved message record is in an unsupported state. No message,
        recipient or delivery is shown.
      </p>
    )
  return (
    <div className="grid gap-5 text-sm">
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Nothing sent</Badge>
          <Badge variant="outline">Delivery not verified</Badge>
        </div>
        <p className="text-muted-foreground">
          A staff member recorded that they shared this message with the
          customer themselves. ẸwáTrade sent nothing. There is no consent,
          provider or delivery proof.
        </p>
      </div>
      <section className="grid gap-2" aria-labelledby={messageId}>
        <h3 id={messageId} className="text-lg font-medium">
          Saved message
        </h3>
        <p className="whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-4 text-base">
          {r.intent.message}
        </p>
        <p className="text-muted-foreground">
          Exact text as recorded, {r.intent.message.length} characters.
        </p>
      </section>
      <section className="grid gap-3" aria-labelledby={recordedId}>
        <h3 id={recordedId} className="font-medium">
          How it was recorded
        </h3>
        <dl className="grid grid-cols-2 gap-4">
          <Fact title="Shared by">{method}</Fact>
          <Fact title="Shared at (UTC)">
            <UtcTime value={r.share.sharedAt} />
          </Fact>
          <Fact title="Recorded by staff ID">
            {r.share.sharedByUserId ?? "Not recorded"}
          </Fact>
          <Fact title="Note">{r.share.note?.trim() || "No note"}</Fact>
          <Fact title="Created (UTC)">
            <UtcTime value={r.intent.createdAt} />
          </Fact>
          <Fact title="Completed (UTC)">
            <UtcTime value={r.intent.completedAt} />
          </Fact>
        </dl>
        <p className="text-muted-foreground">
          The staff ID is the saved identity; no current staff name is inferred.
        </p>
      </section>
      <section
        className="grid gap-3 rounded-lg border p-4"
        aria-labelledby={recipientId}
      >
        <h3 id={recipientId} className="font-medium">
          Saved recipient at the time
        </h3>
        <dl className="grid grid-cols-2 gap-4">
          <Fact title="Phone">{r.intent.recipient.phone ?? "Not saved"}</Fact>
          <Fact title="Email">{r.intent.recipient.email ?? "Not saved"}</Fact>
        </dl>
        <p className="text-muted-foreground">
          The Order contact saved with this record. It may differ from the
          customer’s current details.
        </p>
      </section>
      <section
        className="grid gap-3 rounded-lg border p-4"
        aria-labelledby={orderId}
      >
        <h3 id={orderId} className="font-medium">
          Related Order (current)
        </h3>
        <dl className="grid grid-cols-2 gap-4">
          <Fact title="Order">{r.order.number}</Fact>
          <Fact title="Current customer label">
            {r.currentOrderRecipientName ?? "No current customer name"}
          </Fact>
        </dl>
        <p className="text-muted-foreground">
          Current Order facts are shown for context. They do not replace the
          saved message or its saved recipient.
        </p>
      </section>
      <p className="border-t pt-4 text-muted-foreground">
        Checked at <UtcTime value={new Date(checkedAt).toISOString()} /> (UTC).
        This view sends nothing and changes no message, Order or customer.
      </p>
    </div>
  )
}
