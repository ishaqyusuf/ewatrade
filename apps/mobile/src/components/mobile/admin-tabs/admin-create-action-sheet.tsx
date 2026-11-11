import { FloatingActionRow } from "@/components/mobile/floating-action-row"
import { Modal, type useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useRouter } from "expo-router"

import {
  type AdminCreateAction,
  buildAdminCreateActions,
} from "@/lib/admin-create-actions"
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
  const auth = useAuthContext()
  const actions = buildAdminCreateActions(availability, isOffline, auth.profile)

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
  return (
    <View className="px-5 pb-6">
      <View className="mb-4 gap-1 px-1">
        <Text className="text-xs font-extrabold uppercase tracking-widest text-primary">
          Quick create
        </Text>
        <Text className="text-2xl font-extrabold tracking-tight text-foreground">
          What are you adding?
        </Text>
        <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
          Start your catalog or add someone to your store.
        </Text>
      </View>
      {actions.map((action) => (
        <FloatingActionRow
          {...action}
          key={action.label}
          onPress={() => onActionPress(action)}
        />
      ))}
    </View>
  )
}
