import { Skeleton } from "@/components/ui/skeleton"
import { View } from "@/components/ui/view"
import { ActionButton } from "../../action-button"
import { EmptyState } from "../../empty-state"
import { HeroCard } from "../../green-till/hero-card"
import { ListCard, RecordRow, StatusPill } from "../../green-till/kit"
import type { StaffRow } from "../../staff/staff-model"

export function ClassicStaffHeader({
  loadedCount,
  used,
  limit,
  planName,
  loading,
  offline,
  updatedAt,
  onInvite,
  inviteDisabled,
}: {
  loadedCount: number
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
  return (
    <HeroCard
      label="Your team"
      amount={
        loading
          ? undefined
          : used === undefined || limit === undefined
            ? "—"
            : limit === null
              ? `${used} · no limit`
              : `${used} of ${limit}`
      }
      sub={
        used === undefined
          ? "Staff allowance is checked when you invite. Only the Owner or Admin can view billing usage."
          : `${planName ?? "Current plan"} · staff places used${offline && updatedAt ? ` · as of ${new Date(updatedAt).toLocaleString()}` : ""}`
      }
      progress={
        used !== undefined && typeof limit === "number" && limit > 0
          ? { done: used, total: limit }
          : undefined
      }
      pill={{
        label: offline ? "Saved copy" : `${loadedCount} loaded`,
        tone: offline ? "offline" : "synced",
      }}
    >
      {loading ? <Skeleton className="mt-4 h-10 w-full" /> : null}
      {onInvite ? (
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
}: { staff: StaffRow; onPress?: () => void }) {
  return (
    <ListCard>
      <RecordRow
        stackDetails
        onPress={onPress}
        title={staff.name}
        meta={`${staff.email} · ${staff.detail}`}
        avatar={{ initials: staff.initials, tint: "lilac" }}
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
    </ListCard>
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
