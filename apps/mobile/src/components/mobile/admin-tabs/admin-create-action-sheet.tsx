import { RowDivider } from "@/components/mobile/green-till/kit"
import { StatusBadge } from "@/components/mobile/status-badge"
import { Icon } from "@/components/ui/icon"
import { Modal, type useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useRouter } from "expo-router"

import {
  type AdminCreateAction,
  buildAdminCreateActions,
} from "@/lib/admin-create-actions"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
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
  const auth = useAuthContext()
  const actions = buildAdminCreateActions(availability, isOffline, auth.profile)

  function openRoute(route: string) {
    modal.dismiss()
    requestAnimationFrame(() => router.push(route as never))
  }

  // Sized to its content so every choice shows without scrolling; at large
  // text the Modal caps it to the screen and the list scrolls.
  return (
    <Modal
      accessibilityLabel="Create"
      enableDynamicSizing
      hideHeader
      ref={modal.ref}
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

const CATALOG_TINTS = {
  Goods: {
    chip: "bg-tint-mint-foreground/15",
    tint: "mint",
    fg: "text-tint-mint-foreground",
    surface: "bg-tint-mint",
  },
  Services: {
    chip: "bg-tint-sky-foreground/15",
    tint: "sky",
    fg: "text-tint-sky-foreground",
    surface: "bg-tint-sky",
  },
} as const

export function AdminCreateActionContent({
  actions,
  onActionPress,
}: {
  actions: AdminCreateAction[]
  onActionPress: (action: AdminCreateAction) => void
}) {
  const largeTextLayout = useLargeTextLayout()
  const catalog = actions.filter((action) => action.emphasis === "catalog")
  const others = actions.filter((action) => action.emphasis !== "catalog")
  return (
    <View className="gap-3 px-4 pb-5">
      <Text
        accessibilityRole="header"
        className="px-1 pb-1 text-xl font-extrabold tracking-tight [-rn-line-height:28] text-foreground"
      >
        What are you adding?
      </Text>
      {catalog.length ? (
        <View className={largeTextLayout ? "gap-3" : "flex-row gap-3"}>
          {catalog.map((action) => (
            <CatalogTile
              action={action}
              key={action.label}
              onPress={() => onActionPress(action)}
            />
          ))}
        </View>
      ) : null}
      {others.length ? (
        <View className="overflow-hidden rounded-[20px] bg-background">
          {others.map((action, index) => (
            <CreateRow
              action={action}
              divider={index > 0}
              key={action.label}
              onPress={() => onActionPress(action)}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

function CatalogTile({
  action,
  onPress,
}: {
  action: AdminCreateAction
  onPress: () => void
}) {
  const largeTextLayout = useLargeTextLayout()
  const { colorScheme } = useColorScheme()
  const tint =
    CATALOG_TINTS[action.label as keyof typeof CATALOG_TINTS] ??
    CATALOG_TINTS.Goods
  return (
    <Pressable
      accessibilityHint={action.detail}
      accessibilityLabel={action.label}
      accessibilityRole="button"
      accessibilityState={{ disabled: action.disabled }}
      className={cn(
        "min-h-[132px] gap-4 rounded-[20px] p-4",
        largeTextLayout ? "w-full" : "flex-1",
        tint.surface,
        action.disabled && "opacity-60",
      )}
      disabled={action.disabled}
      haptic
      onPress={onPress}
    >
      <View className="flex-row items-start justify-between gap-2">
        <View
          className={cn(
            "size-11 items-center justify-center rounded-2xl",
            tint.chip,
          )}
        >
          {/* Icon takes its colour as a prop; tint text classes don't reach it. */}
          <Icon
            className="size-[22px]"
            color={GREEN_TILL_THEME[colorScheme][`${tint.tint}Foreground`]}
            name={action.icon}
          />
        </View>
        {action.disabled && action.statusLabel ? (
          <StatusBadge label={action.statusLabel} tone="warning" />
        ) : null}
      </View>
      <View className="gap-0.5">
        <Text
          className={cn(
            "text-lg font-extrabold tracking-tight [-rn-line-height:24]",
            tint.fg,
          )}
        >
          {action.label}
        </Text>
        <Text
          className={cn("text-xs [-rn-line-height:18] opacity-80", tint.fg)}
        >
          {action.detail}
        </Text>
      </View>
    </Pressable>
  )
}

function CreateRow({
  action,
  divider,
  onPress,
}: {
  action: AdminCreateAction
  divider: boolean
  onPress: () => void
}) {
  const largeTextLayout = useLargeTextLayout()
  const locked = action.disabled && action.statusLabel
  return (
    <Pressable
      accessibilityHint={action.detail}
      accessibilityLabel={action.label}
      accessibilityRole="button"
      accessibilityState={{ disabled: action.disabled }}
      className={cn(
        "min-h-16 flex-row gap-3 px-3.5 py-3",
        largeTextLayout ? "items-start" : "items-center",
        action.disabled && !action.statusLabel && "opacity-50",
      )}
      disabled={action.disabled}
      haptic
      onPress={onPress}
    >
      {divider ? <RowDivider position="top" /> : null}
      <View
        className={cn(
          "size-10 items-center justify-center rounded-xl bg-card",
          largeTextLayout && "mt-0.5",
        )}
      >
        <Icon
          className={cn(
            "size-[20px]",
            locked ? "text-muted-foreground" : "text-primary",
          )}
          name={action.icon}
        />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className={cn(
            "text-base font-bold [-rn-line-height:22]",
            locked ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {action.label}
        </Text>
        <Text className="text-xs [-rn-line-height:18] text-muted-foreground">
          {action.detail}
        </Text>
      </View>
      {locked ? (
        <StatusBadge
          className={largeTextLayout ? "mt-1" : undefined}
          label={action.statusLabel as string}
          tone="warning"
        />
      ) : (
        <Icon
          className={cn(
            "size-[18px] text-muted-foreground",
            largeTextLayout && "mt-1",
          )}
          name="ChevronRight"
        />
      )}
    </Pressable>
  )
}
