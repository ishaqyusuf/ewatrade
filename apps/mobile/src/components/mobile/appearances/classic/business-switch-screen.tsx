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
      sub={`${count} available ${count === 1 ? "business" : "businesses"} · choose where to work`}
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
    // Unpadded clipped card: the row owns its padding, so the selected tint
    // fills the card to its rounded edges; each row is its own card, so no
    // divider line on top.
    <View className="overflow-hidden rounded-[20px] bg-card">
      <SecondaryOperationalRow
        className="border-t-0 px-4"
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
