import { Icon, type IconKeys } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { ReferenceScreenShell } from "../../references/reference-screen-shell"
import { DESIGN_01_ROUTES } from "./design-01.data"

const previewSections: Array<{
  items: Array<{ icon: IconKeys; label: string }>
  title: string
}> = [
  {
    items: [
      { icon: "Warehouse", label: "Inventory" },
      { icon: "analytics", label: "Analytics" },
      { icon: "Users", label: "Team" },
      { icon: "User", label: "Customers" },
      { icon: "Wrench", label: "Service work" },
      { icon: "CreditCard", label: "Plan & billing" },
    ],
    title: "Store & workspace",
  },
  {
    items: [
      { icon: "AppWindow", label: "App theme" },
      { icon: "Lock", label: "App lock" },
      { icon: "RefreshCw", label: "Sync & offline" },
      { icon: "Download", label: "App updates" },
      { icon: "LogOut", label: "Sign out" },
    ],
    title: "Account settings",
  },
]

export function Design01AdminMorePreviewScreen() {
  return (
    <ReferenceScreenShell
      secondaryAccessibilityLabel="Open Admin Menu source image"
      secondaryHref={DESIGN_01_ROUTES.moreImage}
      secondaryIcon="Camera"
    >
      <View className="gap-7">
        <View className="flex-row items-center justify-between">
          <Text className="text-[34px] font-extrabold tracking-tight text-foreground">
            Menu
          </Text>
          <View className="flex-row items-center gap-3">
            <View className="size-12 items-center justify-center rounded-full border border-border bg-card">
              <Icon className="size-md text-foreground" name="Bell" />
            </View>
            <View className="size-12 items-center justify-center rounded-full bg-primary">
              <Text className="font-extrabold text-primary-foreground">EW</Text>
            </View>
          </View>
        </View>

        <View className="min-h-20 flex-row items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
          <View className="size-12 items-center justify-center rounded-full bg-primary">
            <Text className="font-extrabold text-primary-foreground">MS</Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-lg font-bold text-foreground">My Store</Text>
            <Text className="mt-0.5 text-sm text-muted-foreground">
              EwaTrade Store · Owner
            </Text>
          </View>
          <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
        </View>

        {previewSections.map((section) => (
          <View key={section.title}>
            <Text className="mb-2 text-xl font-extrabold text-foreground">
              {section.title}
            </Text>
            {section.items.map((item) => (
              <View className="min-h-16 flex-row items-center gap-4" key={item.label}>
                <View className="h-12 w-7 items-center justify-center">
                  <Icon
                    className="size-md text-muted-foreground"
                    name={item.icon}
                  />
                </View>
                <View className="min-w-0 flex-1 border-b border-border py-4">
                  <Text className="text-base font-semibold text-foreground">
                    {item.label}
                  </Text>
                </View>
                <View className="h-16 justify-center border-b border-border">
                  <Icon
                    className="size-sm text-muted-foreground"
                    name="ChevronRight"
                  />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ReferenceScreenShell>
  )
}
