import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import { ListCard } from "../green-till/kit"
import {
  type NativeStaffOriginalTarget,
  readNativeStaffOriginalTarget,
} from "./native-staff-target"

type StatusRecord = RouterOutputs["retailOps"]["staffStatusReceipt"]
type AccessRecord = RouterOutputs["retailOps"]["staffAccessReceipt"]
type InvitationRecord = RouterOutputs["retailOps"]["staffInvitationCommand"]
const readOptions = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}
const label = (value: string | null | undefined) =>
  value ? value.toLowerCase().replaceAll("_", " ") : "Not recorded"
const utc = (value: Date | string | null | undefined) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : "Not recorded"

/** Exact originals only. Navigation IDs select a read, never authorize it. */
export function StaffOriginalScreen({ raw }: { raw: unknown }) {
  const target = readNativeStaffOriginalTarget(raw)
  const { profile } = useAuthContext()
  if (!target)
    return (
      <Notice>
        This original staff link is invalid. Go back and open the saved receipt
        again.
      </Notice>
    )
  if (!profile?.businessId || !["OWNER", "ADMIN"].includes(profile.role ?? ""))
    return (
      <Notice>
        Current Owner or Admin access is required for original staff records.
      </Notice>
    )
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
  return <OriginalTarget key={scope} target={target} />
}
function OriginalTarget({ target }: { target: NativeStaffOriginalTarget }) {
  if (target.kind === "staff_status")
    return <StatusOriginal eventId={target.eventId} />
  if (target.kind === "staff_access")
    return <AccessOriginal eventId={target.eventId} />
  return <InvitationOriginal commandId={target.commandId} />
}
function StatusOriginal({ eventId }: { eventId: string }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.retailOps.staffStatusReceipt.queryOptions({ eventId }, readOptions),
      mount,
    ),
  )
  return (
    <FreshRecord query={query} matches={(record) => record.eventId === eventId}>
      {(record) => <StatusContent record={record} />}
    </FreshRecord>
  )
}
function AccessOriginal({ eventId }: { eventId: string }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.retailOps.staffAccessReceipt.queryOptions({ eventId }, readOptions),
      mount,
    ),
  )
  return (
    <FreshRecord query={query} matches={(record) => record.eventId === eventId}>
      {(record) => <AccessContent record={record} />}
    </FreshRecord>
  )
}
function InvitationOriginal({ commandId }: { commandId: string }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.retailOps.staffInvitationCommand.queryOptions(
        { commandId },
        readOptions,
      ),
      mount,
    ),
  )
  return (
    <FreshRecord
      query={query}
      matches={(record) => record.receipt.commandId === commandId}
    >
      {(record) => <InvitationContent record={record} />}
    </FreshRecord>
  )
}
function FreshRecord<T>({
  query,
  matches,
  children,
}: {
  query: {
    isError: boolean
    isSuccess: boolean
    isFetching: boolean
    isPaused: boolean
    isFetchedAfterMount: boolean
    data: T | undefined
    refetch: () => unknown
  }
  matches: (record: T) => boolean
  children: (record: T) => ReactNode
}) {
  const fresh = freshShownRead(query)
  if (fresh.state === "checking")
    return <Notice>Checking your current access to the exact original…</Notice>
  if (fresh.state === "refused" || !matches(fresh.data))
    return (
      <View className="gap-4 p-5">
        <Text accessibilityRole="alert">
          This original staff record is unavailable for your current business or
          access.
        </Text>
        <ActionButton variant="outline" onPress={() => void query.refetch()}>
          Try again
        </ActionButton>
      </View>
    )
  return (
    <ScrollView
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 36 }}
    >
      {children(fresh.data)}
      <ActionButton variant="outline" onPress={() => void query.refetch()}>
        Refresh original
      </ActionButton>
    </ScrollView>
  )
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <View className="p-5">
      <Text className="text-sm text-muted-foreground">{children}</Text>
    </View>
  )
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ListCard>
      <View className="gap-2 py-3">
        <Text
          accessibilityRole="header"
          className="text-base font-bold text-foreground"
        >
          {title}
        </Text>
        {children}
      </View>
    </ListCard>
  )
}
function Fact({ name, value }: { name: string; value: string | number }) {
  return (
    <Text className="text-sm text-foreground">
      {name}: {value}
    </Text>
  )
}
function DirectoryIdentities({
  record,
}: { record: StatusRecord | AccessRecord }) {
  return (
    <Section title="Current directory identities">
      <Fact name="Staff" value={record.subject.name ?? "Unavailable"} />
      {record.subject.email ? <Text>{record.subject.email}</Text> : null}
      <Fact name="Recorded actor" value={record.actor.name ?? "Unavailable"} />
      {record.actor.email ? <Text>{record.actor.email}</Text> : null}
      <Text className="text-xs text-muted-foreground">
        Names and contacts are current same-business directory labels, not
        original identity snapshots.
      </Text>
    </Section>
  )
}
function StatusContent({ record: r }: { record: StatusRecord }) {
  return (
    <>
      <Section title="Original saved status">
        <Fact
          name="Before"
          value={`${label(r.before.status)} · ${label(r.before.role)}`}
        />
        <Fact
          name="After"
          value={`${label(r.after.status)} · ${label(r.after.role)}`}
        />
        <Fact name="Recorded (UTC)" value={utc(r.happenedAt)} />
        <Fact name="Original reason" value={r.reason ?? "Not recorded"} />
        <Text>
          Whole-business membership. This event does not describe a change to
          one Store grant.
        </Text>
      </Section>
      <DirectoryIdentities record={r} />
      <Section title="Current membership">
        <Text>
          {r.currentMembership
            ? `${label(r.currentMembership.status)} · ${label(r.currentMembership.role)} · access revision ${r.currentMembership.accessRevision}`
            : "Unavailable in the current business directory."}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Current membership is separate from the saved outcome. Original Store
          grants and historical identity snapshots are not recorded here.
        </Text>
        <Fact name="Checked (UTC)" value={utc(r.asOf)} />
      </Section>
    </>
  )
}
function AccessSnapshot({
  title,
  snapshot,
}: { title: string; snapshot: AccessRecord["before"] }) {
  return (
    <Section title={title}>
      {"mode" in snapshot ? (
        <>
          <Fact name="Access" value={label(snapshot.mode)} />
          <Fact
            name="Catalog editing"
            value={
              snapshot.catalogEditor === null ||
              snapshot.catalogEditor === undefined
                ? "Not recorded"
                : snapshot.catalogEditor
                  ? "Allowed"
                  : "Not allowed"
            }
          />
          {snapshot.businessRole || snapshot.membershipStatus ? (
            <Fact
              name="Membership"
              value={`${label(snapshot.membershipStatus)} · ${label(snapshot.businessRole)}`}
            />
          ) : null}
          {snapshot.assignments === null ||
          snapshot.assignments === undefined ? (
            <Text>Store assignments were not recorded.</Text>
          ) : snapshot.assignments.length ? (
            snapshot.assignments.map((row) => (
              <Text key={row.storeId}>
                {row.storeName} · {label(row.role)}
                {row.status ? ` · ${label(row.status)}` : ""}
                {row.storeId === snapshot.defaultStore?.id
                  ? " · starting Store"
                  : ""}
              </Text>
            ))
          ) : snapshot.coverage === "partial" ? (
            <Text>
              No original Store assignments are visible for this business.
            </Text>
          ) : (
            <Text>No Store assignments in this snapshot.</Text>
          )}
          <Fact
            name="Starting Store"
            value={snapshot.defaultStore?.name ?? "Not recorded or unavailable"}
          />
          {snapshot.coverage === "partial" ? (
            <Text className="text-xs text-muted-foreground">
              Some original Store references are unavailable in the current
              business.
            </Text>
          ) : null}
        </>
      ) : (
        <Text>
          This original snapshot is{" "}
          {snapshot.coverage === "not_recorded"
            ? "not recorded"
            : "unavailable"}
          .
        </Text>
      )}
    </Section>
  )
}
function AccessContent({ record: r }: { record: AccessRecord }) {
  return (
    <>
      <Section title="Original saved Store access">
        <Text>
          {r.operation === "scoped_access_confirmed"
            ? "Business-wide access replaced with selected Store roles"
            : "Store access changed"}{" "}
          · revision {r.revision}.
        </Text>
        <Fact name="Recorded (UTC)" value={utc(r.happenedAt)} />
        <Text className="text-xs text-muted-foreground">
          Roles and grants below come from the original snapshots. Store names
          are current directory labels.
        </Text>
      </Section>
      <AccessSnapshot title="Before" snapshot={r.before} />
      <AccessSnapshot title="After" snapshot={r.after} />
      <DirectoryIdentities record={r} />
      <Section title="Current membership">
        <Text>
          {r.currentMembership
            ? `${label(r.currentMembership.status)} · ${label(r.currentMembership.role)} · access revision ${r.currentMembership.accessRevision}`
            : "Unavailable in the current business directory."}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Original reason, historical names and service handover are not
          recorded by this access command. Current membership is separate from
          the saved outcome.
        </Text>
        <Fact name="Checked (UTC)" value={utc(r.asOf)} />
      </Section>
    </>
  )
}
const notificationLabels: Record<string, string> = {
  PENDING: "Queued",
  CLAIMED: "Preparing to send",
  SENDING: "Sending",
  SENT: "Provider accepted",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  OUTCOME_UNKNOWN: "Sending outcome unknown",
  CANCELLED: "Cancelled",
}
const deliveryFailureLabels: Record<string, string> = {
  PROVIDER_BOUNCED: "Delivery bounced",
  PROVIDER_FAILED: "Delivery failed",
  PROVIDER_SUPPRESSED: "Delivery suppressed",
  PROVIDER_COMPLAINED: "Reported as spam",
}
function InvitationContent({ record: r }: { record: InvitationRecord }) {
  const details = r.receipt.details
  return (
    <>
      <Section title="Original saved invitation">
        <Fact
          name="Command"
          value={
            r.receipt.kind === "REVOKE"
              ? "Revocation saved"
              : r.receipt.kind === "RESEND"
                ? "Replacement invitation saved"
                : "Invitation saved"
          }
        />
        <Fact name="Saved (UTC)" value={utc(r.savedAt)} />
        {details ? (
          <>
            <Fact
              name="Recipient"
              value={details.recipient.name ?? "Name not recorded"}
            />
            <Text>{details.recipient.email}</Text>
            <Fact
              name="Original grants"
              value={`${label(details.grants.role)} · ${label(details.grants.status)}`}
            />
            <Fact
              name="Catalog editing"
              value={details.grants.catalogEditor ? "Allowed" : "Not allowed"}
            />
            {details.grants.assignments.length ? (
              details.grants.assignments.map((row) => (
                <Text key={row.storeId}>
                  {row.storeName} · {label(row.role)}
                  {row.storeId === details.grants.defaultStoreId
                    ? " · starting Store"
                    : ""}
                </Text>
              ))
            ) : (
              <Text>No Store assignments recorded in this review.</Text>
            )}
            {details.membershipBefore ? (
              <Fact
                name="Membership before"
                value={`${label(details.membershipBefore.status)} · ${label(details.membershipBefore.role)} · access revision ${details.membershipBefore.accessRevision}`}
              />
            ) : (
              <Text>No previous membership in this business.</Text>
            )}
            {details.seats ? (
              <Fact
                name="Seats at review"
                value={`${details.seats.used} of ${details.seats.limit ?? "unlimited"}; ${details.seats.additional} additional`}
              />
            ) : null}
            {details.reason ? (
              <Fact name="Original reason" value={details.reason} />
            ) : null}
            <Text>
              {details.emailEffect === "REQUEST_INVITATION_EMAIL"
                ? "Invitation email requested. Saved or queued does not establish sending, delivery or acceptance."
                : "Link revoked and unsent work cancelled. An email already sending may arrive with an invalid link. Membership stays invited and its seat stays counted."}
            </Text>
            <Fact name="Reviewed (UTC)" value={utc(details.reviewedAt)} />
          </>
        ) : (
          <Text>
            Original review details were not recorded. Current facts below do
            not reconstruct the original grants.
          </Text>
        )}
      </Section>
      <Section title="Current invitation and delivery">
        <Fact
          name="Invitation"
          value={
            r.invitation.status === "ACTIVE"
              ? "Pending onboarding"
              : label(r.invitation.status)
          }
        />
        <Fact name="Expires (UTC)" value={utc(r.invitation.expiresAt)} />
        <Fact name="Accepted (UTC)" value={utc(r.invitation.acceptedAt)} />
        <Fact name="Revoked (UTC)" value={utc(r.invitation.revokedAt)} />
        <Fact
          name="Delivery"
          value={
            r.notification
              ? (notificationLabels[r.notification.status] ?? "Not recorded")
              : "Not requested"
          }
        />
        <Fact
          name="Provider accepted (UTC)"
          value={utc(r.notification?.sentAt)}
        />
        {r.notification?.failureCode &&
        deliveryFailureLabels[r.notification.failureCode] ? (
          <Fact
            name="Delivery update"
            value={
              deliveryFailureLabels[r.notification.failureCode] ?? "Unavailable"
            }
          />
        ) : null}
        <Fact name="Delivered (UTC)" value={utc(r.notification?.deliveredAt)} />
        <Text className="text-xs text-muted-foreground">
          Provider acceptance, delivery and staff onboarding are separate
          states. An unknown outcome must not be retried as a new invitation.
        </Text>
      </Section>
      <Section title="Current membership">
        <Text>
          {label(r.membership.status)} · {label(r.membership.role)} · access
          revision {r.membership.staffAccessRevision}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Current membership does not rewrite the original reviewed invitation.
        </Text>
      </Section>
    </>
  )
}
