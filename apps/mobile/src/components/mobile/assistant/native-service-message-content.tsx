import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { ReactNode } from "react"
import { ActionButton } from "../action-button"
import { ListCard, StatusPill } from "../green-till/kit"

type Record = RouterOutputs["serviceCommunications"]["manualMessageOriginal"]
const methods: { [channel: string]: string } = {
  MANUAL: "In person / other",
  SMS: "SMS from the staff member’s own phone",
  WHATSAPP: "WhatsApp from the staff member’s own phone",
}
const purposes: { [purpose: string]: string } = {
  assistant_manual_share:
    "Message shared by staff, recorded from the assistant",
}
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/
const utc = (value: string | null) =>
  value && iso.test(value) ? `${value} (UTC)` : "Not recorded"

/** Only the exact staff-reported, never-sent, unverified record is shown. */
function renderable(r: Record) {
  return (
    r.kind === "staff_reported_share" &&
    r.sending === "none" &&
    r.delivery === "unverified" &&
    r.intent.status === "COMPLETED" &&
    r.intent.channel === "MANUAL" &&
    typeof r.intent.message === "string" &&
    r.intent.message.trim().length > 0 &&
    r.intent.message.length <= 1000 &&
    Boolean(methods[r.share.channel]) &&
    (r.share.note === null || r.share.note.length <= 500)
  )
}

/**
 * Pure presentation of one exact recorded manual share. The protected owner
 * supplies a fresh read for the exact Job, message and share; this shows the
 * saved facts as saved and the current Order label as current, with no send,
 * consent or delivery inference.
 */
export function NativeServiceMessageContent({
  record: r,
  onOpenOrder,
}: {
  record: Record
  onOpenOrder?: () => void
}) {
  if (!renderable(r))
    return (
      <Text accessibilityRole="alert">
        This saved message record is in an unsupported state. No message,
        recipient or delivery is shown.
      </Text>
    )
  return (
    <View className="gap-4">
      <ListCard>
        <View className="gap-3 py-4">
          <View className="flex-row flex-wrap gap-2">
            <StatusPill label="Nothing sent" tone="muted" />
            <StatusPill label="Delivery not verified" tone="warn" />
          </View>
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-foreground"
          >
            Staff-reported shared message
          </Text>
          <Text className="text-sm text-muted-foreground">
            A staff member recorded that they shared this message with the
            customer themselves. ẸwáTrade sent nothing. There is no consent,
            provider or delivery proof.
          </Text>
        </View>
      </ListCard>
      <Section title="Saved message">
        <Text selectable className="text-base text-foreground">
          {r.intent.message}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Exact text as recorded, {r.intent.message.length} characters.
        </Text>
      </Section>
      <Section title="How it was recorded">
        <Fact label="Shared by" value={methods[r.share.channel] ?? ""} />
        <Fact label="Shared at" value={utc(r.share.sharedAt)} />
        <Fact
          label="Recorded by staff ID"
          value={r.share.sharedByUserId ?? "Not recorded"}
        />
        <Fact label="Note" value={r.share.note?.trim() || "No note"} />
        <Text className="text-xs text-muted-foreground">
          The staff ID is the saved identity; no current staff name is inferred.
        </Text>
      </Section>
      <Section title="Saved recipient at the time">
        <Fact label="Phone" value={r.intent.recipient.phone ?? "Not saved"} />
        <Fact label="Email" value={r.intent.recipient.email ?? "Not saved"} />
        <Text className="text-xs text-muted-foreground">
          The Order contact saved with this record. It may differ from the
          customer’s current details.
        </Text>
      </Section>
      <Section title="Saved record">
        <Fact
          label="Purpose"
          value={purposes[r.intent.purpose] ?? "Staff-reported message"}
        />
        <Fact label="Status" value="Recorded" />
        <Fact label="Created" value={utc(r.intent.createdAt)} />
        <Fact label="Completed" value={utc(r.intent.completedAt)} />
      </Section>
      <Section title="Related Order (current)">
        <Fact label="Order" value={r.order.number} />
        <Fact
          label="Current customer label"
          value={r.currentOrderRecipientName ?? "No current customer name"}
        />
        <Text className="text-xs text-muted-foreground">
          Current Order facts are shown for context. They do not replace the
          saved message or its saved recipient.
        </Text>
        {onOpenOrder ? (
          <ActionButton variant="outline" onPress={onOpenOrder}>
            Open related Order
          </ActionButton>
        ) : null}
      </Section>
      <Text className="text-xs text-muted-foreground">
        Checked {utc(r.asOf)}
      </Text>
    </View>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ListCard>
      <View className="gap-3 py-4">
        <Text
          accessibilityRole="header"
          className="text-sm font-bold text-foreground"
        >
          {title}
        </Text>
        {children}
      </View>
    </ListCard>
  )
}

/** Label left, value right; wraps to two lines at large text sizes. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <Text className="shrink text-xs text-muted-foreground">{label}</Text>
      <Text selectable className="text-right text-sm font-bold text-foreground">
        {value}
      </Text>
    </View>
  )
}
