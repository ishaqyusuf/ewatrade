import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type GeneralAnswer,
  staffHistoryTargetSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import { ListCard } from "../green-till/kit"

type Target = Extract<
  NonNullable<GeneralAnswer["target"]>,
  { kind: "staff_history" }
>
type Props = {
  target: Target
  onOpen: (target: NonNullable<GeneralAnswer["target"]>) => void
}
type Page = RouterOutputs["retailOps"]["staffHistoryPage"]
type Event = Page["data"][number]
type Snapshot = Extract<Event, { stream: "STORE_ACCESS" }>["before"]
const options = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}
const human = (value: string | null | undefined) =>
  value ? value.toLowerCase().replaceAll("_", " ") : "Not recorded"
const utc = (value: string | undefined) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : "Not recorded"

/** Navigation supplies exact filters, never tenant/actor authority or mutations. */
export function NativeStaffHistoryScreen({ target: raw, onOpen }: Props) {
  const { profile } = useAuthContext()
  const parsed = staffHistoryTargetSchema.safeParse(raw)
  if (
    !parsed.success ||
    (parsed.data.filters.from &&
      parsed.data.filters.to &&
      Date.parse(parsed.data.filters.from) >=
        Date.parse(parsed.data.filters.to))
  )
    return (
      <View className="p-5">
        <Text accessibilityRole="alert">
          This recorded-history link is invalid. Open the saved answer again.
        </Text>
      </View>
    )
  if (
    !profile?.id ||
    !profile.businessId ||
    (profile.status !== undefined && profile.status !== "ACTIVE") ||
    !["OWNER", "ADMIN"].includes(profile.role ?? "")
  )
    return (
      <View className="p-5">
        <Text accessibilityRole="alert">
          Current active Owner or Admin access is required for recorded staff
          history.
        </Text>
      </View>
    )
  const target = parsed.data
  const scope = JSON.stringify([
    profile.id,
    profile.businessId,
    profile.storeId,
    profile.role,
    profile.staffAccessMode,
    profile.catalogEditor,
    profile.status,
    target,
  ])
  return <HistoryPage key={scope} target={target} onOpen={onOpen} />
}
function pageMatches(page: Page, target: Target) {
  if (
    !page ||
    !Array.isArray(page.data) ||
    page.data.length > 10 ||
    page.scope !==
      (target.filters.storeId
        ? "recorded_store_access"
        : "tenant_staff_history") ||
    !Number.isSafeInteger(page.knownMatchingEvents) ||
    page.knownMatchingEvents < page.data.length ||
    (page.total !== null &&
      (!Number.isSafeInteger(page.total) || page.total < page.data.length)) ||
    !Number.isFinite(Date.parse(page.asOf))
  )
    return false
  const ids = new Set<string>()
  return page.data.every((event) => {
    const id = `${event.stream}:${event.id}`
    if (ids.has(id)) return false
    ids.add(id)
    if (
      !event.id ||
      !Number.isFinite(Date.parse(event.at)) ||
      (target.filters.stream && event.stream !== target.filters.stream) ||
      (target.filters.eventType &&
        event.eventType !== target.filters.eventType) ||
      (target.filters.from &&
        Date.parse(event.at) < Date.parse(target.filters.from)) ||
      (target.filters.to &&
        Date.parse(event.at) >= Date.parse(target.filters.to))
    )
      return false
    if (
      target.filters.membershipId &&
      event.subject.coverage === "available" &&
      event.subject.membershipId !== target.filters.membershipId
    )
      return false
    if (
      target.filters.actorMembershipId &&
      event.actor.coverage === "available" &&
      event.actor.membershipId !== target.filters.actorMembershipId
    )
      return false
    return event.stream === "LIFECYCLE"
      ? event.source === "RetailOpsStaffLifecycleEvent"
      : event.stream === "STORE_ACCESS" &&
          event.source === "StaffAccessAuditEvent"
  })
}
function HistoryPage({ target, onOpen }: Props) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.retailOps.staffHistoryPage.queryOptions(
        { ...target.filters, limit: 10 },
        options,
      ),
      mount,
    ),
  )
  const fresh = freshShownRead(query)
  if (fresh.state === "checking")
    return (
      <View className="p-5">
        <Text>Checking current access to recorded staff history…</Text>
      </View>
    )
  if (fresh.state === "refused" || !pageMatches(fresh.data, target))
    return (
      <View className="gap-3 p-5">
        <Text accessibilityRole="alert">
          Recorded staff history is unavailable for the selected business,
          filters or current access.
        </Text>
        <ActionButton variant="outline" onPress={() => void query.refetch()}>
          Retry history
        </ActionButton>
      </View>
    )
  const page = fresh.data
  return (
    <ScrollView
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 36 }}
    >
      <ListCard>
        <View className="gap-2 py-3">
          <Text
            accessibilityRole="header"
            className="text-lg font-bold text-foreground"
          >
            Recorded staff history
          </Text>
          <Text>
            {target.filters.storeId
              ? "Recorded Store access only; business membership events are excluded by this Store filter."
              : "Business membership and Store access events."}
          </Text>
          {target.filters.membershipId ? (
            <Text>Subject: selected saved membership.</Text>
          ) : null}
          {target.filters.actorMembershipId ? (
            <Text>Actor: selected saved membership.</Text>
          ) : null}
          {target.filters.stream ? (
            <Text>Stream: {human(target.filters.stream)}.</Text>
          ) : null}
          {target.filters.eventType ? (
            <Text>Event type: {human(target.filters.eventType)}.</Text>
          ) : null}
          {target.filters.from ? (
            <Text>From (UTC, inclusive): {utc(target.filters.from)}</Text>
          ) : null}
          {target.filters.to ? (
            <Text>Until (UTC, exclusive): {utc(target.filters.to)}</Text>
          ) : null}
          <Text>
            {page.total === null
              ? `${page.knownMatchingEvents} known recorded events · full matching total unknown`
              : `${page.total} matching recorded events`}
          </Text>
          <Text>
            {page.data.length} on this page. Counts describe recorded events,
            not people.
          </Text>
          <Text>
            Legacy history is partial. Only recorded events are shown; current
            membership cannot reconstruct missing history. Pages are live
            request snapshots.
          </Text>
          <Text>
            Lifecycle stream: {human(page.coverage.lifecycle)}. Store access
            stream: {human(page.coverage.access)}. Identities:{" "}
            {human(page.coverage.identities)}.
          </Text>
          {page.total === null ? (
            <Text>
              A requested history stream is unavailable. The full matching total
              is unknown.
            </Text>
          ) : null}
          <Text>Checked (UTC): {utc(page.asOf)}</Text>
        </View>
      </ListCard>
      {page.data.length ? (
        page.data.map((event) => (
          <HistoryEvent
            key={`${event.stream}:${event.id}`}
            event={event}
            onOpen={onOpen}
          />
        ))
      ) : (
        <Text>No matching events in the available recorded streams.</Text>
      )}
      <Text className="text-xs text-muted-foreground">
        Names and contacts are current same-business directory labels, or saved
        historical-profile labels when identified. They are not original event
        identity snapshots. Store names are current directory labels; roles,
        status and grants below are the recorded snapshots.
      </Text>
      <ActionButton variant="outline" onPress={() => void query.refetch()}>
        Refresh history
      </ActionButton>
      {target.filters.cursor ? (
        <ActionButton
          variant="outline"
          onPress={() => {
            const { cursor: _cursor, ...filters } = target.filters
            onOpen({ kind: "staff_history", filters })
          }}
        >
          First page
        </ActionButton>
      ) : null}
      {page.nextCursor ? (
        <ActionButton
          onPress={() =>
            onOpen({
              kind: "staff_history",
              filters: {
                ...target.filters,
                cursor: page.nextCursor ?? undefined,
              },
            })
          }
        >
          Next page
        </ActionButton>
      ) : (
        <Text>
          End of available recorded results. This does not establish complete
          legacy history.
        </Text>
      )}
    </ScrollView>
  )
}
function HistoryEvent({
  event,
  onOpen,
}: { event: Event; onOpen: Props["onOpen"] }) {
  const original =
    event.stream === "STORE_ACCESS" &&
    event.source === "StaffAccessAuditEvent" &&
    ["STORE_ACCESS_CONFIRMED", "STORE_ACCESS_CHANGED"].includes(event.eventType)
      ? { kind: "staff_access" as const, eventId: event.id }
      : event.stream === "LIFECYCLE" &&
          event.source === "RetailOpsStaffLifecycleEvent" &&
          ["SUSPENDED", "REACTIVATED"].includes(event.eventType)
        ? { kind: "staff_status" as const, eventId: event.id }
        : null
  return (
    <ListCard>
      <View className="gap-3 py-3">
        <Text
          accessibilityRole="header"
          className="text-base font-bold text-foreground"
        >
          {human(event.eventType)}
        </Text>
        <Identity title="Subject" identity={event.subject} />
        <Identity title="Actor" identity={event.actor} />
        <Text>Recorded (UTC): {utc(event.at)}</Text>
        <Text>
          {event.stream === "LIFECYCLE"
            ? "Business membership"
            : "Recorded Store access"}{" "}
          · {event.source}
        </Text>
        {"revision" in event ? (
          <Text>Saved access revision: {event.revision}</Text>
        ) : null}
        {"reason" in event ? (
          <Text>Original reason: {event.reason || "Not recorded"}</Text>
        ) : (
          <Text>Original reason: Not recorded by this access command.</Text>
        )}
        {(["before", "after"] as const).map((side) => (
          <View key={side} className="gap-2 border-t border-border pt-3">
            <Text className="font-bold text-foreground">
              {side === "before" ? "Before" : "After"}
            </Text>
            {event.stream === "STORE_ACCESS" ? (
              <AccessSnapshot snapshot={event[side]} />
            ) : (
              <>
                <Text>Recorded role: {human(event[side].role)}</Text>
                <Text>Recorded status: {human(event[side].status)}</Text>
              </>
            )}
          </View>
        ))}
        {original ? (
          <ActionButton variant="outline" onPress={() => onOpen(original)}>
            Open original saved event
          </ActionButton>
        ) : (
          <Text>
            No separate supported original-event view for this event type.
          </Text>
        )}
      </View>
    </ListCard>
  )
}
function Identity({
  title,
  identity,
}: { title: string; identity: Event["subject"] }) {
  if (identity.coverage === "unavailable")
    return <Text>{title}: Unavailable in the current business directory.</Text>
  return (
    <View className="gap-1">
      <Text>
        {title}: {identity.name ?? "Name unavailable"}
        {identity.email ? ` · ${identity.email}` : ""}
      </Text>
      <Text className="text-xs text-muted-foreground">
        {identity.coverage === "historical_profile"
          ? "Identity label from a saved historical profile, not an original event snapshot."
          : "Current directory label, not an original event identity snapshot."}
      </Text>
    </View>
  )
}
function AccessSnapshot({ snapshot }: { snapshot: Snapshot }) {
  if (!snapshot || !("mode" in snapshot))
    return (
      <Text>
        {snapshot?.coverage === "not_recorded"
          ? "Original snapshot not recorded."
          : "Original snapshot unavailable."}
      </Text>
    )
  return (
    <View className="gap-2">
      <Text>Recorded access mode: {human(snapshot.mode)}</Text>
      <Text>Recorded business role: {human(snapshot.businessRole)}</Text>
      <Text>
        Recorded membership status: {human(snapshot.membershipStatus)}
      </Text>
      <Text>
        Recorded catalog editing:{" "}
        {snapshot.catalogEditor == null
          ? "Not recorded"
          : snapshot.catalogEditor
            ? "Allowed"
            : "Not allowed"}
      </Text>
      <Text>
        Starting Store:{" "}
        {snapshot.defaultStore?.name ?? "Not recorded or unavailable"}
      </Text>
      {snapshot.assignments == null ? (
        <Text>Store assignments not recorded.</Text>
      ) : snapshot.assignments.length ? (
        snapshot.assignments.map((row, index) => (
          <Text key={`${row.storeId}:${index}`}>
            {row.storeName} · {human(row.role)} ·{" "}
            {row.status ? human(row.status) : "Status not recorded"}
          </Text>
        ))
      ) : snapshot.hiddenStoreReferences ? (
        <Text>
          No original Store assignments are visible for this business.
        </Text>
      ) : (
        <Text>No Store assignments in this snapshot.</Text>
      )}
      {snapshot.hiddenStoreReferences ? (
        <Text>
          Some original Store references are unavailable in the current
          business.
        </Text>
      ) : null}
    </View>
  )
}
