import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  BUSINESS_SWITCH_COPY,
  getBusinessSwitchRowPresentation,
} from "../../business-switch-presentation"
import type {
  WorkspaceHeaderProps,
  WorkspaceRowProps,
} from "../../business-switch/business-switch-view"
import { SecondaryOperationalRow } from "../../secondary-operations"
import { StatusBadge } from "../../status-badge"

export function ClassicWorkspaceHeader({ count }: WorkspaceHeaderProps) {
  return (
    <View className="gap-4 pb-5">
      <Text className="text-sm leading-5 text-muted-foreground">
        {BUSINESS_SWITCH_COPY.description}
      </Text>
      <Text className="text-base font-bold text-foreground">
        Your businesses · {count}
      </Text>
    </View>
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
  )
}
