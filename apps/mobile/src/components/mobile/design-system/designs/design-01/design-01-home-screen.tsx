import { Icon } from "@/components/ui/icon"
import { useColors } from "@/hooks/use-color"
import { View as RNView } from "react-native"
import { ReferenceBottomTabBar } from "../../references/reference-bottom-tab-bar"
import { ReferenceImmersiveScreenShell } from "../../references/reference-immersive-screen-shell"
import { Design01HomeContent } from "./design-01-home-content"
import { Design01HomeHero } from "./design-01-home-hero"
import {
  DESIGN_01_HOME_TAB,
  DESIGN_01_MESSAGES_TAB,
  DESIGN_01_ORDERS_TAB,
  DESIGN_01_PROFILE_TAB,
  DESIGN_01_ROUTES,
} from "./design-01.data"

export function Design01HomeScreen() {
  const colors = useColors()

  return (
    <ReferenceImmersiveScreenShell
      bottomTabBar={({ isHidden }) => (
        <ReferenceBottomTabBar
          activeLabel="Home"
          isHidden={isHidden}
          items={[
            DESIGN_01_HOME_TAB,
            DESIGN_01_ORDERS_TAB,
            {
              href: DESIGN_01_ROUTES.stock,
              icon: "Plus",
              label: "Add",
              render: ({ active }) => (
                <RNView
                  style={{
                    alignItems: "center",
                    height: 44,
                    justifyContent: "center",
                    overflow: "visible",
                    position: "relative",
                    width: 44,
                    zIndex: 10,
                  }}
                >
                  <RNView
                    style={{
                      alignItems: "center",
                      backgroundColor: colors.primary,
                      borderRadius: 999,
                      height: active ? 52 : 48,
                      justifyContent: "center",
                      position: "absolute",
                      top: -20,
                      width: active ? 52 : 48,
                      zIndex: 10,
                    }}
                  >
                    <Icon
                      className="size-base"
                      color={colors.primaryForeground}
                      name="Plus"
                    />
                  </RNView>
                </RNView>
              ),
            },
            DESIGN_01_MESSAGES_TAB,
            DESIGN_01_PROFILE_TAB,
          ]}
          referenceTone
        />
      )}
      hero={<Design01HomeHero />}
      secondaryAccessibilityLabel="Open source image for Design 01"
      secondaryHref={DESIGN_01_ROUTES.image}
      secondaryIcon="Camera"
      statusBarColor={colors.primary}
    >
      <Design01HomeContent />
    </ReferenceImmersiveScreenShell>
  )
}
