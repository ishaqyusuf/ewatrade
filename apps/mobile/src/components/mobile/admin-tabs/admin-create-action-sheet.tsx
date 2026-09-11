import { Icon } from "@/components/ui/icon"
import { Modal, type useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useRouter } from "expo-router"

import { StatusBadge } from "@/components/mobile/status-badge"
import {
  type AdminCreateAction,
  buildAdminCreateActions,
} from "@/lib/admin-create-actions"
import { cn } from "@/lib/utils"
import type { MobileWorkspaceFeatureAvailability } from "@/lib/workspace-feature-availability"

type AdminCreateActionSheetProps = {
  availability: MobileWorkspaceFeatureAvailability
  isOffline: boolean
  modal: ReturnType<typeof useModal>
}

export function AdminCreateActionSheet({
  availability,
  isOffline,
  modal,
}: AdminCreateActionSheetProps) {
  const router = useRouter()
  const largeTextLayout = useLargeTextLayout()
  const actions = buildAdminCreateActions(availability, isOffline)

  function openRoute(route: string) {
    modal.dismiss()
    requestAnimationFrame(() => router.push(route as never))
  }

  return (
    <Modal
      accessibilityLabel="Create"
      hideHeader
      ref={modal.ref}
      snapPoints={
        largeTextLayout ? ["92%"] : [actions.length > 5 ? "64%" : "56%"]
      }
    >
      <BottomSheetScrollView showsVerticalScrollIndicator={false}>
        <AdminCreateActionContent
          actions={actions}
          onActionPress={(action) => openRoute(action.route)}
        />
      </BottomSheetScrollView>
    </Modal>
  )
}

export function AdminCreateActionContent({
  actions,
  onActionPress,
}: {
  actions: AdminCreateAction[]
  onActionPress: (action: AdminCreateAction) => void
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <View className="px-5 pb-6">
      <View className="mb-4 gap-1 px-1">
        <Text className="text-xs font-extrabold uppercase tracking-widest text-primary">
          Quick create
        </Text>
        <Text className="text-2xl font-extrabold tracking-tight text-foreground">
          What are you adding?
        </Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          Start your catalog or add someone to your store.
        </Text>
      </View>
      {actions.map((action) => (
        <Pressable
          accessibilityHint={action.detail}
          accessibilityRole="button"
          accessibilityState={{ disabled: action.disabled }}
          className={cn(
            "-mx-2 min-h-16 flex-row gap-3 border-t border-border px-3 py-3",
            largeTextLayout ? "items-start" : "items-center",
            action.emphasis === "catalog" &&
              !action.disabled &&
              "bg-primary/5 active:bg-primary/10",
            action.emphasis === "standard" &&
              !action.disabled &&
              "active:bg-accent",
          )}
          disabled={action.disabled}
          haptic
          key={action.label}
          onPress={() => onActionPress(action)}
          transition
        >
          <View
            className={cn(
              "size-10 items-center justify-center rounded-full",
              largeTextLayout && "mt-1",
              action.emphasis === "catalog" && !action.disabled
                ? "bg-primary"
                : "bg-muted",
            )}
          >
            <Icon
              className={cn(
                "size-sm",
                action.emphasis === "catalog" && !action.disabled
                  ? "text-primary-foreground"
                  : "text-muted-foreground",
              )}
              name={action.icon}
            />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="font-extrabold text-foreground">
              {action.label}
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              {action.detail}
            </Text>
          </View>
          {action.disabled && action.statusLabel ? (
            <StatusBadge
              className={largeTextLayout ? "mt-1" : undefined}
              label={action.statusLabel}
              tone="warning"
            />
          ) : (
            <Icon
              className={cn(
                "size-sm text-muted-foreground",
                largeTextLayout && "mt-1",
              )}
              name="ChevronRight"
            />
          )}
        </Pressable>
      ))}
    </View>
  )
}
