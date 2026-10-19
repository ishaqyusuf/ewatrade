import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { ReactNode } from "react"
import { ListCard, StatusPill, type StatusPillTone } from "../green-till/kit"

type Original = RouterOutputs["serviceAssistantRequests"]["original"]
type Line = Original["lines"][number]

const statuses: Record<string, { label: string; tone: StatusPillTone }> = {
  SUBMITTED: { label: "Submitted", tone: "info" },
  NEEDS_INFORMATION: { label: "Needs information", tone: "warn" },
  QUOTED: { label: "Quoted", tone: "info" },
  DECLINED: { label: "Declined", tone: "danger" },
  WITHDRAWN: { label: "Withdrawn", tone: "muted" },
  CONVERTED: { label: "Converted to Order", tone: "ok" },
}
export const serviceRequestStatusLabel = (status: string) =>
  statuses[status] ?? null

const channels: Record<string, string> = {
  WEB: "Web request form",
  STAFF: "Entered by staff",
  WHATSAPP: "WhatsApp",
}
const quoteStatuses: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  SUPERSEDED: "Superseded",
  REVOKED: "Revoked",
}
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/
/** Exact stored instant; no device timezone is applied. */
export const serviceRequestUtc = (value: string | null) =>
  value && iso.test(value) ? `${value} (UTC)` : "Not recorded"
const quantity = /^\d{1,32}(?:\.\d{1,6})?$/

function quoteTotal(minor: number, currency: string) {
  if (!Number.isSafeInteger(minor) || minor < 0 || !/^[A-Z]{3}$/.test(currency))
    return "Amount unavailable"
  try {
    return formatFinanceMoney(String(minor), currency)
  } catch {
    return "Amount unavailable"
  }
}

/** Basic provenance/state/shape checks before any saved customer value renders. */
function renderable(r: Original) {
  return (
    Boolean(statuses[r.request.status]) &&
    Boolean(channels[r.request.channelOrigin]) &&
    Array.isArray(r.lines) &&
    r.lines.length <= 100 &&
    r.lines.every(
      (line) =>
        quantity.test(line.quantity) &&
        /[1-9]/.test(line.quantity) &&
        Array.isArray(line.optionSelections),
    ) &&
    (r.currentQuote === null ||
      (Boolean(quoteStatuses[r.currentQuote.status]) &&
        Number.isSafeInteger(r.currentQuote.version)))
  )
}

/**
 * Pure presentation of one exact original Service Request. The protected
 * owner supplies a fresh read for the exact request, origin and current
 * actor/business/Store; saved request facts stay separate from the current
 * canonical quotation, and nothing here acts on the request.
 */
