import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { SecondaryOperationalRow } from "../../secondary-operations"
import { StatusBadge } from "../../status-badge"
import { EmptyState } from "../../empty-state"
import type { StaffRow } from "../../staff/staff-model"

export function ClassicStaffHeader({ loadedCount }: { loadedCount: number }) {
  return (
    <View className="gap-2 px-2 pb-4">
      <Text className="text-sm leading-5 text-muted-foreground">
        Give attendants their own access to orders and stock work.
      </Text>
      <Text className="text-xs text-muted-foreground">
        {loadedCount} loaded attendants · Not total staff usage
      </Text>
    </View>
  )
}

export function ClassicStaffRow({ staff }: { staff: StaffRow }) {
  return (
    <SecondaryOperationalRow
      detail={staff.detail}
      icon="User"
      metadata={staff.email}
      title={staff.name}
      trailing={
        <StatusBadge
          label={staff.statusLabel}
          tone={
            staff.statusLabel === "Active"
              ? "success"
              : staff.statusLabel === "Suspended"
                ? "destructive"
                : "warning"
          }
        />
      }
    />
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
      actionLabel={onInvite ? "Invite first attendant" : undefined}
      actionProps={{
        icon: "Plus",
        onPress: onInvite,
        testID: "staff-add-first-action",
      }}
    />
  )
}
