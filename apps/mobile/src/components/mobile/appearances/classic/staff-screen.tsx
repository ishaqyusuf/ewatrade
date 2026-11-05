import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import { ActionButton } from "../../action-button"
import { EmptyState } from "../../empty-state"
import { HeroCard } from "../../green-till/hero-card"
import { RecordRow, RowDivider, StatusPill } from "../../green-till/kit"
import type { StaffRow } from "../../staff/staff-model"

export function ClassicStaffHeader({
  activeCount = 0,
  pendingCount = 0,
  used,
  limit,
  planName,
  loading,
  offline,
  updatedAt,
  onInvite,
  inviteDisabled,
  onSeePlans,
}: {
  activeCount?: number
  pendingCount?: number
  /** At the limit the hero button becomes See plans. */
  onSeePlans?: () => void
  used?: number
  /** `null` means the plan has no staff limit. */
  limit?: number | null
  planName?: string
  loading?: boolean
  offline?: boolean
  updatedAt?: number
  onInvite?: () => void
  inviteDisabled?: boolean
}) {
  const full = used !== undefined && typeof limit === "number" && used >= limit
  const team = [
    `${activeCount} active`,
    ...(pendingCount ? [`${pendingCount} waiting to accept`] : []),
  ].join(" · ")
  return (
    <HeroCard
      label={
        used === undefined
          ? "Your team"
          : `${planName ?? "Your plan"} · staff places`
      }
      amount={
        loading
          ? undefined
          : used === undefined || limit === undefined
            ? `${activeCount + pendingCount} staff`
            : limit === null
              ? `${used} staff · no limit`
              : `${used} of ${limit} used`
      }
      sub={
        offline && updatedAt
          ? `${team} · as of ${new Date(updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
          : team
      }
      progress={
        used !== undefined && typeof limit === "number" && limit > 0
          ? { done: used, total: limit }
          : undefined
      }
      pill={
        offline
          ? { label: "Offline", tone: "offline" }
          : full
            ? { label: "Full", tone: "draft" }
            : undefined
      }
    >
      {loading ? <Skeleton className="mt-4 h-10 w-full" /> : null}
      {full && onSeePlans ? (
        <View className="mt-4">
          <ActionButton tone="cream" icon="Sparkles" onPress={onSeePlans}>
            See plans for more places
          </ActionButton>
        </View>
      ) : onInvite ? (
        <View className="mt-4">
          <ActionButton
            tone="cream"
            icon="UserPlus"
            onPress={onInvite}
            disabled={inviteDisabled}
          >
            Invite sales rep
          </ActionButton>
        </View>
      ) : null}
    </HeroCard>
  )
}
export function ClassicStaffRow({
  staff,
  onPress,
  first = true,
  last = true,
}: {
  staff: StaffRow
  onPress?: () => void
  /** Rows of one group share a card: first rounds the top, last the bottom. */
  first?: boolean
  last?: boolean
}) {
  return (
    <View
      className={cn(
        "overflow-hidden bg-card px-3.5",
        first && "rounded-t-[20px]",
        last && "rounded-b-[20px]",
      )}
    >
      <RecordRow
        stackDetails
        onPress={onPress}
        title={staff.name}
        meta={[
          ...[staff.email, staff.phone].filter(
            (contact) => contact && contact !== staff.name,
          ),
          staff.detail,
        ]}
        avatar={{
          initials: staff.initials,
          tint: staff.statusLabel === "Pending" ? "amber" : "lilac",
        }}
        status={
          <StatusPill
            label={staff.statusLabel}
            tone={
              staff.statusLabel === "Active"
                ? "ok"
                : staff.statusLabel === "Suspended"
                  ? "danger"
                  : "warn"
            }
          />
        }
      />
      {staff.whatsapp ? <WhatsAppDeliveryChip state={staff.whatsapp} /> : null}
      {last ? null : <RowDivider />}
    </View>
  )
}

/** Workshop staff-invite-channels 01: WhatsApp state of a pending invite. */
function WhatsAppDeliveryChip({
  state,
}: { state: NonNullable<StaffRow["whatsapp"]> }) {
  const failed = state === "failed"
  return (
    <View className="flex-row pb-3 pl-14">
      <View
        className={cn(
          "flex-row items-center gap-1.5 rounded-full px-2.5 py-1",
          failed ? "bg-destructive/10" : "bg-primary/10",
        )}
      >
        <Icon
          className={cn(
            "size-[13px]",
            failed ? "text-destructive" : "text-primary",
          )}
          name={failed ? "TriangleAlert" : state === "sent" ? "Check" : "Clock"}
        />
        <Text
          className={cn(
            "text-xs font-semibold",
            failed ? "text-destructive" : "text-foreground",
          )}
        >
          {failed
            ? "WhatsApp not delivered"
            : state === "sent"
              ? "WhatsApp sent"
              : "WhatsApp not confirmed"}
        </Text>
      </View>
    </View>
  )
}

export function ClassicStaffEmpty({
  title,
  message,
  onInvite,
}: { title: string; message: string; onInvite?: () => void }) {
  return (
    <EmptyState
      title={title}
      message={message}
      icon="Users"
      variant="flat"
      className="flex-1 justify-center px-6 pb-16"
      actionLabel={onInvite ? "Invite first sales rep" : undefined}
      actionProps={{
        icon: "Plus",
        onPress: onInvite,
        testID: "staff-add-first-action",
      }}
    />
  )
}