export function NativeServiceRequestContent({
  record: r,
}: { record: Original }) {
  if (!renderable(r))
    return (
      <Text accessibilityRole="alert">
        This saved Service Request is in an unsupported state. No customer, line
        or quotation facts are shown.
      </Text>
    )
  const status = statuses[r.request.status]
  const lines = `${r.lines.length} ${r.lines.length === 1 ? "line" : "lines"}`
  return (
    <View className="gap-4">
      <ListCard>
        <View className="gap-3 py-4">
          <View className="flex-row flex-wrap gap-2">
            {status ? (
              <StatusPill label={status.label} tone={status.tone} />
            ) : null}
            <StatusPill label="Saved request" tone="muted" />
          </View>
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-foreground"
          >
            {r.request.customer.name?.trim() || "No customer name"}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {r.form.label} · {lines}
          </Text>
          <Fact
            label="Requested for"
            value={
              r.request.requestedAt
                ? serviceRequestUtc(r.request.requestedAt)
                : "Not stated"
            }
          />
          <Fact
            label="Received"
            value={serviceRequestUtc(r.request.createdAt)}
          />
          <Fact
            label="Last updated"
            value={serviceRequestUtc(r.request.updatedAt)}
          />
        </View>
      </ListCard>
      <Section title="Customer as submitted">
        <Fact label="Name" value={r.request.customer.name ?? "Not recorded"} />
        <Fact
          label="Phone"
          value={r.request.customer.phone ?? "Not recorded"}
        />
        <Fact
          label="Email"
          value={r.request.customer.email ?? "Not recorded"}
        />
        <Fact
          label="Came in via"
          value={channels[r.request.channelOrigin] ?? ""}
        />
        <Fact
          label="Contact opt-in (stored)"
          value={r.request.contactOptIn ? "Yes" : "No"}
        />
        <Fact
          label="Consent version (stored)"
          value={r.request.consentVersion ?? "None recorded"}
        />
        <Text className="text-xs text-muted-foreground">
          Stored opt-in and consent are saved facts, not permission to send
          anything.
        </Text>
      </Section>
      <Section title="Request details">
        <Text selectable className="text-base text-foreground">
          {r.request.details?.trim()
            ? r.request.details
            : "No details recorded"}
        </Text>
      </Section>
      <Section title={`Saved lines (${r.lines.length})`}>
        {r.lines.map((line, index) => (
          <View key={line.id}>
            {index > 0 ? <View className="h-px bg-border" /> : null}
            <LineView line={line} />
          </View>
        ))}
        <Text className="text-xs text-muted-foreground">
          Saved names, options and exact quantities — not current Catalog
          prices.
        </Text>
      </Section>
      <Section title="Staff response">
        <Text selectable className="text-sm text-foreground">
          {r.request.staffResponse?.trim()
            ? r.request.staffResponse
            : "No staff response recorded"}
        </Text>
      </Section>
      <Quote quote={r.currentQuote} />
      <Text className="text-xs text-muted-foreground">
        Checked {serviceRequestUtc(r.asOf)}. Read-only: no reply, decline, quote
        or convert action here.
      </Text>
    </View>
  )
}

function LineView({ line }: { line: Line }) {
  return (
    <View className="gap-1.5 py-3">
      <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
        <Text className="shrink text-sm font-bold text-foreground">
          {line.offeringName} · {line.variantName}
        </Text>
        <Text
          selectable
          className="text-sm font-bold tabular-nums text-foreground"
        >
          × {line.quantity}
        </Text>
      </View>
      {line.optionSelections.map((option, index) => (
        <Fact
          key={`${index}:${option.group}`}
          label={option.group}
          value={option.value}
        />
      ))}
      {line.details?.trim() ? (
        <Text selectable className="text-xs text-muted-foreground">
          {line.details}
        </Text>
      ) : null}
    </View>
  )
}

function Quote({ quote }: { quote: Original["currentQuote"] }) {
  return (
    <Section
      title="Current quotation"
      pill={quote ? <StatusPill label="Current" tone="info" /> : undefined}
    >
      {quote ? (
        <>
          <Fact label="Version" value={`v${quote.version}`} />
          <Fact label="Status" value={quoteStatuses[quote.status] ?? ""} />
          <Fact
            label="Stored version total"
            value={quoteTotal(quote.totalMinor, quote.currencyCode)}
          />
          <Fact
            label="Expires"
            value={
              quote.expiresAt
                ? serviceRequestUtc(quote.expiresAt)
                : "No expiry recorded"
            }
          />
          <Fact
            label="Order"
            value={
              quote.acceptedOrderId
                ? "Accepted into an Order"
                : "No accepted Order"
            }
          />
          <Text className="text-xs text-muted-foreground">
            The stored version total is not the selected offer, an amount
            payable, acceptance or payment proof, or permission to act.
          </Text>
        </>
      ) : (
        <Text className="text-sm text-muted-foreground">
          No canonical quotation exists for this request.
        </Text>
      )}
    </Section>
  )
}

function Section({
  title,
  pill,
  children,
}: {
  title: string
  pill?: ReactNode
  children: ReactNode
}) {
  return (
    <ListCard>
      <View className="gap-3 py-4">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text
            accessibilityRole="header"
            className="shrink text-sm font-bold text-foreground"
          >
            {title}
          </Text>
          {pill}
        </View>
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
      <Text
        selectable
        className="text-right text-sm font-bold tabular-nums text-foreground"
      >
        {value}
      </Text>
    </View>
  )
}
