import { Alert, ScrollView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useRouter } from "expo-router"

import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme } from "@/hooks/use-color"
import {
  type AdminManagementRole,
  type AdminMoreItem,
  buildAdminMoreSections,
  canAccessAdminTabs,
} from "@/lib/admin-navigation"
import { getMobileRoleLabel, normalizeMobileRole } from "@/lib/mobile-roles"
import {
  type ThemeOverride,
  setThemeOverride,
} from "@/lib/theme-preference"
import { useAdminTabs, useResetAdminDock } from "./admin-tabs-context"

function initials(value: string | null | undefined) {
  const parts = value?.trim().split(/\s+/).filter(Boolean) ?? []
  if (parts.length === 0) return "EW"
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

function MenuRow({
  detail,
  item,
  onPress,
}: {
  detail?: string
  item: AdminMoreItem
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityHint={detail}
      accessibilityRole="button"
      accessibilityState={{ disabled: item.disabled }}
      className={
        item.disabled
          ? "min-h-16 flex-row items-stretch gap-3 opacity-55"
          : "min-h-16 flex-row items-stretch gap-3 active:bg-accent"
      }
      haptic
      onPress={onPress}
      transition
    >
      <View className="w-9 justify-center">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-muted">
          <Icon className="size-sm text-muted-foreground" name={item.icon} />
        </View>
      </View>
      <View className="min-w-0 flex-1 flex-row items-center gap-3 border-b border-border py-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground">{item.label}</Text>
          {detail ? (
            <Text className="text-sm leading-5 text-muted-foreground">
              {detail}
            </Text>
          ) : null}
        </View>
        <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
      </View>
    </Pressable>
  )
}

function ThemeOption({
  label,
  onPress,
  selected,
  value,
}: {
  label: string
  onPress: (value: ThemeOverride) => void
  selected: boolean
  value: ThemeOverride
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} app theme`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      className="min-h-16 flex-row items-center gap-4 border-t border-border py-3"
      haptic
      onPress={() => onPress(value)}
    >
      <View
        className={
          selected
            ? "size-10 items-center justify-center rounded-full bg-primary"
            : "size-10 items-center justify-center rounded-full bg-muted"
        }
      >
        <Icon
          className={
            selected
              ? "size-sm text-primary-foreground"
              : "size-sm text-muted-foreground"
          }
          name={selected ? "Check" : "AppWindow"}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-bold text-foreground">{label}</Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          {value === "system"
            ? "Follow this device"
            : `Always use ${value} appearance`}
        </Text>
      </View>
    </Pressable>
  )
}

export function AdminMoreScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const auth = useAuthContext()
  const { setColorScheme, themeOverride } = useColorScheme()
  const { availability, syncAlertCount } = useAdminTabs()
  useResetAdminDock()
  const themeModal = useModal()
  const normalizedRole = normalizeMobileRole(auth.profile?.role)
  const role: AdminManagementRole =
    normalizedRole === "ADMIN" || normalizedRole === "MANAGER"
      ? normalizedRole
      : "OWNER"
  const sections = buildAdminMoreSections({ availability, role })

  async function selectTheme(value: ThemeOverride) {
    setColorScheme(value)
    await setThemeOverride(value)
    themeModal.dismiss()
  }

  function handleItem(item: AdminMoreItem) {
    if (item.disabled) {
      Alert.alert(
        "Add a Product first",
        "Inventory becomes available after this workspace has a Product.",
      )
      return
    }
    if (item.action.kind === "route") {
      router.push(item.action.href)
      return
    }
    if (item.action.kind === "theme") {
      themeModal.present()
      return
    }
    Alert.alert(
      "Sign out?",
      syncAlertCount > 0
        ? `${syncAlertCount} unsynced ${syncAlertCount === 1 ? "change remains" : "changes remain"} on this device. Signing out will not silently clear the queue.`
        : "You will need to sign in again to access this workspace.",
      [
        { style: "cancel", text: "Cancel" },
        { onPress: auth.signOutLocal, style: "destructive", text: "Sign out" },
      ],
    )
  }

  if (!canAccessAdminTabs(auth.profile?.role)) return null

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom + 116, 152),
          paddingHorizontal: 24,
          paddingTop: insets.top + 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-7 flex-row items-center justify-between">
          <Text className="text-[34px] font-extrabold tracking-tight text-foreground">
            Menu
          </Text>
          <View className="flex-row items-center gap-3">
            <Pressable
              accessibilityLabel={
                syncAlertCount > 0
                  ? `Open sync status, ${syncAlertCount} items need attention`
                  : "Open sync status"
              }
              accessibilityRole="button"
              className="relative size-12 items-center justify-center rounded-full border border-border bg-card"
              haptic
              onPress={() => router.push("/sync-status-modal")}
            >
              <Icon className="size-md text-foreground" name="Bell" />
              {syncAlertCount > 0 ? (
                <View className="absolute right-1.5 top-1.5 size-3 rounded-full border-2 border-card bg-destructive" />
              ) : null}
            </Pressable>
            <View
              accessibilityLabel={`${auth.profile?.name ?? "User"} profile`}
              className="size-12 items-center justify-center rounded-full bg-primary"
            >
              <Text className="font-extrabold text-primary-foreground">
                {initials(auth.profile?.name)}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          accessibilityLabel={`Switch business from ${auth.profile?.businessName ?? "current workspace"}`}
          accessibilityRole="button"
          className="mb-7 min-h-20 flex-row items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 active:bg-accent"
          haptic
          onPress={() => router.push("/business-switch-modal")}
        >
          <View className="size-12 items-center justify-center rounded-full bg-primary">
            <Text className="font-extrabold text-primary-foreground">
              {initials(auth.profile?.businessName)}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-lg font-bold text-foreground">My Store</Text>
            <Text className="mt-0.5 text-sm text-muted-foreground" numberOfLines={1}>
              {auth.profile?.businessName ?? "Business"} · {getMobileRoleLabel(auth.profile?.role)}
            </Text>
          </View>
          <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
        </Pressable>

        {sections.map((section) => (
          <View className="mb-7" key={section.id}>
            <Text className="mb-2 text-xl font-extrabold text-foreground">
              {section.title}
            </Text>
            {section.items.map((item) => (
              <MenuRow
                detail={
                  item.id === "inventory" && item.disabled
                    ? "Add a Product to enable inventory"
                    : undefined
                }
                item={item}
                key={item.id}
                onPress={() => handleItem(item)}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      <Modal
        accessibilityLabel="App theme"
        ref={themeModal.ref}
        snapPoints={["40%"]}
        title="App theme"
      >
        <View className="px-5 pb-6">
          {(["system", "light", "dark"] as const).map((value) => (
            <ThemeOption
              key={value}
              label={value.charAt(0).toUpperCase() + value.slice(1)}
              onPress={selectTheme}
              selected={themeOverride === value}
              value={value}
            />
          ))}
        </View>
      </Modal>
    </View>
  )
}
