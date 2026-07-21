import {
  type MobileBottomTab,
  MobileBottomTabs,
} from "@/components/mobile/bottom-tabs"
import type { AdminTabDefinition } from "@/lib/admin-navigation"
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs"
import { View } from "react-native"

export function AdminTabBar({
  definitions,
  isHidden,
  navigation,
  onCreate,
  state,
}: BottomTabBarProps & {
  definitions: AdminTabDefinition[]
  isHidden: boolean
  onCreate: () => void
}) {
  const routeTabs = definitions.map((definition) => {
    const routeIndex = state.routes.findIndex(
      (route) => route.name === definition.routeName,
    )
    const route = state.routes[routeIndex]

    return {
      accessibilityLabel: definition.label,
      icon: definition.icon,
      isActive: routeIndex === state.index,
      kind: "navigation" as const,
      label: definition.label,
      onPress: () => {
        if (!route) return
        const event = navigation.emit({
          canPreventDefault: true,
          target: route.key,
          type: "tabPress",
        })
        if (routeIndex !== state.index && !event.defaultPrevented) {
          navigation.navigate(definition.routeName)
        }
      },
      testID: definition.testID,
    }
  })
  const tabs: MobileBottomTab[] = [
    ...routeTabs.slice(0, 2),
    {
      accessibilityLabel: "Open create options",
      icon: "Plus",
      kind: "action",
      label: "+",
      onPress: onCreate,
      testID: "admin-tab-create",
    },
    ...routeTabs.slice(2),
  ]

  return (
    <View
      pointerEvents="box-none"
      style={{ height: 0, overflow: "visible", zIndex: 1000 }}
      testID="admin-root-tab-dock"
    >
      <MobileBottomTabs
        floating
        haptic
        hideOnScroll
        isHidden={isHidden}
        labelStack="vertical"
        safeArea
        showLabel
        showLabelOnActive={false}
        tabs={tabs}
        variant="operational-detail"
      />
    </View>
  )
}
