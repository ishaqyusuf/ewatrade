import { Skeleton } from "@/components/ui/skeleton"
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
  /** Market Day shows it; Classic counts active and pending instead. */
  loadedCount?: number
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
        meta={
          staff.email && staff.email !== staff.name
            ? [staff.email, staff.detail]
            : staff.detail
        }
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
      {last ? null : <RowDivider />}
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
