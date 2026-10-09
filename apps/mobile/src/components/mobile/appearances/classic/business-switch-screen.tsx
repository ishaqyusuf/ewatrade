import { View } from "@/components/ui/view"
import { getBusinessSwitchRowPresentation } from "../../business-switch-presentation"
import type {
  WorkspaceHeaderProps,
  WorkspaceRowProps,
} from "../../business-switch/business-switch-view"
import { SecondaryOperationalRow } from "../../secondary-operations"
import { SettingsScreen } from "../../settings-screen"
import { StatusBadge } from "../../status-badge"

export function ClassicWorkspaceHeader({
  count,
  currentName,
}: WorkspaceHeaderProps) {
  return (
    <SettingsScreen
      title={currentName}
      sub={`${count} available businesses · choose where to work`}
    />
  )
}
export function ClassicWorkspaceRow({
  business,
  currentBusinessId,
  onPress,
  disabled,
  busy,
}: WorkspaceRowProps) {
  const row = getBusinessSwitchRowPresentation(business, currentBusinessId)
  return (
    <View className="rounded-[20px] bg-card px-4">
      <SecondaryOperationalRow
        title={business.name}
        detail={row.detail}
        metadata={row.metadata}
        icon="Building2"
        selected={row.selected}
        disabled={disabled}
        onPress={row.canActivate ? onPress : undefined}
        trailing={
          <StatusBadge
            icon={row.selected ? "CircleCheck" : "Building2"}
            label={busy ? "Checking…" : row.badgeLabel}
            tone={row.selected ? "primary" : "muted"}
          />
        }
      />
    </View>
  )
}
