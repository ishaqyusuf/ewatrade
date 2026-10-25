import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { ActionButton } from "../action-button"
import { ListCard, RecordRow, StatusPill } from "../green-till/kit"
import {
  serviceRequestStatusLabel,
  serviceRequestUtc,
} from "./native-service-request-content"

type Page = RouterOutputs["serviceAssistantRequests"]["listPage"]
type Item = Page["items"][number]

const initials = (name: string | null) =>
  (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?"

/** Only the exact generic, counted, bounded page is shown; anything else fails closed. */
function renderable(page: Page) {
  return (
    page.coverage === "service_requests_only" &&
    /^\d{1,20}$/.test(page.totalMatching) &&
    Array.isArray(page.items) &&
    page.items.length <= 10 &&
    page.items.every(
      (item) =>
        Boolean(serviceRequestStatusLabel(item.status)) &&
        item.originalTarget.kind === "service_request" &&
        item.originalTarget.requestId === item.id &&
        Number.isSafeInteger(item.lineCount) &&
        item.lineCount >= 0,
    )
  )
}

/**
 * Pure presentation of one fresh Service Request page. The protected owner
 * supplies the page, the current filter labels and fenced callbacks; this
 * never queries, routes or sums pages.
 */
export function NativeServiceRequestPageContent({
  page,
  filterLabels = [],
  onOpen,
  onNext,
  onRestart,
}: {
  page: Page
  filterLabels?: string[]
  onOpen: (requestId: string) => void
  onNext?: () => void
  onRestart?: () => void
}) {
  if (!renderable(page))
    return (
      <Text accessibilityRole="alert">
        This Service Request page is in an unsupported state. No requests are
        shown.
      </Text>
    )
  return (
    <View className="gap-4">
      <ListCard>
        <View className="gap-2 py-4">
          <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Service requests
          </Text>
          <Text className="text-[26px] font-bold tabular-nums text-foreground">
            {page.totalMatching}{" "}
            <Text className="text-sm font-semibold text-muted-foreground">
              matching
            </Text>
          </Text>
          <Text className="text-xs text-muted-foreground">
            {filterLabels.length ? filterLabels.join(" · ") : "All statuses"} ·
            this Store · checked {serviceRequestUtc(page.asOf)}
          </Text>
          <Text className="text-xs text-muted-foreground">
            Generic Service Requests only — not Item Inquiries or clinical
            requests. Each page is a fresh read; pages are never added together.
          </Text>
        </View>
      </ListCard>
      {page.items.length === 0 ? (
        <ListCard>
          <View className="gap-2 py-4">
            <Text className="text-sm text-foreground">
              {onRestart
                ? "No requests on this page. Start again from the first page."
                : "No Service Requests match these filters in this Store."}
            </Text>
            <Text className="text-xs text-muted-foreground">
              This does not cover Item Inquiries or clinical requests.
            </Text>
          </View>
        </ListCard>
      ) : (
        <ListCard>
          {page.items.map((item) => (
            <Row key={item.id} item={item} onOpen={onOpen} />
          ))}
        </ListCard>
      )}
      {onNext && page.nextCursor ? (
        <ActionButton variant="outline" onPress={onNext}>
          Next page
        </ActionButton>
      ) : null}
      {onRestart ? (
        <ActionButton variant="outline" onPress={onRestart}>
          Back to first page
        </ActionButton>
      ) : null}
    </View>
  )
}

function Row({
  item,
  onOpen,
}: {
  item: Item
  onOpen: (requestId: string) => void
}) {
  const status = serviceRequestStatusLabel(item.status)
  const name = item.customerName?.trim() || "No customer name"
  const lines = `${item.lineCount} ${item.lineCount === 1 ? "line" : "lines"}`
  return (
    <RecordRow
      accessibilityLabel={`Open original request from ${name}`}
      avatar={{ initials: initials(item.customerName), tint: "lilac" }}
      meta={[
        `${item.form.label} · ${lines}`,
        item.requestedAt
          ? `Requested for ${serviceRequestUtc(item.requestedAt)}`
          : `Received ${serviceRequestUtc(item.createdAt)}`,
      ]}
      onPress={() => onOpen(item.id)}
      stackDetails
      status={
        status ? <StatusPill label={status.label} tone={status.tone} /> : null
      }
      title={name}
    />
  )
}
